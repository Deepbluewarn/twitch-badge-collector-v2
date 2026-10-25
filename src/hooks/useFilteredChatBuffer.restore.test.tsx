// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import useFilteredChatBuffer from './useFilteredChatBuffer';
import type { PlatformAdapter } from '@/platform';

vi.stubGlobal('browser', { runtime: { id: 'test' } });

// 소켓 모드: 옛 창에 보이던 채팅(salvage)은 화면 key(uid_time_random), 저장소는 버퍼 key(uid_time)다.
vi.mock('@/content-scripts/base/salvage', () => ({
    takeLeftoverChats: () => [
        { key: 'u2_200_r2', time: 200, html: '<div>b</div>' },
        { key: 'u1_100_r1', time: 100, html: '<div>a</div>' },
    ],
}));
vi.mock('@/utils/chat-history-store', () => ({
    hasChatHistoryStore: () => true,
    loadChatHistory: async () => ({ version: 1, chats: [
        { key: 'u0_50', time: 50, html: '<div>z</div>' },
        { key: 'u1_100', time: 100, html: '<div>a</div>' },
        { key: 'u2_200', time: 200, html: '<div>b</div>' },
    ] }),
    saveChatHistory: async () => {},
    removeChatHistory: async () => {},
}));

describe('업데이트 직후 옛 창 채팅과 저장소 합치기', () => {
    it('key 모양이 달라도 같은 시각이면 한 번만 — 소켓 모드에서 업데이트 전 채팅이 두 번 들어가던 문제', async () => {
        const adapter = { chatOrder: 'newest-top', supportsChatPersistence: true, getCurrentChannelId: () => 'ch' } as unknown as PlatformAdapter;
        const { result } = renderHook(() => useFilteredChatBuffer(adapter, 100, 'ch', 'chatHistory:chzzk:ch:live'));
        await waitFor(() => expect(result.current.savedChats.map(c => c.time)).toContain(50));
        expect(result.current.savedChats.map(c => c.time).sort((a, b) => a - b)).toEqual([50, 100, 200]);
    });
});
