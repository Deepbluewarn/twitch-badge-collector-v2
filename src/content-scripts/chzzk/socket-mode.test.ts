import { describe, it, expect } from 'vitest';
import { isSocketRenderEnabled } from './socket-mode';

describe('isSocketRenderEnabled', () => {
    it('기본은 켜짐 (manifest에 값이 없을 때)', () => {
        expect(isSocketRenderEnabled({}, null)).toBe(true);
        expect(isSocketRenderEnabled(undefined, null)).toBe(true);
    });

    it('OTA socketRender: 0이면 끔 (원격 비상 스위치)', () => {
        expect(isSocketRenderEnabled({ socketRender: 0 }, null)).toBe(false);
        expect(isSocketRenderEnabled({ socketRender: '0' }, null)).toBe(false);
        expect(isSocketRenderEnabled({ socketRender: 1 }, null)).toBe(true);
    });

    it('localStorage가 OTA보다 우선', () => {
        expect(isSocketRenderEnabled({ socketRender: 0 }, '1')).toBe(true);
        expect(isSocketRenderEnabled({}, '0')).toBe(false);
    });

    it('localStorage의 다른 값은 무시', () => {
        expect(isSocketRenderEnabled({ socketRender: 0 }, 'yes')).toBe(false);
        expect(isSocketRenderEnabled({}, 'no')).toBe(true);
    });
});
