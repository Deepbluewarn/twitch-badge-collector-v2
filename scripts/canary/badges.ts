/**
 * chzzk 배지 인벤토리 canary — 여러 채널 방문 → 배지 이미지 fetch → sha256 hash →
 * hash 기반 dedup으로 인벤토리 갱신.
 *
 * URL만 다르고 이미지 같은 배지는 latestUrl 갱신 + urls 이력에 추가만. 새 이미지면
 * 신규 배지로 등록 + Discord 알림.
 *
 * env:
 *  - DISCORD_CANARY_WEBHOOK
 *  - BADGE_TOTAL (기본 100)
 *  - BADGE_PARALLEL (기본 8)
 *  - BADGE_BATCH_DELAY_MS (기본 3000)
 */
import { chromium, type BrowserContext } from '@playwright/test';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import bundledManifest from '../../src/platform/bundled-selectors.prod.json' with { type: 'json' };
import type { BadgeInventory, BadgeInventoryV1, BadgeEntry } from './snapshot-types.ts';
import { visitChannel } from './visit-channel.ts';
import { discoverChannels } from './discover-channels.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');
const SNAPSHOT_DIR = join(REPO_ROOT, 'snapshots');
const INVENTORY_FILE = join(SNAPSHOT_DIR, 'chzzk-badges.json');

const TOTAL = Math.max(1, parseInt(process.env.BADGE_TOTAL ?? '100', 10));
const PARALLEL = Math.max(1, parseInt(process.env.BADGE_PARALLEL ?? '8', 10));
const BATCH_DELAY_MS = Math.max(0, parseInt(process.env.BADGE_BATCH_DELAY_MS ?? '3000', 10));

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/**
 * URL → sha256 hex. 실패 시 null.
 */
async function hashImage(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!res.ok) return null;
        const buf = new Uint8Array(await res.arrayBuffer());
        return createHash('sha256').update(buf).digest('hex');
    } catch {
        return null;
    }
}

function isV1(inv: unknown): inv is BadgeInventoryV1 {
    return typeof inv === 'object' && inv !== null
        && (inv as { version?: number }).version === 1
        && 'entries' in (inv as object);
}

function isV2(inv: unknown): inv is BadgeInventory {
    return typeof inv === 'object' && inv !== null
        && (inv as { version?: number }).version === 2
        && 'badges' in (inv as object);
}

function emptyV2(): BadgeInventory {
    return { version: 2, updatedAt: new Date().toISOString(), badges: {} };
}

/**
 * 파일에서 로드. v1이면 각 URL을 hash해서 v2로 마이그레이션. 실패한 URL은 drop.
 */
async function loadInventory(): Promise<BadgeInventory> {
    if (!existsSync(INVENTORY_FILE)) return emptyV2();
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(INVENTORY_FILE, 'utf-8')); }
    catch { return emptyV2(); }

    if (isV2(raw)) {
        // v2도 옛 subscription entry 남아있을 수 있음 → filter
        for (const hash of Object.keys(raw.badges)) {
            const e = raw.badges[hash];
            e.urls = e.urls.filter(u => !u.url.includes('/glive/subscription/'));
            if (e.urls.length === 0) delete raw.badges[hash];
        }
        return raw;
    }
    if (isV1(raw)) {
        console.log(`[badges] v1 인벤토리 감지 — ${Object.keys(raw.entries).length}개 URL 재해싱하며 마이그레이션`);
        const v2: BadgeInventory = emptyV2();
        for (const [url, meta] of Object.entries(raw.entries)) {
            if (url.includes('/glive/subscription/')) continue;
            const hash = await hashImage(url);
            if (!hash) {
                console.warn(`[badges] 마이그레이션 hash 실패, drop: ${url}`);
                continue;
            }
            const existing = v2.badges[hash];
            if (existing) {
                existing.seenCount += meta.seenCount;
                existing.urls.push({
                    url,
                    firstSeenAt: meta.firstSeenAt,
                    lastSeenAt: meta.lastSeenAt,
                });
                if (meta.lastSeenAt > existing.lastSeenAt) {
                    existing.lastSeenAt = meta.lastSeenAt;
                    existing.latestUrl = url;
                }
                if (meta.firstSeenAt < existing.firstSeenAt) {
                    existing.firstSeenAt = meta.firstSeenAt;
                }
            } else {
                v2.badges[hash] = {
                    firstSeenAt: meta.firstSeenAt,
                    lastSeenAt: meta.lastSeenAt,
                    seenCount: meta.seenCount,
                    latestUrl: url,
                    urls: [{ url, firstSeenAt: meta.firstSeenAt, lastSeenAt: meta.lastSeenAt }],
                };
            }
        }
        console.log(`[badges] 마이그레이션 완료 → ${Object.keys(v2.badges).length}개 unique 배지`);
        return v2;
    }
    // 알 수 없는 스키마 — 새로 시작
    return emptyV2();
}

function saveInventory(inv: BadgeInventory) {
    if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });
    inv.updatedAt = new Date().toISOString();
    writeFileSync(INVENTORY_FILE, JSON.stringify(inv, null, 2) + '\n', 'utf-8');
}

async function notifyDiscord(content: string) {
    const url = process.env.DISCORD_CANARY_WEBHOOK;
    if (!url) { console.log('[badges] webhook 미설정 — 콘솔만'); console.log(content); return; }
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.slice(0, 1900) }),
    });
    if (!res.ok) console.error(`[badges] Discord fail: ${res.status}`);
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: UA, locale: 'ko-KR' });

    try {
        const channelIds = await discoverChannels(context, { max: TOTAL });
        if (channelIds.length === 0) {
            console.error('[badges] 방문할 채널 없음');
            process.exit(2);
        }
        const totalBatches = Math.ceil(channelIds.length / PARALLEL);
        console.log(`[badges] ${channelIds.length}개 채널 (batch of ${PARALLEL}, 총 ${totalBatches} batches)`);

        const selectors = bundledManifest.platforms.chzzk.selectors;
        const requiredList = ['chatRoomLive', 'displayName', 'messageText', 'usernameContainer', 'badge'];

        // 배치 loop — visit-channel 재사용 (selector 결과는 무시, badgeUrls만 씀)
        const observedUrls = new Set<string>();
        for (let i = 0; i < channelIds.length; i += PARALLEL) {
            const batch = channelIds.slice(i, i + PARALLEL);
            const batchN = Math.floor(i / PARALLEL) + 1;
            console.log(`[badges] batch ${batchN}/${totalBatches} (${batch.length}개)`);
            const results = await Promise.all(batch.map(id => visitChannel(context, {
                url: `https://chzzk.naver.com/live/${id}`,
                pageMode: 'live',
                selectors: selectors as unknown as Record<string, unknown>,
                requiredList,
            })));
            for (const r of results) {
                for (const u of r.badgeUrls) observedUrls.add(u);
            }
            if (i + PARALLEL < channelIds.length && BATCH_DELAY_MS > 0) {
                await new Promise(res => setTimeout(res, BATCH_DELAY_MS));
            }
        }
        console.log(`[badges] 관찰 URL ${observedUrls.size}개 (전 채널 union)`);

        // 인벤토리 로드 (필요 시 v1→v2 마이그레이션)
        const inventory = await loadInventory();
        const inventoryHadBadges = Object.keys(inventory.badges).length > 0;

        // 관찰 URL마다 이미지 fetch + hash → 인벤토리 갱신
        const now = new Date().toISOString();
        const newHashes: string[] = [];
        let urlAliasCount = 0;

        for (const url of observedUrls) {
            const hash = await hashImage(url);
            if (!hash) continue;
            const entry = inventory.badges[hash];
            if (!entry) {
                inventory.badges[hash] = {
                    firstSeenAt: now,
                    lastSeenAt: now,
                    seenCount: 1,
                    latestUrl: url,
                    urls: [{ url, firstSeenAt: now, lastSeenAt: now }],
                };
                newHashes.push(hash);
            } else {
                entry.seenCount += 1;
                entry.lastSeenAt = now;
                entry.latestUrl = url;
                const urlHistory = entry.urls.find(u => u.url === url);
                if (urlHistory) {
                    urlHistory.lastSeenAt = now;
                } else {
                    entry.urls.push({ url, firstSeenAt: now, lastSeenAt: now });
                    urlAliasCount += 1; // 같은 배지의 새 URL 발견
                }
            }
        }

        saveInventory(inventory);
        console.log(`[badges] 인벤토리 총 ${Object.keys(inventory.badges).length}개 (신규 hash ${newHashes.length}, 별칭 URL ${urlAliasCount})`);

        // 신규 배지 알림 — 첫 실행(인벤토리 비어있던 상태)엔 벌크 등록이라 skip
        if (inventoryHadBadges && newHashes.length > 0) {
            const preview = newHashes.slice(0, 10).map(h => `- ${inventory.badges[h].latestUrl}`).join('\n');
            const extra = newHashes.length > 10 ? `\n… +${newHashes.length - 10}` : '';
            await notifyDiscord(`🆕 chzzk 신규 배지 ${newHashes.length}개 (hash 기준):\n${preview}${extra}`);
        }
        if (urlAliasCount > 0) {
            console.log(`[badges] ${urlAliasCount}개 URL이 기존 배지의 새 별칭 (예: cache-buster timestamp 변경)`);
        }
    } finally {
        await context.close();
        await browser.close();
    }
}

main().catch(err => {
    console.error('[badges] fail:', err);
    void notifyDiscord(`💥 badges canary crashed: \`${String(err).slice(0, 500)}\``);
    process.exit(2);
});
