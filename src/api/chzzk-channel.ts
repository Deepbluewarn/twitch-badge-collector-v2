// 치지직 채널 검색·정보 — 필터에 채널을 지정할 때 이름으로 찾고, 목록에 프로필 사진을 띄운다.
//
// api.chzzk.naver.com은 브라우저 요청을 치지직 사이트 출처(*.chzzk.naver.com)에서만 받는다(다른 출처는 403).
// 1) 치지직 탭이 열려 있으면 그 탭의 콘텐츠 스크립트가 부른다 — 출처가 chzzk.naver.com인 정상 요청.
// 2) 없으면 확장에서 직접 부르되, 이 확장의 요청에서만 Origin을 지운다(background의 DNR 규칙).
//    이쪽은 호스트 권한이 필요해 처음 검색할 때 요청한다(optional) — 업데이트만으로 확장이 꺼지지 않게.
const API = 'https://api.chzzk.naver.com';
export const CHZZK_API_ORIGINS = [`${API}/*`];
/** 설정 페이지 → 치지직 탭 콘텐츠 스크립트 메시지 */
export const CHZZK_API_MESSAGE = 'tbc-chzzk-api';
type TabReply = { status: number; body: unknown } | { error: string };

export interface ChzzkChannel {
    id: string;
    name: string;
    imageUrl?: string;
    verified: boolean;
}

export function hasChzzkApiAccess(): Promise<boolean> {
    return browser.permissions.contains({ origins: CHZZK_API_ORIGINS }).catch(() => false);
}

/** 사용자 동작(클릭) 안에서 불러야 한다. */
export function requestChzzkApiAccess(): Promise<boolean> {
    return browser.permissions.request({ origins: CHZZK_API_ORIGINS }).catch(() => false);
}

async function chzzkTabs() {
    // 호스트 권한(chzzk.naver.com)이 있어 tabs 권한 없이 url로 찾을 수 있다.
    const tabs = await browser.tabs?.query({ url: '*://chzzk.naver.com/*' }).catch(() => []) ?? [];
    return tabs.filter(t => t.id != null && !t.discarded);
}

/** 치지직 탭이 열려 있거나 직접 부를 권한이 있으면 true. */
export async function canReachChzzkApi(): Promise<boolean> {
    return (await chzzkTabs()).length > 0 || hasChzzkApiAccess();
}

/** 치지직 탭에 맡긴다. 답할 탭이 없으면(설치 전에 열린 탭 등) null. */
async function viaChzzkTab(path: string): Promise<{ status: number; body: unknown } | null> {
    for (const tab of await chzzkTabs()) {
        try {
            const r = await browser.tabs.sendMessage(tab.id!, { type: CHZZK_API_MESSAGE, path }, { frameId: 0 }) as TabReply | undefined;
            if (r && 'status' in r) return r;
        } catch { /* 이 탭엔 콘텐츠 스크립트가 없다 — 다음 탭 */ }
    }
    return null;
}

/** 치지직 탭의 콘텐츠 스크립트에서: 탭 출처로 API를 부르고 결과를 돌려준다. */
export function listenChzzkApiRequests() {
    // Firefox 콘텐츠 스크립트의 fetch는 확장 출처로 나간다 — 페이지 출처로 나가는 content.fetch를 쓴다.
    const pageFetch: typeof fetch = (globalThis as { content?: { fetch: typeof fetch } }).content?.fetch ?? fetch;
    browser.runtime.onMessage.addListener((msg: { type?: string; path?: unknown }, _sender, sendResponse) => {
        if (msg?.type !== CHZZK_API_MESSAGE || typeof msg.path !== 'string' || !msg.path.startsWith('/service/v1/')) return;
        pageFetch(`${API}${msg.path}`, { credentials: 'omit' })
            .then(async res => sendResponse({ status: res.status, body: res.ok ? await res.json() : null } satisfies TabReply))
            .catch(e => sendResponse({ error: String(e) } satisfies TabReply));
        return true;
    });
}

interface RawChannel { channelId: string; channelName: string; channelImageUrl?: string | null; verifiedMark?: boolean }
const toChannel = (c: RawChannel): ChzzkChannel => ({ id: c.channelId, name: c.channelName, imageUrl: c.channelImageUrl || undefined, verified: !!c.verifiedMark });

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
    let reply = await viaChzzkTab(path);
    if (!reply) {
        const res = await fetch(`${API}${path}`, { signal, credentials: 'omit' });
        reply = { status: res.status, body: res.ok ? await res.json() : null };
    }
    if (reply.status !== 200) throw new Error(`HTTP ${reply.status}`);
    const body = reply.body as { code?: number; content?: T } | null;
    if (body?.code !== 200) throw new Error(`code ${body?.code}`);
    return body.content as T;
}

export async function searchChzzkChannels(keyword: string, signal?: AbortSignal): Promise<ChzzkChannel[]> {
    const content = await get<{ data?: { channel: RawChannel }[] }>(`/service/v1/search/channels?keyword=${encodeURIComponent(keyword)}&offset=0&size=8`, signal);
    return (content.data ?? []).map(d => toChannel(d.channel));
}

export async function fetchChzzkChannel(id: string): Promise<ChzzkChannel> {
    return toChannel(await get<RawChannel>(`/service/v1/channels/${encodeURIComponent(id)}`));
}

/**
 * 이 확장이 api.chzzk.naver.com에 보내는 요청에서 Origin을 지우는 규칙. background가 켜질 때마다 다시 건다.
 * declarativeNetRequestWithHostAccess라 호스트 권한을 받기 전엔 규칙이 있어도 아무 요청에도 걸리지 않는다.
 * 치지직 페이지 자체의 요청은 건드리지 않도록 시작점을 이 확장으로 한정한다.
 */
export async function installChzzkApiOriginRule() {
    const dnr = browser.declarativeNetRequest;
    if (!dnr?.updateDynamicRules) return;
    const RULE_ID = 1;
    await dnr.updateDynamicRules({
        removeRuleIds: [RULE_ID],
        addRules: [{
            id: RULE_ID,
            priority: 1,
            action: { type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'remove' }] },
            condition: {
                requestDomains: ['api.chzzk.naver.com'],
                initiatorDomains: [new URL(browser.runtime.getURL('/')).hostname],
                resourceTypes: ['xmlhttprequest'],
            },
        }],
    });
}
