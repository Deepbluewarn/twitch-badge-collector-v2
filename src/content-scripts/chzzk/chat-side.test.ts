// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { applyChatSide, normalizeChatSide, CHAT_SIDE_ATTR } from './chat-side';

describe('normalizeChatSide', () => {
    it("'left'만 좌측으로 받는다", () => {
        expect(normalizeChatSide('left')).toBe('left');
    });

    // storage는 스키마가 없다. 구버전 잔존값/오타/backfill 전 undefined가 그대로 들어온다.
    // 치지직 기본 배치가 오른쪽이므로 모르는 값은 전부 오른쪽 = "손대지 않음"이어야 한다.
    it.each([undefined, null, '', 'right', 'LEFT', 'up', 0, {}, true])(
        '알 수 없는 값(%o)은 오른쪽으로 접는다',
        (raw) => {
            expect(normalizeChatSide(raw)).toBe('right');
        },
    );
});

describe('applyChatSide', () => {
    let root: HTMLElement;

    beforeEach(() => {
        root = document.createElement('html');
    });

    it("left면 <html>에 스위치 속성을 건다", () => {
        expect(applyChatSide('left', root)).toBe('left');
        expect(root.getAttribute(CHAT_SIDE_ATTR)).toBe('left');
    });

    // 기본값일 때 속성을 남겨두면 "확장이 레이아웃에 손대는 중"이라는 흔적이 남아
    // 호스트 CSS와 겹칠 때 원인 추적을 방해한다.
    it('right면 속성을 남기지 않는다', () => {
        expect(applyChatSide('right', root)).toBe('right');
        expect(root.hasAttribute(CHAT_SIDE_ATTR)).toBe(false);
    });

    it('left → right로 되돌리면 속성이 지워진다', () => {
        applyChatSide('left', root);
        applyChatSide('right', root);
        expect(root.hasAttribute(CHAT_SIDE_ATTR)).toBe(false);
    });

    it('같은 값을 여러 번 적용해도 결과가 같다 (idempotent)', () => {
        applyChatSide('left', root);
        applyChatSide('left', root);
        expect(root.getAttribute(CHAT_SIDE_ATTR)).toBe('left');
    });

    // storage 리스너가 newValue를 그대로 넘긴다 — 검증은 여기 한 곳에서만 한다.
    it('알 수 없는 값이 와도 던지지 않고 오른쪽으로 접는다', () => {
        applyChatSide('left', root);
        expect(applyChatSide(undefined, root)).toBe('right');
        expect(root.hasAttribute(CHAT_SIDE_ATTR)).toBe(false);
    });

    it('인자를 생략하면 document.documentElement에 적용한다', () => {
        applyChatSide('left');
        expect(document.documentElement.getAttribute(CHAT_SIDE_ATTR)).toBe('left');
        applyChatSide('right');
        expect(document.documentElement.hasAttribute(CHAT_SIDE_ATTR)).toBe(false);
    });
});
