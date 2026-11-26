/**
 * 치지직 다시보기 채팅 읽기(비로그인). mentions-at.ts, channel-mentions.ts가 쓴다.
 * 일반 시청자 닉네임, userIdHash는 넘기지 않는다. 스트리머, 인증 계정만 이름을 붙인다.
 */

const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' };

// 집 IP 하나로 치지직을 오래 부른다. 막히면 ovm 감시와 집에서 보는 치지직까지 같이 막히므로
// 속도를 묶고(VOD_RPS, 초당 요청 수), 거절(403, 429)이 이어지면 더 두드리지 않고 멈춘다.
const RPS = Number(process.env.VOD_RPS ?? 8);
const MAX_REFUSALS = 5;
let nextSlot = 0;
let refusals = 0;
export let requests = 0;

async function slot(): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, nextSlot);
    nextSlot = at + 1000 / RPS;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

export async function getJson(url: string): Promise<any> {
    for (let i = 0; i < 4; i++) {
        await slot();
        requests++;
        try {
            const res = await fetch(url, { headers: UA });
            if (res.ok) {
                refusals = 0;
                return await res.json();
            }
            if (res.status === 403 || res.status === 429) {
                if (++refusals >= MAX_REFUSALS) {
                    console.error(`치지직이 요청을 ${MAX_REFUSALS}번 연속 거절했다(${res.status}). 멈춘다.`);
                    process.exit(3);
                }
                await new Promise((r) => setTimeout(r, 30_000));
                continue;
            }
        } catch { /* 다시 */ }
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
    return null;
}

export interface Replay {
    videoNo: number;
    title: string;
    /** 끝난 시각(한국). 다시보기 목록의 publishDate */
    publishDate: string;
    /** 초 */
    duration: number;
}

export async function recentReplays(channelId: string, size: number): Promise<Replay[]> {
    const j = await getJson(`https://api.chzzk.naver.com/service/v1/channels/${channelId}/videos?sortType=LATEST&pagingType=PAGE&page=0&size=${size}`);
    return (j?.content?.data ?? [])
        .filter((v: any) => v.videoType === 'REPLAY')
        .map((v: any) => ({ videoNo: v.videoNo, title: v.videoTitle, publishDate: v.publishDate, duration: v.duration }));
}

export interface Chat {
    at: number;
    /** 스트리머(이름), 인증(이름), 매니저, 시청자 */
    who: string;
    text: string;
}

function who(profile: string | null): string {
    let p: any = null;
    try { p = JSON.parse(profile ?? 'null'); } catch { /* 없음 */ }
    if (p?.userRoleCode === 'streamer') return `스트리머(${p.nickname})`;
    if (p?.verifiedMark) return `인증(${p.nickname})`;
    if (p?.userRoleCode === 'streaming_chat_manager') return '매니저';
    return '시청자';
}

/** 방송 시작 시각(ms). 다시보기 0초 근처 첫 채팅으로 잡는다. 채팅이 없으면 null */
export async function replayStart(videoNo: number): Promise<number | null> {
    const j = await getJson(`https://api.chzzk.naver.com/service/v1/videos/${videoNo}/chats?playerMessageTime=0&previousVideoChatSize=50`);
    return j?.content?.videoChats?.[0]?.messageTime ?? null;
}

/**
 * 다시보기 채팅을 시각 순서로 넘긴다. from, to는 실제 시각(ms), 생략하면 처음부터 끝까지.
 * start는 replayStart 값(from이 있을 때 건너뛰기용). maxPages는 요청 수 상한(한 번에 약 200건).
 */
export async function eachChat(videoNo: number, onChat: (c: Chat) => void, range: { start?: number; from?: number; to?: number; maxPages?: number } = {}): Promise<number> {
    const { start, from = 0, to = Infinity, maxPages = 20_000 } = range;
    let t = start && from ? Math.max(0, from - start - 60_000) : 0;
    let n = 0;
    for (let page = 0; page < maxPages; page++) {
        const j = await getJson(`https://api.chzzk.naver.com/service/v1/videos/${videoNo}/chats?playerMessageTime=${t}&previousVideoChatSize=50`);
        const chats = j?.content?.videoChats ?? [];
        if (!chats.length) break;
        for (const x of chats) {
            if (x.messageTime > to) return n;
            if (x.messageTime < from) continue;
            n++;
            onChat({ at: x.messageTime, who: who(x.profile), text: String(x.content).replace(/\{:[^}]+:\}/g, '◇') });
        }
        const next = j.content.nextPlayerMessageTime;
        if (!next || next <= t) break;
        t = next;
    }
    return n;
}

export const kst = (ms: number) => new Date(ms).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 19);

export async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
    let i = 0;
    await Promise.all(Array.from({ length: n }, async () => {
        while (i < items.length) await fn(items[i++]);
    }));
}
