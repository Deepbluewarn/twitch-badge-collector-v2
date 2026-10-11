import { describe, it, expect } from 'vitest';
import { isSocketRenderEnabled } from './socket-mode';

describe('isSocketRenderEnabled', () => {
    // manifest를 넘기지 않으면 실제 OTA(bundled) 값을 읽는다 — 그 값은 배포 단계마다 바뀌므로
    // 여기선 항상 명시적으로 넘겨 규칙만 검사한다.
    it('manifest에 값이 없으면 켜짐', () => {
        expect(isSocketRenderEnabled({}, null)).toBe(true);
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
