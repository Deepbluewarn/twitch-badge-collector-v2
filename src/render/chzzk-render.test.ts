// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import type { ChzzkSocketChat } from '@/platform/chzzk-socket';
import { CHAT_ATTR } from '@/interfaces/chat-attributes';
import { messageToHtml, toChzzkChatView } from './chzzk-chat-view';
import { renderChzzkChat, DEFAULT_CHZZK_TEMPLATES } from './chzzk-render';

const T = Date.UTC(2026, 9, 10, 5, 7);
const formatTime = () => '14:07';

function chat(over: Partial<ChzzkSocketChat> = {}): ChzzkSocketChat {
    return {
        id: `u1_${T}`, uid: 'u1', time: T, type: 1, status: 'NORMAL',
        nickname: '시청자', anonymous: false, message: '안녕', emojis: {},
        badges: ['https://b/sub.png', 'https://b/fan.png'], verified: false,
        userRoleCode: 'common_user', nicknameColorCode: 'CC000', chatChannelId: 'CID', extras: {},
        ...over,
    };
}

describe('messageToHtml', () => {
    it('텍스트는 escape, 이모지 토큰은 <img>', () => {
        expect(messageToHtml('<b>{:cat:}</b>', { cat: 'https://e/cat.gif' }))
            .toBe('&lt;b&gt;<img class="tbc-chat-emoji" src="https://e/cat.gif" alt="cat">&lt;/b&gt;');
    });

    it('모르는 토큰은 글자 그대로', () => {
        expect(messageToHtml('{:nope:} hi', {})).toBe('{:nope:} hi');
    });
});

describe('toChzzkChatView', () => {
    it('일반 채팅', () => {
        const v = toChzzkChatView(chat(), { formatTime });
        expect(v).toMatchObject({
            kind: 'chat', isChat: true, nickname: '시청자', time: '14:07', hasMessage: true,
            badges: [{ url: 'https://b/sub.png' }, { url: 'https://b/fan.png' }],
            cleanbot: false, blinded: false, messageHtml: '안녕',
        });
        expect(v.nickColorLight).toMatch(/^#[0-9A-F]{6}$/i);
        expect(v.nickColorDark).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it('클린봇: <details>로 가리고 원문은 <i>', () => {
        const v = toChzzkChatView(chat({ status: 'CBOTBLIND', message: '나쁜 말' }));
        expect(v.cleanbot).toBe(true);
        expect(v.messageHtml).toBe('<details class="tbc-chat-cleanbot"><summary>클린봇이 부적절한 표현을 감지했습니다</summary><i>나쁜 말</i></details>');
    });

    it('운영자 블라인드: 원문을 아예 넣지 않는다', () => {
        const v = toChzzkChatView(chat({ status: 'BLIND', message: '비밀' }));
        expect(v.blinded).toBe(true);
        expect(v.messageHtml).not.toContain('비밀');
    });

    it('익명 후원: 닉네임 대체 + 금액', () => {
        const v = toChzzkChatView(chat({
            type: 10, anonymous: true, uid: 'anonymous', nickname: '', message: '',
            extras: { payAmount: 10000, donationType: 'CHAT', isAnonymous: true },
        }));
        expect(v).toMatchObject({
            kind: 'donation', isDonation: true, nickname: '익명의 후원자', hasMessage: false,
            donation: { amount: 10000, amountText: '10,000치즈', mission: false },
        });
    });

    it('미션 후원', () => {
        const v = toChzzkChatView(chat({ type: 10, extras: { payAmount: 500, donationType: 'MISSION', missionText: '노래 한 곡' } }));
        expect(v.donation).toMatchObject({ mission: true, missionText: '노래 한 곡' });
    });

    it('구독', () => {
        const v = toChzzkChatView(chat({ type: 11, extras: { month: 12, tierName: '아루냥', tierNo: 1 } }));
        expect(v).toMatchObject({ kind: 'subscription', subscription: { month: 12, tierName: '아루냥' } });
    });

    it('인증 마크 URL은 인증 사용자에게만', () => {
        expect(toChzzkChatView(chat(), { verifiedIconUrl: 'v.png' }).verifiedIconUrl).toBeUndefined();
        expect(toChzzkChatView(chat({ verified: true }), { verifiedIconUrl: 'v.png' }).verifiedIconUrl).toBe('v.png');
    });
});

describe('renderChzzkChat', () => {
    it('루트에 HTML 경로와 같은 CHAT_ATTR을 단다', () => {
        const el = renderChzzkChat(chat(), { formatTime });
        expect(el.getAttribute(CHAT_ATTR.KEY)).toBe(`u1_${T}`);
        expect(el.getAttribute(CHAT_ATTR.TIME)).toBe(String(T));
        expect(JSON.parse(el.getAttribute(CHAT_ATTR.BADGES)!)).toEqual(['https://b/sub.png', 'https://b/fan.png']);
        expect(el.className).toBe('tbc-chat tbc-chat--chat');
    });

    it('기본 일반 채팅 템플릿', () => {
        const el = renderChzzkChat(chat({ message: 'hi {:cat:}', emojis: { cat: 'https://e/c.gif' } }), { formatTime });
        expect(el.querySelector('.tbcv2-chat-time')!.textContent).toBe('14:07');
        expect([...el.querySelectorAll('.tbc-chat-badge')].map(i => i.getAttribute('src'))).toEqual(['https://b/sub.png', 'https://b/fan.png']);
        expect(el.querySelector('.tbc-chat-nick')!.textContent).toBe('시청자');
        expect(el.querySelector('.tbc-chat-nick')!.getAttribute('style')).toMatch(/--tbc-nick-light:#\w+;--tbc-nick-dark:#\w+/);
        expect(el.querySelector('.tbc-chat-text img.tbc-chat-emoji')!.getAttribute('src')).toBe('https://e/c.gif');
    });

    it('후원 템플릿: 금액, 메시지 없으면 본문 줄 생략', () => {
        const el = renderChzzkChat(chat({ type: 10, message: '', extras: { payAmount: 1000 } }));
        expect(el.className).toBe('tbc-chat tbc-chat--donation');
        expect(el.querySelector('.tbc-chat-amount')!.textContent).toBe('1,000치즈');
        expect(el.querySelector('.tbc-chat-text')).toBeNull();
    });

    it('클린봇 채팅은 루트에 표시 클래스', () => {
        const el = renderChzzkChat(chat({ status: 'CBOTBLIND' }));
        expect(el.classList.contains('tbc-chat--cleanbot')).toBe(true);
        expect(el.querySelector('details.tbc-chat-cleanbot > i')!.textContent).toBe('안녕');
    });

    it('닉네임에 든 HTML은 글자로만 나온다', () => {
        const el = renderChzzkChat(chat({ nickname: '<img src=x onerror=alert(1)>' }));
        expect(el.querySelector('.tbc-chat-nick')!.textContent).toBe('<img src=x onerror=alert(1)>');
        expect(el.querySelector('.tbc-chat-nick img')).toBeNull();
    });

    it('사용자 템플릿의 스크립트·이벤트 속성·javascript: URL은 제거된다', () => {
        const el = renderChzzkChat(chat(), {
            templates: { chat: '<script>alert(1)</script><b onclick="alert(1)">{{nickname}}</b><a href="javascript:alert(1)">x</a>' },
        });
        expect(el.querySelector('script')).toBeNull();
        expect(el.querySelector('b')!.hasAttribute('onclick')).toBe(false);
        expect(el.querySelector('a')!.getAttribute('href')).toBeNull();
        expect(el.querySelector('b')!.textContent).toBe('시청자');
    });

    it('스크립트가 맨 앞에 와도 뒤 요소의 이벤트 속성이 남지 않는다 (happy-dom 파서 특이 케이스)', () => {
        const el = renderChzzkChat(chat(), {
            templates: { chat: '<script>1</script><img src="x" onerror="alert(1)"><svg onload="alert(1)"></svg><iframe src="https://x"></iframe>' },
        });
        expect(el.innerHTML).not.toMatch(/onerror|onload|<script|<svg|<iframe/i);
    });

    it('공백·제어 문자로 숨긴 javascript: URL도 제거, http(s)와 data:image는 유지', () => {
        const el = renderChzzkChat(chat(), {
            templates: { chat: '<a href=" java\tscript:alert(1)">a</a><a href="https://ok">b</a><img src="data:image/png;base64,AA"><a href="data:text/html,x">c</a>' },
        });
        const as = el.querySelectorAll('a');
        expect(as[0].getAttribute('href')).toBeNull();
        expect(as[1].getAttribute('href')).toBe('https://ok');
        expect(el.querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,AA');
        expect(as[2].getAttribute('href')).toBeNull();
    });

    it('사용자 템플릿 문법 오류면 그 종류만 기본 템플릿으로', () => {
        const el = renderChzzkChat(chat(), { templates: { chat: '{{#badges}}깨짐' } });
        expect(el.querySelector('.tbc-chat-nick')!.textContent).toBe('시청자');
    });

    it('기본 템플릿 3종은 모두 문법이 맞다', () => {
        for (const type of [1, 10, 11]) {
            expect(() => renderChzzkChat(chat({ type, extras: { payAmount: 1, month: 1 } }), { templates: DEFAULT_CHZZK_TEMPLATES })).not.toThrow();
        }
    });
});
