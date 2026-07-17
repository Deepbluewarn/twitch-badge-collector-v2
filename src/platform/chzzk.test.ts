// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const fetchBadgesApi = vi.fn();
vi.mock('@/api/chzzk', () => ({
    createChzzkAPI: () => ({ fetchBadges: fetchBadgesApi }),
}));

import { ChzzkAdapter } from './chzzk';
import { CHAT_ATTR } from '@/interfaces/chat-attributes';

// ----- pure helpers ------------------------------------------------------

describe('ChzzkAdapter — pure methods', () => {
    const adapter = new ChzzkAdapter();

    it('getBadgeImageUrl returns the input URL regardless of density', () => {
        const url = 'https://nng.naver.com/badge.png';
        expect(adapter.getBadgeImageUrl(url, '1x')).toBe(url);
        expect(adapter.getBadgeImageUrl(url, '2x')).toBe(url);
        expect(adapter.getBadgeImageUrl(url, '4x')).toBe(url);
    });

    it('getBadgeIdentity returns the URL itself (URL is the identifier)', () => {
        const url = 'https://nng.naver.com/badge.png';
        expect(adapter.getBadgeIdentity(url)).toBe(url);
    });

    describe('computeDragRatio', () => {
        // bundled-selectors.prod.json constants.dragHeaderOffset = 0,
        // dragFooterOffset = 0 (2026-06 chzzk 개편 후 padding 옛 값 무효화).
        // usable = height - 0 - 0 = height.
        const rect = { y: 0, height: 400 } as DOMRect;

        it('returns ~100 when cursor at top (clientY === 0)', () => {
            expect(adapter.computeDragRatio(rect, 0)).toBe(100);
        });

        it('returns ~0 at bottom (clientY === height)', () => {
            expect(adapter.computeDragRatio(rect, 400)).toBe(0);
        });

        it('returns ~50 at midpoint', () => {
            expect(adapter.computeDragRatio(rect, 200)).toBe(50);
        });

        it('clamps below 0 to 0', () => {
            expect(adapter.computeDragRatio(rect, 9999)).toBe(0);
        });

        it('clamps above 100 to 100', () => {
            expect(adapter.computeDragRatio(rect, -9999)).toBe(100);
        });
    });
});

// ----- URL-derived methods ------------------------------------------------

describe('ChzzkAdapter — URL-derived methods', () => {
    const adapter = new ChzzkAdapter();

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

    it('getCurrentChannelId returns the second path segment', () => {
        setPath('/live/abc123');
        expect(adapter.getCurrentChannelId()).toBe('abc123');
    });

    it('getPageMode: "live" for /live/...', () => {
        setPath('/live/abc');
        expect(adapter.getPageMode()).toBe('live');
    });

    it('getPageMode: "video" for /video/...', () => {
        setPath('/video/12345');
        expect(adapter.getPageMode()).toBe('video');
    });

    it('getPageMode: "unknown" for unrecognized paths', () => {
        setPath('/category/foo');
        expect(adapter.getPageMode()).toBe('unknown');
    });
});

// ----- prepareChatClone ---------------------------------------------------

describe('ChzzkAdapter — prepareChatClone', () => {
    const adapter = new ChzzkAdapter();
    // 신 chzzk CSS-in-JS 패턴에 맞춤. selectors.json의 usernameContainer는
    // `[class*="_container_zw6kq_"]` substring으로 일반 채팅(_is_message_) /
    // 도네이션(_is_donation_) 두 변형 모두 매칭. 테스트 fixture는 일반 채팅 변형 사용.
    const USERNAME_CLASS = '_container_zw6kq_2 _is_message_o04z9_5';

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('prepends a chat time element when username container is present (live)', () => {
        const clone = document.createElement('div');
        clone.setAttribute(CHAT_ATTR.TIME, String(new Date('2025-01-01T12:34:56Z').getTime()));

        const usernameElem = document.createElement('div');
        // setAttribute보다 className에 정확히 둘 다 setting
        usernameElem.setAttribute('class', USERNAME_CLASS);
        clone.appendChild(usernameElem);

        adapter.prepareChatClone(clone);

        const timeElem = clone.querySelector('.tbcv2-chat-time');
        expect(timeElem).toBeTruthy();
        expect(timeElem!.textContent).toMatch(/\d{2}:\d{2}/); // HH:MM 형식
        expect(usernameElem.classList.contains('tbcv2-chat-username')).toBe(true);
    });

    it('uses replay (relative time) format when REPLAY_CHAT attr is set', () => {
        const clone = document.createElement('div');
        clone.setAttribute(CHAT_ATTR.TIME, '125000'); // 2분 5초
        clone.setAttribute(CHAT_ATTR.REPLAY_CHAT, 'true');

        const usernameElem = document.createElement('div');
        usernameElem.setAttribute('class', USERNAME_CLASS);
        clone.appendChild(usernameElem);

        adapter.prepareChatClone(clone);

        const timeElem = clone.querySelector('.tbcv2-chat-time');
        expect(timeElem).toBeTruthy();
        // msToTime은 02:05 (mm:ss) 또는 00:02:05 형식 — 정확한 포맷은 utils-common 구현.
        // 핵심은 텍스트가 비어있지 않다는 것.
        expect(timeElem!.textContent).not.toBe('');
    });

    it('is a no-op when username container is missing', () => {
        const clone = document.createElement('div');
        const before = clone.innerHTML;
        adapter.prepareChatClone(clone);
        expect(clone.innerHTML).toBe(before);
    });
});

// ----- DOM extract --------------------------------------------------------

describe('ChzzkAdapter — extract', () => {
    const adapter = new ChzzkAdapter();

    function buildChatFixture(): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.id = 'tbc-chzzk-chat-list-wrapper';

        const chat = document.createElement('div');

        // displayName 신 selector: `[class*="_container_zw6kq_"] [class*="_text_"]`
        // → username container 하위에 text element 배치.
        const usernameContainer = document.createElement('span');
        usernameContainer.className = '_container_zw6kq_2 _is_message_o04z9_5';
        const nameEl = document.createElement('span');
        nameEl.className = '_text_dtc6c_2';
        nameEl.textContent = 'AliceNick';
        usernameContainer.appendChild(nameEl);
        chat.appendChild(usernameContainer);

        // messageText 신 selector: `[class*="_chatting_message_"] > [class*="_text_"]`
        // → message wrapper 직속 자식으로 text element 배치.
        const messageWrapper = document.createElement('div');
        messageWrapper.className = '_chatting_message_1s877_21';
        const textEl = document.createElement('span');
        textEl.className = '_text_1s877_1';
        textEl.textContent = 'hello';
        messageWrapper.appendChild(textEl);
        chat.appendChild(messageWrapper);

        wrapper.appendChild(chat);
        document.body.appendChild(wrapper);
        return chat;
    }

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('returns ChatInfo for a well-formed node directly under the wrapper', () => {
        const node = buildChatFixture();
        const info = adapter.extract(node);
        expect(info).toBeDefined();
        expect(info!.loginName).toBe('AliceNick');
        expect(info!.nickName).toBe('AliceNick');
        expect(info!.textContents).toEqual(['hello']);
    });

    it('returns undefined when node parent is NOT the chat list wrapper', () => {
        // Chzzk는 직속 parent여야 통과 (closest가 아닌 strict id 체크)
        const wrapper = document.createElement('div');
        wrapper.id = 'tbc-chzzk-chat-list-wrapper';
        const intermediate = document.createElement('div');
        const chat = document.createElement('div');
        intermediate.appendChild(chat);
        wrapper.appendChild(intermediate);
        document.body.appendChild(wrapper);

        expect(adapter.extract(chat)).toBeUndefined();
    });

    it('returns undefined for popup_profile_header (Chzzk noise filter)', () => {
        const wrapper = document.createElement('div');
        wrapper.id = 'tbc-chzzk-chat-list-wrapper';
        const chat = document.createElement('div');
        chat.classList.add('live_chatting_popup_profile_header__OWnnU');
        wrapper.appendChild(chat);
        document.body.appendChild(wrapper);

        expect(adapter.extract(chat)).toBeUndefined();
    });

    it('returns undefined for non-Element node', () => {
        const text = document.createTextNode('plain');
        expect(adapter.extract(text)).toBeUndefined();
    });
});

// ----- fetchBadges --------------------------------------------------------

describe('ChzzkAdapter — fetchBadges', () => {
    beforeEach(() => {
        fetchBadgesApi.mockReset();
    });

    it('returns BadgeInterface[] regardless of scope (Chzzk has no channel scope)', async () => {
        fetchBadgesApi.mockResolvedValue([
            { id: 'b1', image: 'https://nng.naver.com/b1.png', name: 'Streamer' },
            { id: 'b2', image: 'https://nng.naver.com/b2.png', name: 'Manager' },
        ]);
        const adapter = new ChzzkAdapter();

        const fromGlobal = await adapter.fetchBadges({ scope: 'global' });
        const fromChannel = await adapter.fetchBadges({ scope: 'channel', channelLogin: 'whatever' });

        expect(fromGlobal).toHaveLength(2);
        expect(fromGlobal[0].channel).toBe('Global');
        expect(fromGlobal[0].badgeName).toBe('Streamer');
        expect(fromGlobal[0].badgeImage.badge_img_url_1x).toBe('https://nng.naver.com/b1.png');
        // channelLogin이 들어와도 Chzzk는 무시 — 결과 동일
        expect(fromChannel).toEqual(fromGlobal);
    });
});
