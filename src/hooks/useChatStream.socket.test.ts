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
    prepareChatClone: vi.fn(),
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

describe('useChatStream — 소켓 렌더 모드', () => {
    beforeEach(() => localStorage.setItem('tbc:socket-render', '1'));
    afterEach(() => {
        // 이전 테스트의 hook이 남아 있으면 그 listener도 메시지를 받는다.
        unmounts.splice(0).forEach(u => u());
        vi.mocked(adapter.extract).mockClear();
        localStorage.clear();
    });

    it('필터를 통과한 소켓 채팅만 렌더해서 넘긴다', () => {
        const { passed } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat(), chat({ id: 'u2_1000', uid: 'u2', badges: [] })] });
        expect(passed).toHaveBeenCalledTimes(1);
        const p = passed.mock.calls[0][0];
        expect(p).toMatchObject({ key: 'u1_1000', time: 1000, prevKey: '', nickname: '시청자', text: '원문' });
        expect(p.clone.querySelector('.tbc-chat-text').textContent).toBe('원문');
    });

    it('같은 채팅은 한 번만 (recent와 live 중복)', () => {
        const { passed } = setup();
        sock({ kind: 'chats', recent: true, chats: [chat()] });
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        expect(passed).toHaveBeenCalledTimes(1);
    });

    it('나중에 블라인드되면 같은 key로 교체 — 원문이 사라지고 미리보기 텍스트도 비운다', () => {
        const { updated } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat()] });
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
        sock({ kind: 'blind', event: { id: 'u1_1000', blindType: 'CBOTBLIND' } });
        expect(updated.mock.calls[0][0].clone.querySelector('details.tbc-chat-cleanbot > i').textContent).toBe('원문');
    });

    it('해제(CANCEL)되면 원문으로 되돌린다', () => {
        const { updated } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat({ status: 'BLIND' })] });
        sock({ kind: 'blind', event: { id: 'u1_1000', blindType: 'CANCEL', message: { content: '돌아온 원문', emojis: {} } } });
        const u = updated.mock.calls[0][0];
        expect(u.text).toBe('돌아온 원문');
        expect(u.clone.querySelector('.tbc-chat-text').textContent).toBe('돌아온 원문');
    });

    it('넘기지 않은 채팅의 블라인드는 무시', () => {
        const { updated } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat({ badges: [] })] });
        sock({ kind: 'blind', event: { id: 'u1_1000', blindType: 'HIDDEN' } });
        sock({ kind: 'blind', event: { id: 'nope_1', blindType: 'HIDDEN' } });
        expect(updated).not.toHaveBeenCalled();
    });

    it('소켓이 동작하면 라이브 HTML 채팅은 수집하지 않는다', () => {
        const { passed } = setup(() => ({ pass: true }));
        sock({ kind: 'connected', cid: 'CID' });
        send({ action: TBC_CHAT_PASSED_ACTION, key: 'u9_5_r', time: 5, prevKey: null, html: '<div>html</div>' });
        expect(adapter.extract).not.toHaveBeenCalled();
        expect(passed).not.toHaveBeenCalled();
    });

    it('기본으로 켜져 있다 (플래그 없음)', () => {
        localStorage.removeItem('tbc:socket-render');
        const { passed } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        expect(passed).toHaveBeenCalledTimes(1);
    });

    it('로컬 플래그로 끄면 소켓 메시지를 무시한다', () => {
        localStorage.setItem('tbc:socket-render', '0');
        const { passed } = setup();
        sock({ kind: 'chats', recent: false, chats: [chat()] });
        expect(passed).not.toHaveBeenCalled();
    });
});
