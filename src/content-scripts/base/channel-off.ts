/**
 * 이 탭의 채널이 꺼져 있는지 보고 적용한다 (src/utils/channel-off.ts).
 * 꺼진 채널은 확장을 끈 것과 같아야 한다. 끄면 호출 측(onChange)이 모아보기 창을 걷고 수집 표시를 지우며,
 * 페이지 쪽 스크립트는 <html>의 클래스(channel-off-flag.ts)를 보고 감시·전달·위조를 멈춘다.
 * 처음부터 꺼진 채널이면 호출 측(init)이 창을 아예 만들지 않는다.
 */
import type { PlatformAdapter } from '@/platform';
import { addStorageUpdateListener } from '@/utils/utils-browser';
import { onTeardown } from './lifecycle';
import { CHANNEL_INFO_MESSAGE, CHANNEL_OFF_BADGE_MESSAGE, CHANNEL_OFF_KEY, channelKey, getOffChannels, type ChannelInfo } from '@/utils/channel-off';
import { CHAT_ATTR, PROCESSED_CHAT_CLASS } from '@/interfaces/chat-attributes';
import { CHANNEL_OFF_CLASS } from './channel-off-flag';

export { CHANNEL_OFF_CLASS };

/** 원본 채팅창에 붙인 수집 표시(색 띠)와 표시용 속성을 걷는다 — 꺼진 채널은 확장이 없던 모습이어야 한다. */
export function clearHostMarks() {
    document.querySelectorAll<HTMLElement>(`.${PROCESSED_CHAT_CLASS}`).forEach(el => {
        el.classList.remove(PROCESSED_CHAT_CLASS);
        el.style.removeProperty('--tbc-marker-color');
    });
    const attrs = Object.values(CHAT_ATTR);
    document.querySelectorAll(attrs.map(a => `[${a}]`).join(',')).forEach(el => attrs.forEach(a => el.removeAttribute(a)));
}

export function setupChannelOff(adapter: PlatformAdapter, onChange: (off: boolean) => void) {
    let off = false;
    // 아이콘 표시·팝업 응답은 맨 위 창만 (iframe이 다른 주소로 덮어쓰지 않게)
    const isTop = window === window.top;
    const currentChannel = () => adapter.getPageMode() === 'live' ? adapter.getCurrentChannelId() : null;

    async function evaluate(): Promise<boolean> {
        const id = currentChannel();
        const next = !!id && channelKey(adapter.type, id) in await getOffChannels();
        document.documentElement.classList.toggle(CHANNEL_OFF_CLASS, next);
        if (isTop) browser.runtime.sendMessage({ type: CHANNEL_OFF_BADGE_MESSAGE, off: next }).catch(() => { /* background 깨는 중 */ });
        if (next !== off) {
            off = next;
            onChange(off);
        }
        return off;
    }

    onTeardown(disconnected => { if (disconnected) document.documentElement.classList.remove(CHANNEL_OFF_CLASS); });
    addStorageUpdateListener(key => { if (key === CHANNEL_OFF_KEY) evaluate(); });
    browser.runtime.onMessage.addListener((msg: { type?: string }, _sender, sendResponse) => {
        if (!isTop || msg?.type !== CHANNEL_INFO_MESSAGE) return;
        sendResponse({ platform: adapter.type, channelId: currentChannel(), off } satisfies ChannelInfo);
    });
    return { evaluate, isOff: () => off };
}
