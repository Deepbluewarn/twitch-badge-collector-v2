/**
 * OTA fetch 주기 회귀 테스트.
 *
 * 예전엔 받은 시각을 새 rev가 적용될 때만 남겼다. rev는 selector를 고칠 때만 오르니
 * 평소엔 시각이 갱신되지 않아 fetchIfStale이 SW가 깰 때마다 jsDelivr를 불렀다
 * (2026-09 기준 하루 58만 건, 사용자당 하루 약 40번).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';
import bundled from './bundled-selectors.prod.json';

vi.stubGlobal('browser', fakeBrowser);
const { fetchIfStale } = await import('./ota-fetch');

const HOUR = 60 * 60 * 1000;
const fetchMock = vi.fn();

function respond(body: unknown, ok = true) {
    fetchMock.mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });
}

describe('fetchIfStale', () => {
    beforeEach(() => {
        fakeBrowser.reset();
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
        vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    it('rev가 그대로여도 1시간 안에는 다시 받지 않는다', async () => {
        respond(bundled);
        await fetchIfStale();
        await fetchIfStale();
        await fetchIfStale();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('1시간이 지나면 다시 받는다', async () => {
        respond(bundled);
        await fetchIfStale();
        vi.advanceTimersByTime(HOUR + 1);
        await fetchIfStale();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('검증에 실패한 응답도 받은 것으로 친다', async () => {
        respond({ schemaVersion: -1 });
        await fetchIfStale();
        await fetchIfStale();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('HTTP 오류면 다음 wake 때 다시 시도한다', async () => {
        respond(null, false);
        await fetchIfStale();
        await fetchIfStale();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('네트워크 오류면 다음 wake 때 다시 시도한다', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
        await fetchIfStale();
        await fetchIfStale();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
