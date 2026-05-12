// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import useFilteredChatBuffer from './useFilteredChatBuffer';
import { PlatformAdapter } from '@/platform';
import { PassedChat } from './useChatStream';

// addChat이 받는 PassedChat 빌더. 실제 DOM clone은 빈 div로 충분 — buffer는
// 정렬/dedupe/트림 로직만 다루고 JSX 내용은 들여다보지 않음.
const passed = (over: Partial<PassedChat> = {}): PassedChat => ({
    clone: document.createElement('div'),
    key: 'k',
    time: 0,
    prevKey: null,
    ...over,
});

// adapter는 chatOrder 속성만 buffer가 사용. 그 외 메서드/필드는 mock.
function makeAdapter(chatOrder: 'newest-top' | 'newest-bottom'): PlatformAdapter {
    return { chatOrder } as unknown as PlatformAdapter;
}

describe('useFilteredChatBuffer', () => {
    it('starts empty', () => {
        const { result } = renderHook(() => useFilteredChatBuffer(makeAdapter('newest-bottom'), 100));
        expect(result.current.chats).toEqual([]);
    });

    it('addChat appends a new chat', () => {
        const { result } = renderHook(() => useFilteredChatBuffer(makeAdapter('newest-bottom'), 100));

        act(() => result.current.addChat(passed({ key: 'a', time: 1 })));

        expect(result.current.chats).toHaveLength(1);
        expect(result.current.chats[0].key).toBe('a');
    });

    it('dedupes by key — same key added twice produces one entry', () => {
        const { result } = renderHook(() => useFilteredChatBuffer(makeAdapter('newest-bottom'), 100));

        act(() => result.current.addChat(passed({ key: 'a', time: 1 })));
        act(() => result.current.addChat(passed({ key: 'a', time: 99 })));

        expect(result.current.chats).toHaveLength(1);
    });

    // 삽입 위치는 host DOM의 prevSibling 기준. time 안 봄.
    // newest-bottom(twitch, normal column): host가 DOM 끝에 append → prevKey = 직전 chat.
    it('newest-bottom: places by DOM prev sibling', () => {
        const { result } = renderHook(() => useFilteredChatBuffer(makeAdapter('newest-bottom'), 100));

        act(() => result.current.addChat(passed({ key: 'b', time: 200, prevKey: null })));
        act(() => result.current.addChat(passed({ key: 'a', time: 100, prevKey: 'b' })));
        act(() => result.current.addChat(passed({ key: 'c', time: 300, prevKey: 'a' })));

        // 'a'의 time이 더 작아도 DOM 순서대로 b, a, c.
        expect(result.current.chats.map(c => c.key)).toEqual(['b', 'a', 'c']);
    });

    // newest-top(chzzk, column-reverse): host가 DOM[0]에 prepend → prevKey = null.
    it('newest-top: prepends when prevKey is null (chzzk live pattern)', () => {
        const { result } = renderHook(() => useFilteredChatBuffer(makeAdapter('newest-top'), 100));

        act(() => result.current.addChat(passed({ key: 'b', time: 200, prevKey: null })));
        act(() => result.current.addChat(passed({ key: 'a', time: 100, prevKey: null })));
        act(() => result.current.addChat(passed({ key: 'c', time: 300, prevKey: null })));

        // 마지막 도착 'c'가 맨 앞. time 무관.
        expect(result.current.chats.map(c => c.key)).toEqual(['c', 'a', 'b']);
    });

    it('newest-bottom: when maxChats is reached, trims from the start (oldest)', () => {
        const { result } = renderHook(() => useFilteredChatBuffer(makeAdapter('newest-bottom'), 3));

        act(() => result.current.addChat(passed({ key: 'a', time: 1, prevKey: null })));
        act(() => result.current.addChat(passed({ key: 'b', time: 2, prevKey: 'a' })));
        act(() => result.current.addChat(passed({ key: 'c', time: 3, prevKey: 'b' })));
        act(() => result.current.addChat(passed({ key: 'd', time: 4, prevKey: 'c' })));

        // newest-bottom이라 정렬은 ascending. 트림은 시작(=오래된 것)부터.
        expect(result.current.chats.map(c => c.key)).toEqual(['b', 'c', 'd']);
    });

    it('newest-top: when maxChats is reached, trims from the end (oldest)', () => {
        const { result } = renderHook(() => useFilteredChatBuffer(makeAdapter('newest-top'), 3));

        act(() => result.current.addChat(passed({ key: 'a', time: 1 })));
        act(() => result.current.addChat(passed({ key: 'b', time: 2 })));
        act(() => result.current.addChat(passed({ key: 'c', time: 3 })));
        act(() => result.current.addChat(passed({ key: 'd', time: 4 })));

        // newest-top이라 정렬은 descending. 트림은 끝(=오래된 것)부터.
        // 4개 추가됐으니 max 3을 넘는 1개를 끝에서 잘라낼 수 있어야 함. 다만 현재
        // 구현은 splice(length-1, overflow)라 *마지막 1개만* 잘라냄 (오래된 게
        // 가장 끝에 있으므로 의도 일치).
        expect(result.current.chats.map(c => c.key)).toEqual(['d', 'c', 'b']);
    });

    it('clear empties the buffer', () => {
        const { result } = renderHook(() => useFilteredChatBuffer(makeAdapter('newest-bottom'), 100));

        act(() => result.current.addChat(passed({ key: 'a', time: 1 })));
        act(() => result.current.addChat(passed({ key: 'b', time: 2 })));
        expect(result.current.chats).toHaveLength(2);

        act(() => result.current.clear());
        expect(result.current.chats).toEqual([]);
    });
});
