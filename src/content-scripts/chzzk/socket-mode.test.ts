import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';

vi.stubGlobal('browser', fakeBrowser);
const { isSocketRenderEnabled, ensureRolloutBucket, ROLLOUT_BUCKET_KEY, __resetRolloutBucketForTest } = await import('./socket-mode');

// manifest·숫자를 넘기지 않으면 실제 OTA(bundled) 값과 캐시를 읽는다 — 그 값은 배포 단계마다
// 바뀌므로 여기선 항상 명시적으로 넘겨 규칙만 검사한다.
describe('isSocketRenderEnabled', () => {
    it('manifest에 값이 없으면 켜짐', () => {
        expect(isSocketRenderEnabled({}, null, undefined)).toBe(true);
    });

    it('socketRender: 0은 비율과 상관없이 전원 끔 (비상 스위치)', () => {
        expect(isSocketRenderEnabled({ socketRender: 0 }, null, 0)).toBe(false);
        expect(isSocketRenderEnabled({ socketRender: '0', socketRenderPercent: 100 }, null, 0)).toBe(false);
        expect(isSocketRenderEnabled({ socketRender: 1 }, null, 50)).toBe(true);
    });

    it('비율: 설치별 숫자가 비율보다 작으면 켬', () => {
        const c = { socketRenderPercent: 10 };
        expect(isSocketRenderEnabled(c, null, 0)).toBe(true);
        expect(isSocketRenderEnabled(c, null, 9)).toBe(true);
        expect(isSocketRenderEnabled(c, null, 10)).toBe(false);
        expect(isSocketRenderEnabled(c, null, 99)).toBe(false);
    });

    it('0%는 전원 끔, 100%(이상)는 전원 켬', () => {
        expect(isSocketRenderEnabled({ socketRenderPercent: 0 }, null, 0)).toBe(false);
        expect(isSocketRenderEnabled({ socketRenderPercent: 100 }, null, 99)).toBe(true);
        expect(isSocketRenderEnabled({ socketRenderPercent: 150 }, null, 99)).toBe(true);
    });

    it('비율을 올리면 이미 켜진 사용자는 계속 켜져 있다', () => {
        for (const p of [10, 50, 100]) expect(isSocketRenderEnabled({ socketRenderPercent: p }, null, 5)).toBe(true);
    });

    it('숫자를 모르면 비율 배포 중엔 끔, 100%면 켬', () => {
        expect(isSocketRenderEnabled({ socketRenderPercent: 50 }, null, undefined)).toBe(false);
        expect(isSocketRenderEnabled({ socketRenderPercent: 100 }, null, undefined)).toBe(true);
    });

    it('이상한 비율 값은 끔', () => {
        expect(isSocketRenderEnabled({ socketRenderPercent: 'abc' }, null, 0)).toBe(false);
    });

    it('localStorage가 OTA보다 우선', () => {
        expect(isSocketRenderEnabled({ socketRender: 0 }, '1', 0)).toBe(true);
        expect(isSocketRenderEnabled({ socketRenderPercent: 0 }, '1', 99)).toBe(true);
        expect(isSocketRenderEnabled({}, '0', 0)).toBe(false);
    });

    it('localStorage의 다른 값은 무시', () => {
        expect(isSocketRenderEnabled({ socketRender: 0 }, 'yes', 0)).toBe(false);
        expect(isSocketRenderEnabled({}, 'no', 0)).toBe(true);
    });
});

describe('ensureRolloutBucket', () => {
    beforeEach(() => {
        fakeBrowser.reset();
        __resetRolloutBucketForTest();
    });

    it('처음엔 0~99 숫자를 뽑아 저장한다', async () => {
        const b = await ensureRolloutBucket();
        expect(Number.isInteger(b) && b! >= 0 && b! < 100).toBe(true);
        expect((await fakeBrowser.storage.local.get(ROLLOUT_BUCKET_KEY))[ROLLOUT_BUCKET_KEY]).toBe(b);
    });

    it('저장된 숫자가 있으면 그대로 쓴다', async () => {
        await fakeBrowser.storage.local.set({ [ROLLOUT_BUCKET_KEY]: 42 });
        expect(await ensureRolloutBucket()).toBe(42);
    });

    it('저장된 값이 이상하면 새로 뽑는다', async () => {
        await fakeBrowser.storage.local.set({ [ROLLOUT_BUCKET_KEY]: 'x' });
        const b = await ensureRolloutBucket();
        expect(typeof b).toBe('number');
    });

    it('뽑은 숫자가 판정의 기본값이 된다', async () => {
        await fakeBrowser.storage.local.set({ [ROLLOUT_BUCKET_KEY]: 3 });
        await ensureRolloutBucket();
        expect(isSocketRenderEnabled({ socketRenderPercent: 5 }, null)).toBe(true);
        expect(isSocketRenderEnabled({ socketRenderPercent: 3 }, null)).toBe(false);
    });
});
