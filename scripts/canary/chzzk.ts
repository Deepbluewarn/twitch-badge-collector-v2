/**
 * Chzzk selector canary — 라이브 여러 채널 병렬 방문 → 다수결로 selector 매칭 검증.
 *  - class hash rotation 감지 시 auto-fix draft PR 후보 기록
 *
 * 배지 인벤토리는 관심사 분리로 별도 스크립트(badges.ts)에서 처리.
 *
 * env:
 *  - DISCORD_CANARY_WEBHOOK
 *  - CANARY_MODE=live|vod
 *  - CANARY_TOTAL, CANARY_PARALLEL, CANARY_BATCH_DELAY_MS
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import bundledManifest from '../../src/platform/bundled-selectors.prod.json' with { type: 'json' };
import type { CanarySnapshot, SelectorSample, ChannelVisitResult } from './snapshot-types.ts';
import { diffSnapshots } from './diff.ts';
import { visitChannel } from './visit-channel.ts';
import { discoverChannels } from './discover-channels.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');
const SNAPSHOT_DIR = join(REPO_ROOT, 'snapshots');

const MODE = (process.env.CANARY_MODE === 'vod' ? 'video' : 'live') as 'live' | 'video';
const PARALLEL = Math.max(1, parseInt(process.env.CANARY_PARALLEL ?? '8', 10));
const TOTAL = Math.max(1, parseInt(process.env.CANARY_TOTAL ?? '50', 10));
const BATCH_DELAY_MS = Math.max(0, parseInt(process.env.CANARY_BATCH_DELAY_MS ?? '3000', 10));
const SNAPSHOT_FILE = join(SNAPSHOT_DIR, `chzzk-${MODE === 'live' ? 'live' : 'vod'}.json`);

/**
 * 여러 채널 결과에서 대표 스냅샷 선정.
 * 규칙: 모든 required selector가 pass인 채널 중 첫 번째의 selectors를 그대로 씀.
 * 그런 채널 없으면 required pass 개수 최대인 채널 씀.
 * → 다수결로 "한 채널 이상함" false-positive 방지.
 */
function mergeToSnapshot(results: ChannelVisitResult[], mode: 'live' | 'video'): CanarySnapshot {
    const ok = results.filter(r => r.ok);
    if (ok.length === 0) {
        // 다 실패한 경우 — 첫 시도 결과라도 담아 리포트
        const first = results[0] ?? {
            url: '', anchorLayer: 'none' as const, selectors: [], sampleSkeleton: null, badgeUrls: [] as string[],
        };
        return {
            pageMode: mode,
            capturedAt: new Date().toISOString(),
            url: first.url,
            selectors: first.selectors,
            anchorLayer: first.anchorLayer,
            sampleSkeleton: first.sampleSkeleton,
            manifestRev: bundledManifest.rev,
            channelsVisited: results.length,
            channelStatuses: results.map(r => ({
                url: r.url, requiredPass: false, anchorLayer: r.anchorLayer,
            })),
        };
    }

    // 채널별 required pass 여부
    const withScore = ok.map(r => {
        const req = r.selectors.filter(s => s.required);
        const passed = req.filter(s => s.count > 0).length;
        return { result: r, requiredTotal: req.length, requiredPassed: passed };
    });

    // 모든 required pass인 채널
    const fullyPassed = withScore.find(x => x.requiredPassed === x.requiredTotal && x.requiredTotal > 0);
    const chosen = fullyPassed ?? withScore.sort((a, b) => b.requiredPassed - a.requiredPassed)[0];

    return {
        pageMode: mode,
        capturedAt: new Date().toISOString(),
        url: chosen.result.url,
        selectors: chosen.result.selectors,
        anchorLayer: chosen.result.anchorLayer,
        sampleSkeleton: chosen.result.sampleSkeleton,
        manifestRev: bundledManifest.rev,
        channelsVisited: results.length,
        channelStatuses: results.map(r => {
            const w = withScore.find(x => x.result.url === r.url);
            return {
                url: r.url,
                requiredPass: w ? w.requiredPassed === w.requiredTotal : false,
                anchorLayer: r.anchorLayer,
            };
        }),
    };
}

function loadBaseline(): CanarySnapshot | null {
    if (!existsSync(SNAPSHOT_FILE)) return null;
    try { return JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf-8')) as CanarySnapshot; }
    catch { return null; }
}

function saveSnapshot(snap: CanarySnapshot) {
    if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });
    writeFileSync(SNAPSHOT_FILE, JSON.stringify(snap, null, 2) + '\n', 'utf-8');
}

async function notifyDiscord(content: string) {
    const url = process.env.DISCORD_CANARY_WEBHOOK;
    if (!url) {
        console.log('[canary] DISCORD_CANARY_WEBHOOK 미설정 — 콘솔 알림만.');
        console.log(content);
        return;
    }
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.slice(0, 1900) }),
    });
    if (!res.ok) console.error(`[canary] Discord fail: ${res.status}`);
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        locale: 'ko-KR',
    });

    try {
        // 여러 소스 union으로 채널 pool 확보
        const channelIds = await discoverChannels(context, { max: TOTAL });
        if (channelIds.length === 0) {
            console.error('[canary] 방문할 라이브 채널 없음 — discovery 실패');
            process.exit(2);
        }
        const totalBatches = Math.ceil(channelIds.length / PARALLEL);
        console.log(`[canary] ${channelIds.length}개 채널 (batch of ${PARALLEL}, 총 ${totalBatches} batches, delay ${BATCH_DELAY_MS}ms)`);

        const selectors = bundledManifest.platforms.chzzk.selectors;
        const requiredList = MODE === 'live'
            ? ['chatRoomLive', 'displayName', 'messageText', 'usernameContainer', 'badge']
            : ['chatRoomVod', 'displayName', 'messageText', 'usernameContainer', 'badge'];

        // 배치 loop — 동시 병렬은 PARALLEL로 제한, 배치 간 chzzk 부하 완화 delay.
        const results: ChannelVisitResult[] = [];
        for (let i = 0; i < channelIds.length; i += PARALLEL) {
            const batch = channelIds.slice(i, i + PARALLEL);
            const batchN = Math.floor(i / PARALLEL) + 1;
            console.log(`[canary] batch ${batchN}/${totalBatches} (${batch.length}개)`);
            const batchResults = await Promise.all(batch.map(id => visitChannel(context, {
                url: `https://chzzk.naver.com/${MODE === 'live' ? 'live' : 'video'}/${id}`,
                pageMode: MODE,
                selectors: selectors as unknown as Record<string, unknown>,
                requiredList,
            })));
            results.push(...batchResults);
            if (i + PARALLEL < channelIds.length && BATCH_DELAY_MS > 0) {
                await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
            }
        }

        // 로그
        for (const r of results) {
            const req = r.selectors.filter(s => s.required);
            const passed = req.filter(s => s.count > 0).map(s => s.name).join(',');
            const failed = req.filter(s => s.count === 0).map(s => s.name).join(',');
            console.log(`[canary] ${r.url}: ok=${r.ok} anchor=${r.anchorLayer} pass=${passed || 'none'} fail=${failed || 'none'} badges=${r.badgeUrls.length}`);
        }

        const snapshot = mergeToSnapshot(results, MODE);
        const requiredFailInSnapshot = snapshot.selectors.filter(s => s.required && s.count === 0);

        // 첫 실행 == baseline 없음
        const baseline = loadBaseline();
        if (baseline === null) {
            if (requiredFailInSnapshot.length > 0) {
                console.error(`[canary] 첫 실행이지만 required selector ${requiredFailInSnapshot.length}개 실패 — baseline 저장 skip.`);
                console.error(`  실패: ${requiredFailInSnapshot.map(s => s.name).join(', ')}`);
                process.exit(1);
            }
            saveSnapshot(snapshot);
            console.log('[canary] baseline 저장 (첫 실행)');
            return;
        }

        // Diff
        const diff = diffSnapshots(baseline, snapshot);

        if (diff.brokenRequired.length === 0 && diff.alerts.length === 0) {
            saveSnapshot(snapshot);
            console.log('[canary] 정상 — 스냅샷 갱신');
            return;
        }

        // 알림 구성
        const lines: string[] = [];
        if (diff.brokenRequired.length > 0 || diff.alerts.length > 0) {
            lines.push(`⚠️ **Chzzk canary ${MODE} 이상**`);
            lines.push(`- 대표 URL: ${snapshot.url}`);
            lines.push(`- anchor: ${snapshot.anchorLayer}`);
            lines.push(`- 채널 다수결: ${snapshot.channelStatuses?.filter(c => c.requiredPass).length ?? 0}/${snapshot.channelsVisited ?? 0} required pass`);
            if (diff.brokenRequired.length > 0) {
                lines.push(`- 깨진 required selector: ${diff.brokenRequired.map(s => s.name).join(', ')}`);
            }
            if (diff.autoFixCandidates.length > 0) {
                lines.push(`- auto-fix 후보 ${diff.autoFixCandidates.length}개:`);
                for (const c of diff.autoFixCandidates) {
                    lines.push(`  - \`${c.selectorName}\`: ${c.reason}`);
                }
                lines.push(`  → draft PR 자동 생성.`);
            }
            for (const a of diff.alerts) lines.push(`- ${a}`);
        }
        await notifyDiscord(lines.join('\n'));

        // auto-fix 후보 있으면 workflow 소비용 파일 생성
        if (diff.autoFixCandidates.length > 0) {
            writeFileSync(join(REPO_ROOT, 'canary-autofix.json'), JSON.stringify({
                snapshotFile: SNAPSHOT_FILE,
                candidates: diff.autoFixCandidates,
                capturedAt: snapshot.capturedAt,
                url: snapshot.url,
            }, null, 2));
            console.log('[canary] auto-fix 후보 canary-autofix.json에 기록');
        }

        // brokenRequired 없는 케이스(알림만) → 스냅샷 갱신해서 같은 변화 반복 알림 방지.
        // brokenRequired 있으면 baseline 유지 → 사람이 fix 후 정상 상태에서 재저장 유도.
        if (diff.brokenRequired.length === 0) {
            saveSnapshot(snapshot);
        }

        if (diff.brokenRequired.length > 0) process.exit(1);
    } finally {
        await context.close();
        await browser.close();
    }
}

main().catch(err => {
    console.error('[canary] fail:', err);
    void notifyDiscord(`💥 Chzzk canary crashed: \`${String(err).slice(0, 500)}\``);
    process.exit(2);
});
