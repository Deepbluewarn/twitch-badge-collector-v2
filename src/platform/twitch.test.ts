// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { TwitchAdapter } from './twitch';
import { CHAT_ATTR } from '@/interfaces/chat-attributes';

// ----- pure helpers ------------------------------------------------------

describe('TwitchAdapter — pure methods', () => {
    const adapter = new TwitchAdapter();

    describe('getBadgeImageUrl', () => {
        it('composes Twitch CDN URL with density mapped to scale path', () => {
            expect(adapter.getBadgeImageUrl('abc-uuid', '1x'))
                .toBe('https://static-cdn.jtvnw.net/badges/v1/abc-uuid/1');
            expect(adapter.getBadgeImageUrl('abc-uuid', '2x'))
                .toBe('https://static-cdn.jtvnw.net/badges/v1/abc-uuid/2');
            expect(adapter.getBadgeImageUrl('abc-uuid', '4x'))
                .toBe('https://static-cdn.jtvnw.net/badges/v1/abc-uuid/3');
        });
    });

    describe('getBadgeIdentity', () => {
        it('extracts the UUID segment from a Twitch CDN URL', () => {
            const url = 'https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/1';
            expect(adapter.getBadgeIdentity(url)).toBe('3267646d-33f0-4b17-b3df-f923a41db1d0');
        });

        it('falls back to the input when given a non-URL string', () => {
            expect(adapter.getBadgeIdentity('not-a-url')).toBe('not-a-url');
        });
    });

    describe('computeDragRatio', () => {
        // rect.y는 컨테이너 시작 좌표. 비율 = 1 - (clientY - rect.y) / rect.height.
        const rect = { y: 0, height: 100 } as DOMRect;

        it('returns ~100 when cursor at top (clientY === rect.y)', () => {
            expect(adapter.computeDragRatio(rect, 0)).toBe(100);
        });

        it('returns 0 when cursor at bottom (clientY === rect.y + rect.height)', () => {
            expect(adapter.computeDragRatio(rect, 100)).toBe(0);
        });

        it('returns ~50 when cursor at midpoint', () => {
            expect(adapter.computeDragRatio(rect, 50)).toBe(50);
        });

        it('clamps below 0 to 0', () => {
            expect(adapter.computeDragRatio(rect, 200)).toBe(0);
        });

        it('clamps above 100 to 100', () => {
            expect(adapter.computeDragRatio(rect, -200)).toBe(100);
        });
    });

    it('prepareChatClone is a no-op (Twitch needs no DOM mutation)', () => {
        const div = document.createElement('div');
        div.innerHTML = '<span>hi</span>';
        const before = div.innerHTML;
        adapter.prepareChatClone(div);
        expect(div.innerHTML).toBe(before);
    });
});

// ----- URL-derived methods ------------------------------------------------

describe('TwitchAdapter — URL-derived methods', () => {
    const adapter = new TwitchAdapter();

    function setPath(pathname: string) {
        Object.defineProperty(window, 'location', {
            value: { pathname },
            writable: true,
            configurable: true,
        });
    }

    afterEach(() => {
        setPath('/');
    });

    it('getCurrentChannelId returns the first path segment', () => {
        setPath('/cohh');
        expect(adapter.getCurrentChannelId()).toBe('cohh');
    });

    it('getPageMode returns "video" for /videos/...', () => {
        setPath('/videos/12345');
        expect(adapter.getPageMode()).toBe('video');
    });

    it('getPageMode returns "live" for /<channel>', () => {
        setPath('/cohh');
        expect(adapter.getPageMode()).toBe('live');
    });
});

// ----- DOM extract --------------------------------------------------------

describe('TwitchAdapter — extract', () => {
    const adapter = new TwitchAdapter();

    function buildChatFixture(): HTMLElement {
        // wrapper로 감싸야 closest()가 통과
        const wrapper = document.createElement('div');
        wrapper.id = 'tbc-twitch-chat-list-wrapper';

        const chat = document.createElement('div');
        chat.setAttribute(CHAT_ATTR.BADGES, JSON.stringify(['subscriber/0']));
        chat.setAttribute(CHAT_ATTR.CHANNEL, 'cohh');
        chat.setAttribute(CHAT_ATTR.CHANNEL_ID, '26301881');

        const displayName = document.createElement('span');
        displayName.className = 'chat-author__display-name';
        displayName.setAttribute('data-a-user', 'Alice');
        displayName.textContent = 'AliceNick';
        chat.appendChild(displayName);

        const text = document.createElement('span');
        text.className = 'text-fragment';
        text.textContent = 'hello world';
        chat.appendChild(text);

        wrapper.appendChild(chat);
        document.body.appendChild(wrapper);
        return chat;
    }

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('returns ChatInfo with normalized fields for a well-formed node', () => {
        const node = buildChatFixture();
        const info = adapter.extract(node);
        expect(info).toBeDefined();
        expect(info!.loginName).toBe('alice');
        expect(info!.nickName).toBe('alicenick');
        expect(info!.badges).toEqual(['subscriber/0']);
        expect(info!.channelLogin).toBe('cohh');
        expect(info!.channelId).toBe('26301881');
        expect(info!.textContents).toEqual(['hello world']);
    });

    it('returns undefined for a non-Element node (text node)', () => {
        const text = document.createTextNode('plain');
        expect(adapter.extract(text)).toBeUndefined();
    });

    it('returns undefined for a node outside the chat list wrapper', () => {
        const stray = document.createElement('div');
        document.body.appendChild(stray);
        expect(adapter.extract(stray)).toBeUndefined();
    });
});
