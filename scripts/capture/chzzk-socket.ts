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

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHANNELS = Math.max(1, parseInt(process.env.CAPTURE_CHANNELS ?? '10', 10));
const SECONDS = Math.max(10, parseInt(process.env.CAPTURE_SECONDS ?? '600', 10));
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

interface Target { channelId: string; channelName: string; viewers: number; category: string; chatChannelId?: string }

async function getJson(url: string) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json() as Promise<any>;
}

async function discover(n: number): Promise<Target[]> {
    const { content } = await getJson(`https://api.chzzk.naver.com/service/v1/lives?size=${n}&sortType=POPULAR`);
    return content.data.map((d: any) => ({
        channelId: d.channel.channelId,
        channelName: d.channel.channelName,
        viewers: d.concurrentUserCount,
        category: d.liveCategoryValue,
    }));
}

function serverFor(cid: string) {
    // 치지직 클라이언트는 routing 서버로 고르지만, 어느 세션 서버든 같은 채널을 서빙한다.
    const sum = [...cid].reduce((a, c) => a + c.charCodeAt(0), 0);
    return `wss://kr-ss${(sum % 9) + 1}.chat.naver.com/chat`;
}

function capture(t: Target, file: string, stats: Record<string, number>, until: number) {
    const cid = t.chatChannelId!;
    let tid = 1;

    const connect = async () => {
        if (Date.now() >= until) return;
        const tok = (await getJson(`https://comm-api.game.naver.com/nng_main/v1/chats/access-token?channelId=${cid}&chatType=STREAMING`)).content.accessToken;
        const ws = new WebSocket(serverFor(cid));
        const send = (o: object) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(o));
        ws.onopen = () => send({ ver: '2', cmd: 100, svcid: 'game', cid, tid: tid++, bdy: { uid: null, devType: 2001, accTkn: tok, auth: 'READ' } });
        ws.onmessage = (e) => {
            const raw = String(e.data);
            appendFileSync(file, JSON.stringify({ t: Date.now(), raw }) + '\n');
            let p: any;
            try { p = JSON.parse(raw); } catch { return; }
            stats[p.cmd] = (stats[p.cmd] ?? 0) + 1;
            if (p.cmd === 0) send({ ver: '2', cmd: 10000 });
            if (p.cmd === 10100) send({ ver: '2', cmd: 5101, svcid: 'game', cid, sid: p.bdy?.sid, tid: tid++, bdy: { recentMessageCount: 50 } });
        };
        ws.onclose = () => { if (Date.now() < until) setTimeout(() => connect().catch(err => console.error(t.channelName, err.message)), 3000); };
        ws.onerror = () => { /* onclose가 재접속 */ };
        setTimeout(() => ws.close(), Math.max(0, until - Date.now()));
        // 서버 ping과 별개로 유휴 끊김 방지.
        const keep = setInterval(() => (Date.now() >= until ? clearInterval(keep) : send({ ver: '2', cmd: 0 })), 20000);
    };
    return connect();
}

async function main() {
    const outDir = join(REPO_ROOT, 'captures', 'chzzk-socket', new Date().toISOString().replace(/[:.]/g, '-'));
    mkdirSync(outDir, { recursive: true });

    const targets = await discover(CHANNELS);
    for (const t of targets) {
        t.chatChannelId = (await getJson(`https://api.chzzk.naver.com/polling/v2/channels/${t.channelId}/live-status`)).content?.chatChannelId;
    }
    const live = targets.filter(t => t.chatChannelId);
    const until = Date.now() + SECONDS * 1000;
    const stats: Record<string, Record<string, number>> = {};

    console.log(`capturing ${live.length} channels for ${SECONDS}s → ${outDir}`);
    await Promise.all(live.map(t => {
        stats[t.channelId] = {};
        return capture(t, join(outDir, `${t.channelId}.jsonl`), stats[t.channelId], until)
            .catch(err => console.error(t.channelName, err.message));
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
