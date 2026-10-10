/**
 * 치지직 채팅 소켓 읽기 전용(비로그인) 클라이언트 — 수집 스크립트와 CI canary가 공유.
 * 받은 패킷을 가공 없이 넘긴다. 프로토콜 근거: docs/reports/2026-10-10-chzzk-socket-protocol.md
 */

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export interface LiveTarget {
    channelId: string;
    channelName: string;
    viewers: number;
    category: string;
    chatChannelId?: string;
}

async function getJson(url: string) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json() as Promise<any>;
}

/** 인기 라이브 n개 + 각자의 채팅 채널 id. 채팅 채널이 없는 방송은 뺀다. */
export async function discoverLives(n: number): Promise<LiveTarget[]> {
    const { content } = await getJson(`https://api.chzzk.naver.com/service/v1/lives?size=${n}&sortType=POPULAR`);
    const targets: LiveTarget[] = content.data.map((d: any) => ({
        channelId: d.channel.channelId,
        channelName: d.channel.channelName,
        viewers: d.concurrentUserCount,
        category: d.liveCategoryValue,
    }));
    for (const t of targets) {
        try {
            t.chatChannelId = (await getJson(`https://api.chzzk.naver.com/polling/v2/channels/${t.channelId}/live-status`)).content?.chatChannelId;
        } catch { /* 이 채널만 건너뛴다 */ }
    }
    return targets.filter(t => t.chatChannelId);
}

function serverFor(cid: string) {
    // 치지직 클라이언트는 routing 서버로 고르지만, 어느 세션 서버든 같은 채널을 서빙한다.
    const sum = [...cid].reduce((a, c) => a + c.charCodeAt(0), 0);
    return `wss://kr-ss${(sum % 9) + 1}.chat.naver.com/chat`;
}

/**
 * `until`(ms epoch)까지 채팅 소켓에 붙어 받은 패킷 원문을 onRaw로 넘긴다. 끊기면 3초 뒤
 * 다시 붙는다. 처음 접속(토큰 발급 포함)에 실패하면 reject.
 */
export async function collectChat(cid: string, until: number, onRaw: (raw: string) => void): Promise<void> {
    let tid = 1;
    const connect = async (): Promise<void> => {
        if (Date.now() >= until) return;
        const tok = (await getJson(`https://comm-api.game.naver.com/nng_main/v1/chats/access-token?channelId=${cid}&chatType=STREAMING`)).content.accessToken;
        const ws = new WebSocket(serverFor(cid));
        const send = (o: object) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(o));
        ws.onopen = () => send({ ver: '2', cmd: 100, svcid: 'game', cid, tid: tid++, bdy: { uid: null, devType: 2001, accTkn: tok, auth: 'READ' } });
        ws.onmessage = (e) => {
            const raw = String(e.data);
            onRaw(raw);
            let p: any;
            try { p = JSON.parse(raw); } catch { return; }
            if (p.cmd === 0) send({ ver: '2', cmd: 10000 });
            if (p.cmd === 10100) send({ ver: '2', cmd: 5101, svcid: 'game', cid, sid: p.bdy?.sid, tid: tid++, bdy: { recentMessageCount: 50 } });
        };
        ws.onclose = () => {
            if (Date.now() < until) setTimeout(() => { connect().catch(() => { /* 재접속 실패는 조용히 */ }); }, 3000);
        };
        ws.onerror = () => { /* onclose가 재접속 */ };
        setTimeout(() => ws.close(), Math.max(0, until - Date.now()));
        // 서버 ping과 별개로 유휴 끊김 방지.
        const keep = setInterval(() => (Date.now() >= until ? clearInterval(keep) : send({ ver: '2', cmd: 0 })), 20000);
    };
    await connect();
}
