/**
 * Chzzk selector canary. 라이브 여러 채널(다시보기 모드는 인기 채널의 최근 다시보기) 병렬 방문 → 방송 전체로 selector 판정(judge.ts).
 *  - 결과는 canary-alert.json(다시보기는 canary-alert-vod.json)에 남기고 알림은 ovm 상황실이 보낸다
 *  - class hash rotation 감지 시 auto-fix 후보 기록
 *
 * env:
 *  - CANARY_MODE=live|vod
 *  - CANARY_TOTAL, CANARY_PARALLEL, CANARY_BATCH_DELAY_MS
 *  - CANARY_STATE_DIR  스냅샷과 알림 파일을 둘 곳. ovm은 리포 밖 상태 폴더를 쓴다(docs/monitoring.md). 없으면 리포 루트
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import bundledManifest from '../../src/platform/bundled-selectors.prod.json' with { type: 'json' };
import type { CanarySnapshot, ChannelVisitResult } from './snapshot-types.ts';
import { diffSnapshots } from './diff.ts';
import { judge, socketIsMain } from './judge.ts';
import { visitChannel } from './visit-channel.ts';
import { discoverChannels, discoverVideos } from './discover-channels.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');
const OUT_DIR = process.env.CANARY_STATE_DIR || REPO_ROOT;
const SNAPSHOT_DIR = join(OUT_DIR, 'snapshots');

const MODE = (process.env.CANARY_MODE === 'vod' ? 'video' : 'live') as 'live' | 'video';
const PARALLEL = Math.max(1, parseInt(process.env.CANARY_PARALLEL ?? '8', 10));
const TOTAL = Math.max(1, parseInt(process.env.CANARY_TOTAL ?? '50', 10));
const BATCH_DELAY_MS = Math.max(0, parseInt(process.env.CANARY_BATCH_DELAY_MS ?? '3000', 10));
const SNAPSHOT_FILE = join(SNAPSHOT_DIR, `chzzk-${MODE === 'live' ? 'live' : 'vod'}.json`);
/** 라이브와 다시보기 결과 파일을 나눈다 (ovm에서 따로 돈다) */
const SUFFIX = MODE === 'live' ? '' : '-vod';
// 다시보기는 영상이 재생돼야(광고가 끝나야) 채팅이 뜬다
const CHAT_WAIT_MS = MODE === 'live' ? 25_000 : 60_000;

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
        const passed = req.filter(s => (s.count ?? 0) > 0).length;
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
    // 진짜 durable만 persist. count/matchedClasses/sampleSkeleton은 매 run 대표 채널이
    // 달라 흔들리는 값이라 저장 X → chat 종류 스왑 노이즈 → 파일 churn 제거.
    // present만 남겨 다음 run에서 "이전엔 있었나" 판정 가능.
    const durable = {
        pageMode: snap.pageMode,
        anchorLayer: snap.anchorLayer,
        selectors: snap.selectors.map(s => ({
            name: s.name,
            required: s.required,
            present: (s.count ?? 0) > 0,
        })),
        manifestRev: snap.manifestRev,
    };
    writeFileSync(SNAPSHOT_FILE, JSON.stringify(durable, null, 2) + '\n', 'utf-8');
}

/** 배지 그림 URL → 묶음 id (배지 놓침 알림에 묶음을 적으려고) */
function badgeGroups(): Map<string, string> {
    const list = JSON.parse(readFileSync(join(REPO_ROOT, 'data/chzzk-badges.json'), 'utf-8')) as { groups: { id: string; badges: { imageUrl: string }[] }[] };
    return new Map(list.groups.flatMap(g => g.badges.map(b => [b.imageUrl, g.id] as [string, string])));
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        locale: 'ko-KR',
    });

    try {
        // 여러 소스 union으로 채널 pool 확보
        const channelIds = MODE === 'live' ? await discoverChannels(context, { max: TOTAL }) : (await discoverVideos({ max: TOTAL })).map(String);
        if (channelIds.length === 0) {
            console.error(`[canary] 방문할 ${MODE === 'live' ? '라이브 채널' : '다시보기'} 없음, discovery 실패`);
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
                chatWaitTimeoutMs: CHAT_WAIT_MS,
            })));
            results.push(...batchResults);
            if (i + PARALLEL < channelIds.length && BATCH_DELAY_MS > 0) {
                await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
            }
        }

        // 로그
        for (const r of results) {
            const req = r.selectors.filter(s => s.required);
            const passed = req.filter(s => (s.count ?? 0) > 0).map(s => s.name).join(',');
            const failed = req.filter(s => s.count === 0).map(s => s.name).join(',');
            console.log(`[canary] ${r.url}: ok=${r.ok} anchor=${r.anchorLayer} pass=${passed || 'none'} fail=${failed || 'none'} badges=${r.badgeUrls.length} badgeImgs=${r.badgeImages?.total ?? 0} missed=${r.badgeImages?.missed.length ?? 0}`);
        }

        // 판정은 방송 전체로 (judge.ts). ovm 상황실(ops/watch/canary.ts → dispatch.ts)이 이 파일로 사건을 만든다
        const judged = judge(results, requiredList, badgeGroups(), {
            containers: ['chatRoomLive', 'chatRoomVod'],
            contentLevel: socketIsMain(bundledManifest.platforms.chzzk.constants) ? 'risk' : 'broken',
        });
        const snapshot = mergeToSnapshot(results, MODE);

        // 스냅샷 비교는 참고(anchor 하락)와 자동 수정 후보만 맡는다. 첫 실행이면 비교 없이 저장
        const baseline = loadBaseline();
        const diff = baseline ? diffSnapshots(baseline, snapshot) : null;
        // 깨졌거나 확인을 못 했으면 기준을 그대로 둔다
        if (judged.status !== 'unknown' && !judged.findings.some(f => f.level === 'broken')) saveSnapshot(snapshot);

        writeFileSync(join(OUT_DIR, `canary-alert${SUFFIX}.json`), JSON.stringify({
            mode: MODE,
            status: judged.status,
            note: judged.note,
            findings: judged.findings,
            alerts: diff?.alerts ?? [],
            autoFixCandidates: diff?.autoFixCandidates ?? [],
            url: snapshot.url,
            capturedAt: snapshot.capturedAt,
        }, null, 2));
        console.log(`[canary] 판정 ${judged.status}${judged.note ? ` (${judged.note})` : ''}: ${judged.findings.map(f => f.key).join(', ') || '이상 없음'}`);

        // auto-fix 후보는 현황판 카나리 칸에 나온다
        if (diff && diff.autoFixCandidates.length > 0) {
            writeFileSync(join(OUT_DIR, `canary-autofix${SUFFIX}.json`), JSON.stringify({
                snapshotFile: SNAPSHOT_FILE,
                candidates: diff.autoFixCandidates,
                capturedAt: snapshot.capturedAt,
                url: snapshot.url,
            }, null, 2));
            console.log(`[canary] auto-fix 후보 canary-autofix${SUFFIX}.json에 기록`);
        }
    } finally {
        await context.close();
        await browser.close();
    }
}

main().catch(err => {
    console.error('[canary] fail:', err);
    process.exit(2);
});
