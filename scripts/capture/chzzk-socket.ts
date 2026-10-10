/**
 * Chzzk 채팅 소켓 원본 수집기 — 여러 라이브 채널에 읽기 전용(비로그인)으로 붙어
 * 받은 패킷을 가공 없이 JSONL로 기록한다. src/platform/chzzk-socket.ts 의 파서를
 * 실데이터로 검증하고 fixture를 만들 때 쓴다.
 *
 * 출력: captures/chzzk-socket/<ISO 시각>/
 *   - <channelId>.jsonl  한 줄 = { t: 수신 ms, raw: 원본 문자열 }
 *   - meta.json          채널 목록/수집 조건/cmd 통계
 *
 * captures/ 는 .gitignore — 실제 시청자 닉네임·userIdHash가 들어 있어 커밋 금지.
 *
 * env:
 *  - CAPTURE_CHANNELS   동시 접속할 인기 라이브 수 (기본 10)
 *  - CAPTURE_SECONDS    수집 시간 (기본 600)
 *
 * 실행: npx tsx scripts/capture/chzzk-socket.ts
 */
import { mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { collectChat, discoverLives } from './socket-client.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHANNELS = Math.max(1, parseInt(process.env.CAPTURE_CHANNELS ?? '10', 10));
const SECONDS = Math.max(10, parseInt(process.env.CAPTURE_SECONDS ?? '600', 10));

async function main() {
    const outDir = join(REPO_ROOT, 'captures', 'chzzk-socket', new Date().toISOString().replace(/[:.]/g, '-'));
    mkdirSync(outDir, { recursive: true });

    const live = await discoverLives(CHANNELS);
    const until = Date.now() + SECONDS * 1000;
    const stats: Record<string, Record<string, number>> = {};

    console.log(`capturing ${live.length} channels for ${SECONDS}s → ${outDir}`);
    await Promise.all(live.map(t => {
        const s: Record<string, number> = (stats[t.channelId] = {});
        const file = join(outDir, `${t.channelId}.jsonl`);
        return collectChat(t.chatChannelId!, until, raw => {
            appendFileSync(file, JSON.stringify({ t: Date.now(), raw }) + '\n');
            try { const cmd = JSON.parse(raw).cmd; s[cmd] = (s[cmd] ?? 0) + 1; } catch { /* 깨진 패킷 */ }
        }).catch(err => console.error(t.channelName, err.message));
    }));

    const progress = setInterval(() => {
        const total = Object.values(stats).reduce((a, s) => a + Object.values(s).reduce((x, y) => x + y, 0), 0);
        console.log(`${Math.round((until - Date.now()) / 1000)}s left, ${total} packets`);
    }, 60000);

    await new Promise(r => setTimeout(r, until - Date.now() + 2000));
    clearInterval(progress);

    writeFileSync(join(outDir, 'meta.json'), JSON.stringify({
        startedAt: new Date(until - SECONDS * 1000).toISOString(),
        seconds: SECONDS,
        channels: live,
        cmdStats: stats,
    }, null, 2));
    console.log('done', outDir);
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
