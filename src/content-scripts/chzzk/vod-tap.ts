import { VOD_CHATS_URL, parseVodChatResponse } from "@/platform/chzzk-socket";
import { TBC_SOCKET_CHAT_ACTION, TbcSocketChatMessage } from "@/interfaces/chat-attributes";

/**
 * 치지직 다시보기 채팅 REST 수동 탭 (MAIN world).
 *
 * 다시보기 채팅은 소켓이 아니라 `/service/v1/videos/{no}/chats`로 ~45초 분량씩 미리 받는다.
 * 치지직은 axios(XHR)로 부르지만(2026-10 번들) fetch로 바뀔 수 있어 둘 다 본다. 요청을 새로
 * 만들거나 응답을 바꾸지 않는다 — host가 받은 응답을 읽기만 한다.
 */

type Post = (msg: TbcSocketChatMessage) => void;
const defaultPost: Post = (msg) => window.postMessage(msg, '*');
const TAPPED = Symbol.for('tbc.chzzkVodTap');

function emit(body: unknown, post: Post) {
    // 탭이 host 요청 처리에 영향을 주면 안 된다 — 어떤 예외도 밖으로 내보내지 않는다.
    try {
        const chats = parseVodChatResponse(body);
        if (chats.length) post({ action: TBC_SOCKET_CHAT_ACTION, kind: 'vod-chats', chats });
    } catch { /* 모양이 다르면 무시 */ }
}

interface VodTapTarget {
    XMLHttpRequest?: typeof XMLHttpRequest;
    fetch?: typeof fetch;
}

/**
 * 이미 감쌌는지는 감싼 대상(XHR prototype, fetch 함수)에 표시한다 — 같은 클래스를 두 번 감싸
 * 응답 하나에 post가 여러 번 나가는 일이 없게.
 * @returns 이번 호출로 하나라도 새로 설치했으면 true.
 */
export function installChzzkVodTap(target: VodTapTarget = window, post: Post = defaultPost): boolean {
    let installed = false;

    const XHR = target.XMLHttpRequest;
    if (XHR && !(XHR.prototype as any)[TAPPED]) {
        (XHR.prototype as any)[TAPPED] = true;
        installed = true;
        const open = XHR.prototype.open;
        XHR.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
            try {
                const u = String(url);
                if (VOD_CHATS_URL.test(u)) {
                    this.addEventListener('load', () => {
                        try {
                            if (this.status < 200 || this.status >= 300) return;
                            const body = this.responseType === 'json' ? this.response
                                : (this.responseType === '' || this.responseType === 'text') ? JSON.parse(this.responseText) : null;
                            emit(body, post);
                        } catch { /* 해석 실패는 무시 */ }
                    });
                }
            } catch { /* never break host */ }
            return (open as any).call(this, method, url, ...rest);
        } as typeof XHR.prototype.open;
    }

    const origFetch = target.fetch;
    if (origFetch && !(origFetch as any)[TAPPED]) {
        installed = true;
        const tapped = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
            const p = origFetch.call(this, input, init);
            try {
                const u = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
                if (VOD_CHATS_URL.test(u)) {
                    p.then(res => res.ok ? res.clone().json() : null).then(body => body && emit(body, post)).catch(() => { /* 무시 */ });
                }
            } catch { /* never break host */ }
            return p;
        } as typeof fetch;
        (tapped as any)[TAPPED] = true;
        target.fetch = tapped;
    }
    return installed;
}
