// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Observer } from './observer';

function addChild(parent: Element) {
    parent.appendChild(document.createElement('div'));
}

/** MutationObserver 콜백은 microtask 로 온다. */
function flush() {
    return new Promise((r) => setTimeout(r, 0));
}

afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
});

describe('Observer.disconnect', () => {
    it('붙어 있던 요소의 이후 mutation 을 더 이상 넘기지 않는다', async () => {
        vi.useFakeTimers();
        const target = document.createElement('ul');
        target.className = 'target';
        document.body.appendChild(target);

        const cb = vi.fn();
        const obs = new Observer('.target', false);
        obs.observe(cb);
        vi.advanceTimersByTime(100);
        vi.useRealTimers();

        addChild(target);
        await flush();
        const before = cb.mock.calls.filter(([, mr]) => mr).length;
        expect(before).toBe(1);

        obs.disconnect();
        addChild(target);
        await flush();

        expect(cb.mock.calls.filter(([, mr]) => mr).length).toBe(before);
    });

    it('요소를 찾는 중이었으면 찾기도 멈춘다 — 끊긴 뒤 늦게 붙지 않는다', () => {
        vi.useFakeTimers();
        const cb = vi.fn();
        const obs = new Observer('.late', false);
        obs.observe(cb);
        vi.advanceTimersByTime(300);

        obs.disconnect();
        const late = document.createElement('div');
        late.className = 'late';
        document.body.appendChild(late);
        vi.advanceTimersByTime(1000);

        expect(cb).not.toHaveBeenCalled();
    });
});
