/**
 * 이 탭의 채널이 꺼져 있는지 보고 적용한다 (src/utils/channel-off.ts).
 * 켜고 끌 때 새로고침하지 않게, 이미 붙은 모아보기 창은 <html>의 클래스 하나로 숨긴다(content style.css).
 * 처음부터 꺼진 채널이면 호출 측(init)이 창을 아예 만들지 않는다.
 */
import type { PlatformAdapter } from '@/platform';
import { addStorageUpdateListener } from '@/utils/utils-browser';
import { onTeardown } from './lifecycle';
import { CHANNEL_INFO_MESSAGE, CHANNEL_OFF_BADGE_MESSAGE, CHANNEL_OFF_KEY, channelKey, getOffChannels, type ChannelInfo } from '@/utils/channel-off';

export const CHANNEL_OFF_CLASS = 'tbcv2-channel-off';

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
