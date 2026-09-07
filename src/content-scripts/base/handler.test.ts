// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Handle } from './handler';
import { PlatformAdapter } from '@/platform';

const written: Record<string, unknown>[] = [];

// content script가 쓰는 browser.storage.local만 최소 stub.
vi.stubGlobal('browser', {
    storage: {
        local: {
            set: (v: Record<string, unknown>) => { written.push(v); return Promise.resolve(); },
            get: () => Promise.resolve({}),
        },
    },
});

function makeAdapter(): PlatformAdapter {
    return {
        type: 'chzzk',
        // rect.height 600, y 0 기준: clientY 180 → (1 - 180/600)*100 = 70
        computeDragRatio: (rect: DOMRect, clientY: number) =>
            Math.max(0, Math.min(100, Math.round((1 - (clientY - rect.y) / rect.height) * 100))),
    } as unknown as PlatformAdapter;
}

function setupDom() {
    document.body.innerHTML = `
        <div id="tbc-chzzk-chat-list-container">
            <div id="chzzk-container" style="order: 1"></div>
            <div id="tbc-chzzk-chat-list-wrapper"></div>
        </div>
    `;
    const parent = document.getElementById('tbc-chzzk-chat-list-container') as HTMLElement;
    // happy-dom은 layout 없음 → getBoundingClientRect가 전부 0. 드래그 계산이
    // 0으로 나눠 NaN 나므로 실제 채팅창 크기를 흉내낸다.
    parent.getBoundingClientRect = () => ({ height: 600, y: 0, top: 0 }) as DOMRect;
    return parent;
}

function drag(handle: Handle, parent: HTMLElement, clientY: number) {
    parent.prepend(handle.getHandle());
    handle.getHandle().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientY }));
    window.dispatchEvent(new MouseEvent('mouseup'));
}

describe('Handle drag → containerRatio 저장', () => {
    beforeEach(() => {
        written.length = 0;
        setupDom();
    });

    it('드래그하면 계산된 비율이 storage에 기록된다', () => {
        const parent = setupDom();
        const handle = new Handle(makeAdapter(), '#tbc-chzzk-chat-list-container');

        drag(handle, parent, 180);

        expect(written).toContainEqual({ containerRatio: 70 });
    });

    it('드래그 없이 클릭만 하면 기록하지 않는다', () => {
        const parent = setupDom();
        const handle = new Handle(makeAdapter(), '#tbc-chzzk-chat-list-container');
        parent.prepend(handle.getHandle());

        handle.getHandle().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        window.dispatchEvent(new MouseEvent('mouseup'));

        expect(written).toHaveLength(0);
    });

    it('NaN 비율은 저장하지 않는다', () => {
        const parent = setupDom();
        const adapter = { type: 'chzzk', computeDragRatio: () => NaN } as unknown as PlatformAdapter;
        const handle = new Handle(adapter, '#tbc-chzzk-chat-list-container');

        drag(handle, parent, 180);

        expect(written).toHaveLength(0);
    });
});
