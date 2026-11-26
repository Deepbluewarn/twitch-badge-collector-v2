// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/content-scripts/chzzk/socket-shadow', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/content-scripts/chzzk/socket-shadow')>()),
    isSocketShadowEnabled: () => false,
}));

import useChatStream, { TBC_VOD_REWOUND_EVENT } from './useChatStream';
import type { PlatformAdapter } from '@/platform';
import type { ChatInfo } from '@/interfaces/chat';
import { TBC_CHAT_PASSED_ACTION } from '@/interfaces/chat-attributes';

// 다시보기를 뒤로 감으면 Local이 수집 창을 비운다. 되감은 구간을 다시 지날 때 같은 채팅이 창에 다시 들어가야 한다.

const adapter = {
    type: 'chzzk',
    extract: vi.fn(() => ({ badges: ['b1'], nickName: '스트리머', textContents: ['나 온 거 비밀'] }) as unknown as ChatInfo),
    prepareChatClone: vi.fn(),
} as unknown as PlatformAdapter;

const send = (data: unknown) => window.dispatchEvent(new MessageEvent('message', { data, source: window }));
const chatMsg = () => send({ action: TBC_CHAT_PASSED_ACTION, key: 'k1', time: 1206000, prevKey: null, html: '<div data-tbc-key="k1">채팅</div>' });

let unmount: () => void = () => {};
afterEach(() => unmount());

describe('useChatStream — 다시보기 되감기', () => {
    it('되감기 전엔 같은 채팅을 한 번만 넘긴다', () => {
        const passed = vi.fn();
        ({ unmount } = renderHook(() => useChatStream(adapter, () => ({ pass: true }), passed, vi.fn())));
        chatMsg();
        chatMsg();
        expect(passed).toHaveBeenCalledTimes(1);
    });

    it('되감은 뒤 다시 지나가면 다시 넘긴다', () => {
        const passed = vi.fn();
        ({ unmount } = renderHook(() => useChatStream(adapter, () => ({ pass: true }), passed, vi.fn())));
        chatMsg();
        window.dispatchEvent(new CustomEvent(TBC_VOD_REWOUND_EVENT));
        chatMsg();
        expect(passed).toHaveBeenCalledTimes(2);
    });
});
