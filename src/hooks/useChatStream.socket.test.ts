// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// shadow 비교는 dev(테스트 포함)에서 자동으로 켜지고 비교용으로 extract를 부른다 — 여기선 끈다.
vi.mock('@/content-scripts/chzzk/socket-shadow', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/content-scripts/chzzk/socket-shadow')>()),
    isSocketShadowEnabled: () => false,
}));

import useChatStream from './useChatStream';
import type { PlatformAdapter } from '@/platform';
import type { ChatInfo } from '@/interfaces/chat';
import { TBC_CHAT_PASSED_ACTION, TBC_SOCKET_CHAT_ACTION, TbcSocketChatMessage } from '@/interfaces/chat-attributes';
import type { ChzzkSocketChat } from '@/platform/chzzk-socket';

// 소켓 렌더 모드의 끝단 흐름: 탭 메시지 → 필터 → 렌더 → Container, 그리고 블라인드 이벤트 → 교체.

const adapter = {
    type: 'chzzk',
    extract: vi.fn(() => undefined),
    prepareChatClone: vi.fn((el: HTMLElement) => el.setAttribute('data-prepared', '1')),
} as unknown as PlatformAdapter;

function chat(over: Partial<ChzzkSocketChat> = {}): ChzzkSocketChat {
    return {
        id: 'u1_1000', uid: 'u1', time: 1000, type: 1, status: 'NORMAL',
        nickname: '시청자', anonymous: false, message: '원문', emojis: {},
        badges: ['b1'], verified: false, userRoleCode: 'common_user', extras: {},
        ...over,
    };
}

// window.postMessage는 비동기라 바로 dispatch — 핸들러는 e.source === window만 본다.
function send(data: unknown) {
    window.dispatchEvent(new MessageEvent('message', { data, source: window }));
}
// union의 각 갈래에서 action만 뺀다 (Omit을 union에 바로 쓰면 공통 필드만 남는다).
type WithoutAction<T> = T extends unknown ? Omit<T, 'action'> : never;
const sock = (msg: WithoutAction<TbcSocketChatMessage>) => send({ action: TBC_SOCKET_CHAT_ACTION, ...msg });

const unmounts: (() => void)[] = [];

function setup(predicate = (c: ChatInfo) => ({ pass: c.badges.includes('b1') })) {
    const passed = vi.fn();
    const updated = vi.fn();
    const { unmount } = renderHook(() => useChatStream(adapter, predicate, passed, updated));
    unmounts.push(unmount);
    return { passed, updated };
}

/** 원본(host html)이 끝내 안 오는 경우 — 대기 시간이 지나 직접 그린다. */
const noOriginal = () => vi.advanceTimersByTime(1200);

describe('useChatStream — 소켓 렌더 모드 (원본이 안 와서 직접 그리는 경로)', () => {
    beforeEach(() => {
        localStorage.setItem('tbc:socket-render', '1');
        vi.useFakeTimers();
    });
    afterEach(() => {
        // 이전 테스트의 hook이 남아 있으면 그 listener도 메시지를 받는다.
        unmounts.splice(0).forEach(u => u());
        vi.mocked(adapter.extract).mockClear();
        vi.mocked(adapter.prepareChatClone).mockClear();
        vi.useRealTimers();
        localStorage.clear();
    });

    it('필터를 통과한 소켓 채팅만 렌더해서 넘긴다', () => {
        const { passed } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat(), chat({ id: 'u2_1000', uid: 'u2', badges: [] })] });
        noOriginal();
        expect(passed).toHaveBeenCalledTimes(1);
        const p = passed.mock.calls[0][0];
        expect(p).toMatchObject({ key: 'u1_1000', time: 1000, prevKey: '', nickname: '시청자', text: '원문' });
        expect(p.clone.querySelector('.tbc-chat-text').textContent).toBe('원문');
    });

    it('같은 채팅은 한 번만 (recent와 live 중복)', () => {
        const { passed } = setup();
        sock({ kind: 'chats', recent: true, chats: [chat()] });
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        noOriginal();
        expect(passed).toHaveBeenCalledTimes(1);
    });

    it('나중에 블라인드되면 같은 key로 교체 — 원문이 사라지고 미리보기 텍스트도 비운다', () => {
        const { updated } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        noOriginal();
        sock({ kind: 'blind', event: { id: 'u1_1000', blindType: 'HIDDEN' } });
        expect(updated).toHaveBeenCalledTimes(1);
        const u = updated.mock.calls[0][0];
        expect(u.key).toBe('u1_1000');
        expect(u.text).toBe('');
        expect(u.clone.textContent).not.toContain('원문');
        expect(u.clone.querySelector('.tbc-chat-blinded')).not.toBeNull();
    });

    it('클린봇 블라인드는 클릭해서 볼 수 있는 형태로', () => {
        const { updated } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        noOriginal();
        sock({ kind: 'blind', event: { id: 'u1_1000', blindType: 'CBOTBLIND' } });
        expect(updated.mock.calls[0][0].clone.querySelector('details.tbc-chat-cleanbot > i').textContent).toBe('원문');
    });

    it('해제(CANCEL)되면 원문으로 되돌린다', () => {
        const { updated } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat({ status: 'BLIND' })] });
        noOriginal();
        sock({ kind: 'blind', event: { id: 'u1_1000', blindType: 'CANCEL', message: { content: '돌아온 원문', emojis: {} } } });
        const u = updated.mock.calls[0][0];
        expect(u.text).toBe('돌아온 원문');
        expect(u.clone.querySelector('.tbc-chat-text').textContent).toBe('돌아온 원문');
    });

    it('넘기지 않은 채팅의 블라인드는 무시', () => {
        const { updated } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat({ badges: [] })] });
        noOriginal();
        sock({ kind: 'blind', event: { id: 'u1_1000', blindType: 'HIDDEN' } });
        sock({ kind: 'blind', event: { id: 'nope_1', blindType: 'HIDDEN' } });
        expect(updated).not.toHaveBeenCalled();
    });

    it('소켓이 동작하면 라이브 HTML 채팅은 수집하지 않는다', () => {
        const { passed } = setup(() => ({ pass: true }));
        sock({ kind: 'connected', cid: 'CID' });
        send({ action: TBC_CHAT_PASSED_ACTION, key: 'u9_5_r', time: 5, prevKey: null, html: '<div>html</div>' });
        noOriginal();
        expect(adapter.extract).not.toHaveBeenCalled();
        expect(passed).not.toHaveBeenCalled();
    });

    it('기본으로 켜져 있다 (플래그 없음)', () => {
        localStorage.removeItem('tbc:socket-render');
        const { passed } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        noOriginal();
        expect(passed).toHaveBeenCalledTimes(1);
    });

    it('로컬 플래그로 끄면 소켓 메시지를 무시한다', () => {
        localStorage.setItem('tbc:socket-render', '0');
        const { passed } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        noOriginal();
        expect(passed).not.toHaveBeenCalled();
    });
});

describe('useChatStream — 원본 우선 표시', () => {
    beforeEach(() => {
        localStorage.setItem('tbc:socket-render', '1');
        vi.useFakeTimers();
    });
    afterEach(() => {
        unmounts.splice(0).forEach(u => u());
        vi.mocked(adapter.prepareChatClone).mockClear();
        vi.useRealTimers();
        localStorage.clear();
    });

    const hostHtml = (key: string, text = '원본') => send({
        action: TBC_CHAT_PASSED_ACTION, key, time: 1000, prevKey: null,
        html: `<div data-tbc-chat-key="${key}"><span class="host">${text}</span></div>`,
    });

    it('원본이 그려지면 그 복제본을 넘긴다 (기존 HTML 경로와 같은 결과)', () => {
        const { passed } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        expect(passed).not.toHaveBeenCalled();
        hostHtml('u1_1000_rand');
        expect(passed).toHaveBeenCalledTimes(1);
        const p = passed.mock.calls[0][0];
        expect(p.key).toBe('u1_1000');
        expect(p.clone.querySelector('.host').textContent).toBe('원본');
        expect(p.clone.getAttribute('data-prepared')).toBe('1');
    });

    it('1.2초 안에 원본이 없으면 일단 직접 그린다', () => {
        const { passed } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        vi.advanceTimersByTime(1199);
        expect(passed).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(passed).toHaveBeenCalledTimes(1);
        expect(passed.mock.calls[0][0].clone.classList.contains('tbc-chat')).toBe(true);
    });

    it('직접 그린 뒤 원본이 오면 원본으로 교체한다 (원본 우선)', () => {
        const { passed, updated } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        vi.advanceTimersByTime(1200);
        hostHtml('u1_1000_rand', '늦은 원본');
        expect(passed).toHaveBeenCalledTimes(1);
        expect(updated).toHaveBeenCalledTimes(1);
        const u = updated.mock.calls[0][0];
        expect(u).toMatchObject({ key: 'u1_1000', text: '원문' });
        expect(u.clone.querySelector('.host').textContent).toBe('늦은 원본');
        expect(u.clone.getAttribute('data-prepared')).toBe('1');
    });

    it('교체는 한 번만 (가상 스크롤로 원본이 다시 와도)', () => {
        const { updated } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        vi.advanceTimersByTime(1200);
        hostHtml('u1_1000_r1');
        hostHtml('u1_1000_r2');
        expect(updated).toHaveBeenCalledTimes(1);
    });

    it('10초가 넘게 늦은 원본으로는 교체하지 않는다', () => {
        const { updated } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        vi.advanceTimersByTime(1200);
        vi.setSystemTime(Date.now() + 10_001);
        hostHtml('u1_1000_rand');
        expect(updated).not.toHaveBeenCalled();
    });

    it('직접 그린 뒤 블라인드됐으면 늦게 온 원본으로 바꾸지 않는다', () => {
        const { updated } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        vi.advanceTimersByTime(1200);
        sock({ kind: 'blind', event: { id: 'u1_1000', blindType: 'HIDDEN' } });
        hostHtml('u1_1000_rand');
        expect(updated).toHaveBeenCalledTimes(1);
        expect(updated.mock.calls[0][0].clone.querySelector('.tbc-chat-blinded')).not.toBeNull();
    });

    it('원본이 소켓보다 먼저 와도 원본을 쓴다', () => {
        const { passed } = setup();
        sock({ kind: 'connected', cid: 'CID' });
        hostHtml('u1_1000_rand', '먼저 온 원본');
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        expect(passed).toHaveBeenCalledTimes(1);
        expect(passed.mock.calls[0][0].clone.querySelector('.host').textContent).toBe('먼저 온 원본');
    });

    it('필터에 걸리지 않은 채팅은 원본이 와도 넘기지 않는다', () => {
        const { passed } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat({ badges: [] })] });
        hostHtml('u1_1000_rand');
        vi.advanceTimersByTime(5000);
        expect(passed).not.toHaveBeenCalled();
    });

    it('기다리는 중 블라인드되면 바로 직접 그린 (가려진) 모양으로', () => {
        const { passed, updated } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        sock({ kind: 'blind', event: { id: 'u1_1000', blindType: 'HIDDEN' } });
        expect(passed).toHaveBeenCalledTimes(1);
        expect(passed.mock.calls[0][0].clone.querySelector('.tbc-chat-blinded')).not.toBeNull();
        expect(updated).not.toHaveBeenCalled();
        hostHtml('u1_1000_rand');
        vi.advanceTimersByTime(5000);
        expect(passed).toHaveBeenCalledTimes(1);
    });

    it('원본으로 넣은 뒤 블라인드되면 직접 그린 모양으로 교체', () => {
        const { updated } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        hostHtml('u1_1000_rand');
        sock({ kind: 'blind', event: { id: 'u1_1000', blindType: 'BLIND' } });
        expect(updated.mock.calls[0][0].clone.querySelector('.tbc-chat-blinded')).not.toBeNull();
    });

    it('unmount하면 대기 타이머도 정리', () => {
        const { passed } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        unmounts.splice(0).forEach(u => u());
        vi.advanceTimersByTime(5000);
        expect(passed).not.toHaveBeenCalled();
    });
});

describe('useChatStream — 사용자 템플릿 켜짐', () => {
    beforeEach(() => {
        localStorage.setItem('tbc:socket-render', '1');
        vi.useFakeTimers();
    });
    afterEach(() => {
        unmounts.splice(0).forEach(u => u());
        vi.useRealTimers();
        localStorage.clear();
    });

    function setupCustom(templates: Record<string, string>) {
        const passed = vi.fn();
        const updated = vi.fn();
        const { unmount } = renderHook(() => useChatStream(
            adapter, c => ({ pass: c.badges.includes('b1') }), passed, updated,
            () => ({ custom: true, templates }),
        ));
        unmounts.push(unmount);
        return { passed, updated };
    }

    it('원본을 기다리지 않고 바로 사용자 템플릿으로 그린다', () => {
        const { passed } = setupCustom({ chat: '<b class="mine">{{nickname}}: {{message}}</b>' });
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        expect(passed).toHaveBeenCalledTimes(1);
        expect(passed.mock.calls[0][0].clone.querySelector('.mine').textContent).toBe('시청자: 원문');
    });

    it('블라인드 표시도 사용자 템플릿으로 (가리기는 messageHtml에 들어 있다)', () => {
        const { updated } = setupCustom({ chat: '<b class="mine">{{{messageHtml}}}</b>' });
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        sock({ kind: 'blind', event: { id: 'u1_1000', blindType: 'HIDDEN' } });
        const clone = updated.mock.calls[0][0].clone;
        expect(clone.querySelector('.mine .tbc-chat-blinded')).not.toBeNull();
        expect(clone.textContent).not.toContain('원문');
    });

    it('고치지 않은 종류는 기본 템플릿', () => {
        const { passed } = setupCustom({ donation: '<i>후원</i>' });
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        expect(passed.mock.calls[0][0].clone.querySelector('.tbc-chat-nick').textContent).toBe('시청자');
    });
});

describe('useChatStream — 다시보기 (REST로 미리 받은 채팅)', () => {
    beforeEach(() => {
        localStorage.setItem('tbc:socket-render', '1');
        vi.useFakeTimers();
    });
    afterEach(() => {
        unmounts.splice(0).forEach(u => u());
        vi.mocked(adapter.extract).mockClear();
        vi.mocked(adapter.prepareChatClone).mockClear();
        vi.useRealTimers();
        localStorage.clear();
    });

    const vodChat = (over: Partial<ChzzkSocketChat> = {}) => chat({ playerTime: 61_000, ...over });
    // 다시보기 host key는 랜덤 꼬리 없이 `${uid}_${time}`, inject가 REPLAY 속성을 단다.
    const replayHtml = (key: string, prevKey: string | null = null) => send({
        action: TBC_CHAT_PASSED_ACTION, key, time: 61_000, prevKey,
        html: `<div data-tbc-chat-key="${key}" data-tbc-chat-replay-chat="true"><span class="host">원본</span></div>`,
    });

    it('받아 둔 채팅은 원본이 그려질 때 판정해서 원본 복제본으로 넘긴다', () => {
        const { passed } = setup();
        sock({ kind: 'vod-chats', chats: [vodChat()] });
        expect(passed).not.toHaveBeenCalled();
        replayHtml('u1_1000', 'u0_900');
        expect(passed).toHaveBeenCalledTimes(1);
        const p = passed.mock.calls[0][0];
        expect(p).toMatchObject({ key: 'u1_1000', time: 61_000, prevKey: 'u0_900', text: '원문' });
        expect(p.clone.querySelector('.host').textContent).toBe('원본');
        expect(adapter.extract).not.toHaveBeenCalled();   // HTML 추출을 거치지 않는다
    });

    it('판정은 REST 데이터로 — 필터에 안 걸리면 원본이 와도 넘기지 않는다', () => {
        const { passed } = setup();
        sock({ kind: 'vod-chats', chats: [vodChat({ badges: [] })] });
        replayHtml('u1_1000');
        expect(passed).not.toHaveBeenCalled();
        expect(adapter.extract).not.toHaveBeenCalled();
    });

    it('받아 두지 못한 채팅은 기존 HTML 경로로', () => {
        setup(() => ({ pass: true }));
        replayHtml('nope_1');
        expect(adapter.extract).toHaveBeenCalledTimes(1);
    });

    it('가상 스크롤로 다시 그려져도 한 번만', () => {
        const { passed } = setup();
        sock({ kind: 'vod-chats', chats: [vodChat()] });
        replayHtml('u1_1000');
        replayHtml('u1_1000');
        expect(passed).toHaveBeenCalledTimes(1);
    });

    it('사용자 템플릿이 켜져 있으면 그 템플릿으로, 시각은 영상 안의 위치', () => {
        const passed = vi.fn();
        const { unmount } = renderHook(() => useChatStream(
            adapter, c => ({ pass: c.badges.includes('b1') }), passed, vi.fn(),
            () => ({ custom: true, templates: { chat: '<b class="mine">{{time}} {{nickname}}</b>' } }),
        ));
        unmounts.push(unmount);
        sock({ kind: 'vod-chats', chats: [vodChat()] });
        replayHtml('u1_1000');
        const clone = passed.mock.calls[0][0].clone;
        expect(clone.querySelector('.mine').textContent).toBe('01:01 시청자');
        expect(clone.getAttribute('data-tbc-chat-replay-chat')).toBe('true');
        expect(clone.getAttribute('data-tbc-chat-time')).toBe('61000');
    });

    it('다시보기 응답은 라이브 소켓 모드를 켜지 않는다 (라이브 HTML 채팅은 그대로 수집)', () => {
        setup(() => ({ pass: true }));
        sock({ kind: 'vod-chats', chats: [vodChat()] });
        send({ action: TBC_CHAT_PASSED_ACTION, key: 'u9_5_r', time: 5, prevKey: null, html: '<div>live</div>' });
        expect(adapter.extract).toHaveBeenCalledTimes(1);
    });

    it('소켓 모드를 끄면 다시보기 응답도 무시하고 HTML 경로', () => {
        localStorage.setItem('tbc:socket-render', '0');
        setup(() => ({ pass: true }));
        sock({ kind: 'vod-chats', chats: [vodChat()] });
        replayHtml('u1_1000');
        expect(adapter.extract).toHaveBeenCalledTimes(1);
    });
});
