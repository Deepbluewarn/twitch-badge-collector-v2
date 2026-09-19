// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    applyChatSide, normalizeChatSide, syncSidebarSwap,
    CHAT_SIDE_ATTR, SIDEBAR_SWAP_ATTR, SIDEBAR_WIDTH_VAR,
} from './chat-side';

/** happy-dom은 레이아웃을 계산하지 않아 offsetWidth가 늘 0 — 실측값을 흉내 낸다. */
function sidebarOfWidth(width: number): HTMLElement {
    const el = document.createElement('aside');
    Object.defineProperty(el, 'offsetWidth', { value: width, configurable: true });
    return el;
}

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

    it('left면 채팅 스위치를 건다', () => {
        expect(applyChatSide('left', root)).toBe('left');
        expect(root.getAttribute(CHAT_SIDE_ATTR)).toBe('left');
    });

    // 기본값일 때 속성을 남겨두면 "확장이 레이아웃에 손대는 중"이라는 흔적이 남아
    // 호스트 CSS와 겹칠 때 원인 추적을 방해한다.
    it('right면 흔적을 남기지 않는다', () => {
        expect(applyChatSide('right', root)).toBe('right');
        expect(root.hasAttribute(CHAT_SIDE_ATTR)).toBe(false);
    });

    it('같은 값을 여러 번 적용해도 결과가 같다 (idempotent)', () => {
        applyChatSide('left', root);
        applyChatSide('left', root);
        expect(root.getAttribute(CHAT_SIDE_ATTR)).toBe('left');
    });

    // 끌 때 전역 사이드바 스위치를 같이 내리지 않으면 채팅만 오른쪽으로 돌아오고
    // 내비는 오른쪽에 남아 두 영역이 같은 쪽에서 겹친다.
    it('right로 되돌리면 전역 사이드바 스위치까지 함께 내린다', () => {
        applyChatSide('left', root);
        syncSidebarSwap(sidebarOfWidth(240), root);
        expect(root.hasAttribute(SIDEBAR_SWAP_ATTR)).toBe(true);

        applyChatSide('right', root);

        expect(root.hasAttribute(CHAT_SIDE_ATTR)).toBe(false);
        expect(root.hasAttribute(SIDEBAR_SWAP_ATTR)).toBe(false);
        expect(root.style.getPropertyValue(SIDEBAR_WIDTH_VAR)).toBe('');
    });

    it('인자를 생략하면 document.documentElement에 적용한다', () => {
        applyChatSide('left');
        expect(document.documentElement.getAttribute(CHAT_SIDE_ATTR)).toBe('left');
        applyChatSide('right');
        expect(document.documentElement.hasAttribute(CHAT_SIDE_ATTR)).toBe(false);
    });
});

describe('syncSidebarSwap', () => {
    let root: HTMLElement;

    beforeEach(() => {
        root = document.createElement('html');
        applyChatSide('left', root);
    });

    it('실측 폭을 CSS 변수로 넘기고 스위치를 켠다', () => {
        expect(syncSidebarSwap(sidebarOfWidth(240), root)).toBe(true);
        expect(root.style.getPropertyValue(SIDEBAR_WIDTH_VAR)).toBe('240px');
        expect(root.hasAttribute(SIDEBAR_SWAP_ATTR)).toBe(true);
    });

    // 펼침 240px ↔ 접힘 82px. 상수로 박으면 접었을 때 오른쪽에 빈 띠가 남는다.
    it('접기/펼치기로 폭이 바뀌면 따라간다', () => {
        syncSidebarSwap(sidebarOfWidth(240), root);
        syncSidebarSwap(sidebarOfWidth(82), root);
        expect(root.style.getPropertyValue(SIDEBAR_WIDTH_VAR)).toBe('82px');
    });

    // 추측값으로 켜면 사이드바가 영상을 덮거나(과소) 빈 띠가 생긴다(과다).
    // 둘 다 "안 켜짐"보다 나쁘므로 못 재면 아예 켜지 않는다.
    it('사이드바가 없으면 켜지 않는다', () => {
        expect(syncSidebarSwap(null, root)).toBe(false);
        expect(root.hasAttribute(SIDEBAR_SWAP_ATTR)).toBe(false);
        expect(root.style.getPropertyValue(SIDEBAR_WIDTH_VAR)).toBe('');
    });

    it('폭이 0이면 켜지 않는다 (아직 레이아웃 전)', () => {
        expect(syncSidebarSwap(sidebarOfWidth(0), root)).toBe(false);
        expect(root.hasAttribute(SIDEBAR_SWAP_ATTR)).toBe(false);
    });

    it('폭을 못 재게 되면 이미 켜진 스위치도 내린다', () => {
        syncSidebarSwap(sidebarOfWidth(240), root);
        expect(syncSidebarSwap(null, root)).toBe(false);
        expect(root.hasAttribute(SIDEBAR_SWAP_ATTR)).toBe(false);
        expect(root.style.getPropertyValue(SIDEBAR_WIDTH_VAR)).toBe('');
    });

    it('좌측 배치가 꺼져 있으면 켜지 않는다', () => {
        applyChatSide('right', root);
        expect(syncSidebarSwap(sidebarOfWidth(240), root)).toBe(false);
        expect(root.hasAttribute(SIDEBAR_SWAP_ATTR)).toBe(false);
    });
});

describe('trackSidebarSwap', () => {
    // 모듈 전역(sidebarEl/watching)을 들고 있어 테스트마다 새로 평가해야 한다.
    async function freshModule() {
        vi.resetModules();
        return import('./chat-side');
    }

    beforeEach(() => {
        document.documentElement.removeAttribute(CHAT_SIDE_ATTR);
        document.documentElement.removeAttribute(SIDEBAR_SWAP_ATTR);
        document.documentElement.style.removeProperty(SIDEBAR_WIDTH_VAR);
        document.body.innerHTML = '';
    });

    function mountSidebar(width: number): HTMLElement {
        const el = document.createElement('aside');
        el.id = 'sidebar';
        Object.defineProperty(el, 'offsetWidth', { value: width, configurable: true });
        document.body.appendChild(el);
        return el;
    }

    it('좌측 배치가 꺼져 있으면 아무것도 하지 않는다', async () => {
        const mod = await freshModule();
        mountSidebar(240);

        mod.trackSidebarSwap();

        expect(document.documentElement.hasAttribute(SIDEBAR_SWAP_ATTR)).toBe(false);
    });

    it('이미 떠 있는 사이드바를 즉시 잡는다', async () => {
        const mod = await freshModule();
        mountSidebar(240);
        mod.applyChatSide('left');

        mod.trackSidebarSwap();

        expect(document.documentElement.hasAttribute(SIDEBAR_SWAP_ATTR)).toBe(true);
        expect(document.documentElement.style.getPropertyValue(SIDEBAR_WIDTH_VAR)).toBe('240px');
    });

    it('나중에 붙는 사이드바도 잡는다', async () => {
        const mod = await freshModule();
        mod.applyChatSide('left');
        mod.trackSidebarSwap();
        expect(document.documentElement.hasAttribute(SIDEBAR_SWAP_ATTR)).toBe(false);

        mountSidebar(240);
        await new Promise((r) => setTimeout(r, 50));

        expect(document.documentElement.style.getPropertyValue(SIDEBAR_WIDTH_VAR)).toBe('240px');
    });

    // 껐다 켜면 applyChatSide가 스위치를 내려둔 상태다. 다시 켤 때 폭 변화를 기다리지
    // 않고 즉시 되살아나야 한다 (관찰자는 이미 붙어 있어 재부착되지 않으므로).
    it('껐다 켜면 스위치가 즉시 되살아난다', async () => {
        const mod = await freshModule();
        mountSidebar(240);
        mod.applyChatSide('left');
        mod.trackSidebarSwap();

        mod.applyChatSide('right');
        expect(document.documentElement.hasAttribute(SIDEBAR_SWAP_ATTR)).toBe(false);

        mod.applyChatSide('left');
        mod.trackSidebarSwap();

        expect(document.documentElement.hasAttribute(SIDEBAR_SWAP_ATTR)).toBe(true);
        expect(document.documentElement.style.getPropertyValue(SIDEBAR_WIDTH_VAR)).toBe('240px');
    });

    // SPA 이동으로 치지직이 사이드바를 갈아끼우면 잡고 있던 참조는 죽은 노드다.
    it('SPA 이동으로 사이드바가 교체되면 새 노드를 다시 잡는다', async () => {
        const mod = await freshModule();
        const first = mountSidebar(240);
        mod.applyChatSide('left');
        mod.trackSidebarSwap();
        expect(document.documentElement.style.getPropertyValue(SIDEBAR_WIDTH_VAR)).toBe('240px');

        first.remove();
        mountSidebar(82);
        mod.trackSidebarSwap();

        expect(document.documentElement.style.getPropertyValue(SIDEBAR_WIDTH_VAR)).toBe('82px');
    });
});
