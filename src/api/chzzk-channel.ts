// 치지직 채널 검색·정보 — 필터에 채널을 지정할 때 이름으로 찾고, 목록에 프로필 사진을 띄운다.
//
// api.chzzk.naver.com은 확장 출처(chrome-extension:// · moz-extension://)의 Origin을 403으로 막는다.
// Origin 없는 요청은 받으므로, 이 확장이 보낸 요청에서만 Origin을 지운다(background의 DNR 규칙).
// 호스트 권한은 처음 검색할 때 요청한다(optional) — 업데이트만으로 확장이 꺼지지 않게.
const API = 'https://api.chzzk.naver.com';
export const CHZZK_API_ORIGINS = [`${API}/*`];

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

interface RawChannel { channelId: string; channelName: string; channelImageUrl?: string | null; verifiedMark?: boolean }
const toChannel = (c: RawChannel): ChzzkChannel => ({ id: c.channelId, name: c.channelName, imageUrl: c.channelImageUrl || undefined, verified: !!c.verifiedMark });

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${API}${path}`, { signal, credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
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
