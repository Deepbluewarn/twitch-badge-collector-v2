// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { PlatformAdapter } from '@/platform';
import { getPlatformConfig } from '@/platform/host-selectors';
import { pickChatAt } from './chat-pick';

const badgeSel = getPlatformConfig('twitch').selectors.badge;
const extract = vi.fn();
const adapter = { type: 'twitch', extract, getCurrentChannelId: () => 'streamer' } as unknown as PlatformAdapter;

function fixture() {
    document.body.innerHTML = `
        <div id="tbc-twitch-chat-list-wrapper">
            <div class="line"><span class="${badgeSel.replace('.', '')}"><img src="https://static-cdn.jtvnw.net/badges/v1/abc/1" alt="구독자"></span><b class="name">Viewer</b>: <span class="text">안녕</span></div>
        </div>
        <div class="outside">채팅 밖</div>`;
}

describe('pickChatAt', () => {
    afterEach(() => { document.body.innerHTML = ''; extract.mockReset(); });

    it('우클릭한 자리의 채팅 줄을 읽는다 (안쪽 요소를 눌러도 줄 단위로)', () => {
        fixture();
        extract.mockReturnValue({ badges: ['subscriber/12'], textContents: ['안녕'], loginName: 'viewer', nickName: 'viewer' });
        const pick = pickChatAt(document.querySelector('.text'), adapter);
        expect(extract.mock.calls[0][0]).toBe(document.querySelector('.line'));
        expect(pick).toEqual({
            platform: 'twitch', nickname: 'viewer', message: '안녕', channelId: 'streamer',
            badges: [{ url: 'https://static-cdn.jtvnw.net/badges/v1/abc/1', name: '구독자' }],
        });
    });

    it('채팅창 밖이면 null', () => {
        fixture();
        expect(pickChatAt(document.querySelector('.outside'), adapter)).toBeNull();
        expect(extract).not.toHaveBeenCalled();
    });

    it('채팅으로 읽히지 않으면(시스템 메시지 등) null', () => {
        fixture();
        extract.mockReturnValue(undefined);
        expect(pickChatAt(document.querySelector('.name'), adapter)).toBeNull();
    });
});
