/**
 * 원본 채팅창의 채팅을 필터 시험으로 보내기 — 우클릭 메뉴 "필터 시험에 넣기".
 *
 * 채팅창 조작을 건드리지 않으려고 클릭이 아니라 우클릭 메뉴로 한다. 여기선 우클릭(contextmenu)이 일어난
 * 자리의 채팅만 조용히 읽어 두고(passive, 기본 동작·전파 그대로), 메뉴를 누르면 background가 가져간다.
 */
import type { PlatformAdapter } from '@/platform';
import { getPlatformConfig } from '@/platform/host-selectors';
import { CHAT_PICK_HAS, CHAT_PICK_TAKE, type ChatPick } from '@/interfaces/chat-pick';

export function pickChatAt(target: EventTarget | null, adapter: PlatformAdapter): ChatPick | null {
    if (!(target instanceof Element)) return null;
    const wrapper = target.closest(`#tbc-${adapter.type}-chat-list-wrapper`);
    if (!wrapper) return null;
    let line: Element = target;
    while (line.parentElement && line.parentElement !== wrapper) line = line.parentElement;
    if (line.parentElement !== wrapper) return null;

    const chat = adapter.extract(line);
    if (!chat) return null;

    // 배지는 그림 주소로 넘긴다(필터 시험이 주소에서 배지 정체를 다시 뽑는다).
    // 치지직은 extract가 이미 주소를 모으고, 트위치는 배지 그림 src를 읽는다.
    const badges = new Map<string, string>();
    for (const b of chat.badges) if (/^https?:/.test(b)) badges.set(b, '');
    const sel = getPlatformConfig(adapter.type).selectors.badge;
    if (sel) {
        line.querySelectorAll(sel).forEach(el => {
            const img = el instanceof HTMLImageElement ? el : el.querySelector('img');
            if (img?.src) badges.set(img.src, img.alt || img.title || badges.get(img.src) || '');
        });
    }
    return {
        platform: adapter.type,
        nickname: chat.nickName || chat.loginName,
        message: chat.textContents.filter(Boolean).join(' '),
        badges: [...badges].map(([url, name]) => ({ url, name })),
        channelId: adapter.getCurrentChannelId() ?? undefined,
    };
}

export function listenChatPick(adapter: PlatformAdapter) {
    let last: ChatPick | null = null;
    document.addEventListener('contextmenu', e => {
        try { last = pickChatAt(e.target, adapter); } catch { last = null; }
    }, { capture: true, passive: true });
    browser.runtime.onMessage.addListener((msg: { type?: string }, _sender, sendResponse) => {
        if (msg?.type === CHAT_PICK_TAKE) sendResponse(last);
        else if (msg?.type === CHAT_PICK_HAS) sendResponse(!!last);
    });
}
