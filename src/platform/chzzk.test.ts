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

        // 높이 0(레이아웃 전 DOM)에서 예전엔 0으로 나눠 -Infinity → clamp가 0으로
        // 접었고, 그 0이 "사용자가 고른 한쪽 100%"로 저장돼 컨테이너가 깨졌다.
        it('높이 0이면 NaN — 호출측이 버리도록', () => {
            expect(adapter.computeDragRatio({ y: 0, height: 0 } as DOMRect, 100)).toBeNaN();
        });

        // constants는 OTA로 통째로 바뀔 수 있어 누락 가능. 예전엔 undefined가
        // 산술에 섞여 NaN이 됐고 clamp가 NaN을 통과시켜 그대로 저장됐다.
        it('OTA manifest에 constants가 없어도 offset 0으로 계산된다', async () => {
            const { setManifest, getManifest } = await import('./host-selectors');
            const current = getManifest();
            const stripped = JSON.parse(JSON.stringify(current));
            delete stripped.platforms.chzzk.constants;
            stripped.rev = current.rev + 1;

            expect(setManifest(stripped)).toBe(true);
            try {
                expect(adapter.computeDragRatio(rect, 200)).toBe(50);
            } finally {
                // manifest는 모듈 전역 — 되돌리지 않으면 뒤 테스트가 constants 없는
                // 상태를 물려받는다. setManifest는 rev 단조 증가만 받으므로 +2.
                const restored = JSON.parse(JSON.stringify(current));
                restored.rev = current.rev + 2;
                setManifest(restored);
            }
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
    // rev 14 usernameContainer는 `button[aria-haspopup="true"] > [class*="_container_"]`
    // 또는 `[class*="_nickname_"] > [class*="_container_"]` — 즉 container만 있으면
    // 안 되고 부모 앵커가 필요하다. 실 DOM과 같은 형태로 만든다.
    const USERNAME_CLASS = '_container_1mc5x_2 _is_message_1mc5x_5';

    /** clone > button[aria-haspopup] > span._container_ 구조를 만들어 container를 반환. */
    function attachUsernameContainer(clone: HTMLElement): HTMLElement {
        const button = document.createElement('button');
        button.className = '_nickname_w9pvh_33';
        button.setAttribute('aria-haspopup', 'true');
        const usernameElem = document.createElement('span');
        usernameElem.setAttribute('class', USERNAME_CLASS);
        button.appendChild(usernameElem);
        clone.appendChild(button);
        return usernameElem;
    }

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('prepends a chat time element when username container is present (live)', () => {
        const clone = document.createElement('div');
        clone.setAttribute(CHAT_ATTR.TIME, String(new Date('2025-01-01T12:34:56Z').getTime()));

        const usernameElem = attachUsernameContainer(clone);

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

        attachUsernameContainer(clone);

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

    /**
     * 실제 chzzk 라이브 DOM 구조를 축약한 픽스처 (2026-09 라이브 실측 기준).
     *
     * rev 14 selector가 기대하는 앵커를 그대로 담는다:
     *   - `button[aria-haspopup="true"]` 안에 username container
     *   - username container > `_nickname_` > (`_ellipsis_`) > `_text_` 에 닉네임
     *   - `_chatting_message_` 직속 자식 `_text_` 에 본문
     *   - 배지는 `_icon_` > `_container_` > img
     * class hash는 일부러 실측값(1mc5x/1iatj/w9pvh)을 써 hash 의존이 남아 있으면 드러나게.
     */
    function buildChatFixture(opts?: {
        withNickname?: boolean;
        withMessage?: boolean;
        withBadge?: boolean;
        badgeWithoutImg?: boolean;
    }): HTMLElement {
        const {
            withNickname = true, withMessage = true, withBadge = false, badgeWithoutImg = false,
        } = opts ?? {};

        const wrapper = document.createElement('div');
        wrapper.id = 'tbc-chzzk-chat-list-wrapper';

        const chat = document.createElement('div');
        chat.className = '_item_8lqsk_7';

        const container = document.createElement('div');
        container.className = '_container_w9pvh_1';
        const messageWrapper = document.createElement('div');
        messageWrapper.className = '_chatting_message_w9pvh_21';

        const button = document.createElement('button');
        button.className = '_nickname_w9pvh_33';
        button.setAttribute('aria-haspopup', 'true');

        const usernameContainer = document.createElement('span');
        usernameContainer.className = '_container_1mc5x_2 _is_message_1mc5x_5';

        if (withBadge) {
            const badgeWrap = document.createElement('span');
            badgeWrap.className = '_wrapper_1mc5x_30';
            const icon = document.createElement('span');
            icon.className = '_icon_1mc5x_15';
            const badgeContainer = document.createElement('span');
            badgeContainer.className = '_container_1nwpy_2';
            if (!badgeWithoutImg) {
                const img = document.createElement('img');
                img.src = 'https://ssl.pstatic.net/static/nng/glive/badge/fan_03.png';
                badgeContainer.appendChild(img);
            }
            icon.appendChild(badgeContainer);
            badgeWrap.appendChild(icon);
            usernameContainer.appendChild(badgeWrap);
        }

        if (withNickname) {
            const nick = document.createElement('span');
            nick.className = '_nickname_1mc5x_80';
            const ellipsis = document.createElement('span');
            ellipsis.className = '_ellipsis_1iatj_6';
            const nameEl = document.createElement('span');
            nameEl.className = '_text_1iatj_2';
            nameEl.textContent = 'AliceNick';
            ellipsis.appendChild(nameEl);
            nick.appendChild(ellipsis);
            usernameContainer.appendChild(nick);
        }

        button.appendChild(usernameContainer);
        messageWrapper.appendChild(button);

        if (withMessage) {
            const textEl = document.createElement('span');
            textEl.className = '_text_w9pvh_1';
            textEl.textContent = 'hello';
            messageWrapper.appendChild(textEl);
        }

        container.appendChild(messageWrapper);
        chat.appendChild(container);
        wrapper.appendChild(chat);
        document.body.appendChild(wrapper);
        return chat;
    }

    /** 도네이션 채팅 — 버튼 class가 `_profile_button_`이고 본문이 <p>. */
    function buildDonationFixture(): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.id = 'tbc-chzzk-chat-list-wrapper';

        const chat = document.createElement('div');
        chat.className = '_item_8lqsk_7 _small_padding_8lqsk_57';

        const container = document.createElement('div');
        container.className = '_container_gb6rb_1 _level0_gb6rb_10';
        const header = document.createElement('div');
        header.className = '_header_gb6rb_35';

        const button = document.createElement('button');
        button.className = '_profile_button_gb6rb_45';
        button.setAttribute('aria-haspopup', 'true');

        const usernameContainer = document.createElement('span');
        usernameContainer.className = '_container_1mc5x_2 _is_donation_1mc5x_5';
        const nick = document.createElement('span');
        nick.className = '_nickname_1mc5x_80';
        const plain = document.createElement('span'); // 도네는 _ellipsis_ 래퍼가 없다
        const nameEl = document.createElement('span');
        nameEl.className = '_text_1iatj_2';
        nameEl.textContent = '익명의 후원자';
        plain.appendChild(nameEl);
        nick.appendChild(plain);
        usernameContainer.appendChild(nick);
        button.appendChild(usernameContainer);
        header.appendChild(button);

        const body = document.createElement('p');
        body.className = '_text_gb6rb_36';
        body.textContent = '치즈 감사합니다';

        container.appendChild(header);
        container.appendChild(body);
        chat.appendChild(container);
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

    it('extracts nickname and badge from a chat carrying a badge', () => {
        const node = buildChatFixture({ withBadge: true });
        const info = adapter.extract(node);
        expect(info!.nickName).toBe('AliceNick');
        expect(info!.badges).toEqual([
            'https://ssl.pstatic.net/static/nng/glive/badge/fan_03.png',
        ]);
        expect(info!.unavailable).toBeUndefined();
    });

    it('extracts donation nickname and <p> body (도네이션 구조)', () => {
        // 도네이션은 버튼 class가 `_profile_button_`이라 `_nickname_ > _container_`
        // branch로는 안 잡힌다 — aria branch가 받쳐야 한다.
        const node = buildDonationFixture();
        const info = adapter.extract(node);
        expect(info).toBeDefined();
        expect(info!.nickName).toBe('익명의 후원자');
        expect(info!.textContents).toContain('치즈 감사합니다');
        expect(info!.unavailable).toBeUndefined();
    });

    it('마킹만 하고 채팅을 버리지 않는다 — 닉네임 selector가 깨진 경우', () => {
        // rev 13 사고 재현: 이름을 못 뽑아도 본문/배지로 필터를 계속 돌려야 한다.
        const node = buildChatFixture({ withNickname: false, withBadge: true });
        const info = adapter.extract(node);
        expect(info).toBeDefined();
        expect(info!.nickName).toBe('');
        expect(info!.unavailable).toEqual(['name']);
        expect(info!.textContents).toEqual(['hello']);
        expect(info!.badges).toHaveLength(1);
    });

    it('배지를 data 속성과 selector 두 출처에서 읽는다', () => {
        // selector가 깨져도 React props 유래 속성이 배지 필터를 살린다.
        const node = buildChatFixture({ withBadge: true });
        node.setAttribute(CHAT_ATTR.BADGES, JSON.stringify([
            'https://ssl.pstatic.net/static/nng/glive/icon/streamer.png',
        ]));
        const info = adapter.extract(node);
        expect(info!.badges).toContain('https://ssl.pstatic.net/static/nng/glive/icon/streamer.png');
        expect(info!.badges).toContain('https://ssl.pstatic.net/static/nng/glive/badge/fan_03.png');
    });

    it('두 출처가 같은 배지를 주면 중복되지 않는다', () => {
        const node = buildChatFixture({ withBadge: true });
        node.setAttribute(CHAT_ATTR.BADGES, JSON.stringify([
            'https://ssl.pstatic.net/static/nng/glive/badge/fan_03.png',
        ]));
        const info = adapter.extract(node);
        expect(info!.badges).toEqual(['https://ssl.pstatic.net/static/nng/glive/badge/fan_03.png']);
    });

    it('badge selector가 깨져도 data 속성으로 배지를 읽는다', () => {
        // selector를 못 쓰는 상황을 만든다 — 배지 DOM 없이 속성만 있는 채팅.
        const node = buildChatFixture({ withBadge: false });
        node.setAttribute(CHAT_ATTR.BADGES, JSON.stringify([
            'https://ssl.pstatic.net/static/nng/glive/icon/streamer.png',
        ]));
        const info = adapter.extract(node);
        expect(info!.badges).toEqual(['https://ssl.pstatic.net/static/nng/glive/icon/streamer.png']);
    });

    it('깨진 data 속성에서 죽지 않는다', () => {
        const node = buildChatFixture({ withBadge: true });
        node.setAttribute(CHAT_ATTR.BADGES, '{not json');
        expect(() => adapter.extract(node)).not.toThrow();
        expect(adapter.extract(node)!.badges).toHaveLength(1);
    });

    it('img 없는 badge 매칭에서 죽지 않는다', () => {
        // selector를 hash 없는 형태로 넓히면 img 없는 노드를 잡을 여지가 생긴다.
        // 예전 코드는 img[0].src 직접 접근으로 TypeError를 냈다.
        const node = buildChatFixture({ withBadge: true, badgeWithoutImg: true });
        expect(() => adapter.extract(node)).not.toThrow();
        const info = adapter.extract(node);
        expect(info!.badges).toEqual([]);
    });

    it('returns undefined when neither name nor text is present (채팅이 아닌 노드)', () => {
        const node = buildChatFixture({ withNickname: false, withMessage: false });
        expect(adapter.extract(node)).toBeUndefined();
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

    it('appends verifiedBadgeImageUrl to badges when ".blind" text is "인증 마크"', () => {
        const node = buildChatFixture();
        // 인증 마크 blind label 추가 — icon container hash와 무관하게 잡혀야 함
        const blind = document.createElement('span');
        blind.className = 'blind';
        blind.textContent = '인증 마크';
        node.appendChild(blind);

        const info = adapter.extract(node);
        expect(info).toBeDefined();
        expect(info!.badges).toContain('https://ssl.pstatic.net/static/nng/glive/image/icon_official_mark.png');
    });

    it('does NOT append verifiedBadgeImageUrl when no "인증 마크" blind label exists', () => {
        const node = buildChatFixture();
        // 다른 blind 텍스트만 있을 때 오탐 없어야 함
        const blind = document.createElement('span');
        blind.className = 'blind';
        blind.textContent = '구독 배지';
        node.appendChild(blind);

        const info = adapter.extract(node);
        expect(info!.badges).not.toContain('https://ssl.pstatic.net/static/nng/glive/image/icon_official_mark.png');
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
