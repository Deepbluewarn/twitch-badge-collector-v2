import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';

vi.stubGlobal('browser', fakeBrowser);
const { recordUsage, flushUsage, clearUsage, pendingUsage, markUsage, isoWeek, localDay } = await import('./usage-stats');

const at = (s: string) => new Date(`${s}T12:00:00`);

function fakeFetch(status: number | 'offline' = 204) {
    const bodies: { records: Record<string, unknown>[] }[] = [];
    const fn = vi.fn(async (_url: string, init: RequestInit) => {
        if (status === 'offline') throw new TypeError('Failed to fetch');
        bodies.push(JSON.parse(init.body as string));
        return new Response(null, { status });
    });
    return { fn: fn as unknown as typeof fetch, bodies };
}

describe('usage-stats', () => {
    beforeEach(() => {
        fakeBrowser.reset();
        vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({ version: '2.27.0' } as never);
    });

    it('그날 한 일만 1로 적고 아직 보내지 않는다', async () => {
        const f = fakeFetch();
        await recordUsage(['chzzk'], f.fn, at('2026-11-05'));
        await recordUsage(['collected'], f.fn, at('2026-11-05'));
        const [r] = await pendingUsage();
        expect(r).toMatchObject({ date: '2026-11-05', v: '2.27.0', chzzk: 1, collected: 1, twitch: 0, capture: 0, firstWeek: 1, firstMonth: 1 });
        expect(f.fn).not.toHaveBeenCalled();
    });

    it('방송 화면을 띄운 날의 설정으로 고급 필터, 팝오버, 템플릿을 적는다', async () => {
        await fakeBrowser.storage.local.set({ advancedFilter: 'on', displayMode: 'floating', chzzkCustomTemplate: 'on' });
        await recordUsage(['twitch'], fakeFetch().fn, at('2026-11-05'));
        expect((await pendingUsage())[0]).toMatchObject({ advancedFilter: 1, floating: 1, template: 0 });
        await recordUsage(['chzzk'], fakeFetch().fn, at('2026-11-05'));
        expect((await pendingUsage())[0]).toMatchObject({ template: 1 });
    });

    it('필터 종류는 그 플랫폼에 직접 만든 조건이 있을 때만 1이고, 기본 필터는 세지 않는다', async () => {
        const { default: defaults } = await import('@/defaultFilters');
        const mine = (platform: string, category: string) => ({
            filterType: 'include', id: `g-${platform}-${category}`, filterNote: '', platform,
            filters: [{ category, id: `a-${platform}-${category}`, type: 'include', value: 'x' }],
        });
        await fakeBrowser.storage.local.set({ filter: [...defaults, mine('chzzk', 'keyword'), mine('twitch', 'name')] });
        await recordUsage(['chzzk'], fakeFetch().fn, at('2026-11-05'));
        expect((await pendingUsage())[0]).toMatchObject({ filterBadge: 0, filterName: 0, filterKeyword: 1 });
        await recordUsage(['twitch'], fakeFetch().fn, at('2026-11-05'));
        expect((await pendingUsage())[0]).toMatchObject({ filterBadge: 0, filterName: 1, filterKeyword: 1 });
    });

    it('날짜가 바뀐 뒤 처음 표시할 때 어제 기록을 보낸다', async () => {
        const f = fakeFetch();
        await recordUsage(['chzzk'], f.fn, at('2026-11-04'));
        await recordUsage(['twitch'], f.fn, at('2026-11-05'));
        expect(f.bodies).toHaveLength(1);
        expect(f.bodies[0].records.map(r => r.date)).toEqual(['2026-11-04']);
        expect((await pendingUsage()).map(r => r.date)).toEqual(['2026-11-05']);
    });

    it('못 보낸 날들은 쌓였다가 브라우저를 켤 때 한 번에 간다', async () => {
        const off = fakeFetch('offline');
        await recordUsage(['chzzk'], off.fn, at('2026-11-02'));
        await recordUsage(['chzzk'], off.fn, at('2026-11-03'));
        await recordUsage(['chzzk'], off.fn, at('2026-11-04'));
        expect((await pendingUsage()).map(r => r.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);

        const on = fakeFetch();
        await flushUsage(on.fn, at('2026-11-06'));
        expect(on.bodies[0].records.map(r => r.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
        expect(await pendingUsage()).toEqual([]);
    });

    it('5xx는 남겨 두고 4xx는 버린다', async () => {
        await recordUsage(['chzzk'], fakeFetch().fn, at('2026-11-04'));
        await flushUsage(fakeFetch(503).fn, at('2026-11-05'));
        expect(await pendingUsage()).toHaveLength(1);
        await flushUsage(fakeFetch(400).fn, new Date('2026-11-05T19:00:00'));
        expect(await pendingUsage()).toHaveLength(0);
    });

    it('못 보냈으면 6시간 동안 다시 보내지 않는다 (서비스 워커가 깰 때마다 보내지 않게)', async () => {
        await recordUsage(['chzzk'], fakeFetch().fn, at('2026-11-04'));
        await flushUsage(fakeFetch(503).fn, at('2026-11-05'));
        const soon = fakeFetch();
        await flushUsage(soon.fn, new Date('2026-11-05T17:00:00'));
        await recordUsage(['twitch'], soon.fn, new Date('2026-11-05T17:30:00'));
        expect(soon.fn).not.toHaveBeenCalled();
        const later = fakeFetch();
        await flushUsage(later.fn, new Date('2026-11-05T18:01:00'));
        expect(later.bodies[0].records.map(r => r.date)).toEqual(['2026-11-04']);
        // 다음 날 기록은 평소대로 간다
        await recordUsage(['chzzk'], later.fn, at('2026-11-06'));
        expect(later.bodies).toHaveLength(2);
    });

    it('markUsage는 확장 연결이 끊겨 sendMessage가 던져도 조용하다', () => {
        vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockImplementation(() => { throw new Error('Extension context invalidated.'); });
        expect(() => markUsage('capture')).not.toThrow();
    });

    it('7일 넘게 못 보낸 기록은 버린다', async () => {
        await recordUsage(['chzzk'], fakeFetch('offline').fn, at('2026-10-20'));
        const f = fakeFetch();
        await flushUsage(f.fn, at('2026-11-05'));
        expect(f.fn).not.toHaveBeenCalled();
        expect(await pendingUsage()).toEqual([]);
    });

    it('주, 달의 첫 기록에만 firstWeek, firstMonth를 붙인다', async () => {
        const f = fakeFetch();
        await recordUsage(['chzzk'], f.fn, at('2026-11-02')); // 월요일
        await recordUsage(['chzzk'], f.fn, at('2026-11-03'));
        await recordUsage(['chzzk'], f.fn, at('2026-11-09')); // 다음 주 월요일
        await flushUsage(f.fn, at('2026-11-10'));
        await recordUsage(['chzzk'], f.fn, at('2026-12-01'));
        await flushUsage(f.fn, at('2026-12-02'));
        const sent = f.bodies.flatMap(b => b.records).map(r => [r.date, r.firstWeek, r.firstMonth]);
        expect(sent).toEqual([
            ['2026-11-02', 1, 1],
            ['2026-11-03', 0, 0],
            ['2026-11-09', 1, 0],
            ['2026-12-01', 1, 1],
        ]);
    });

    it('꺼져 있으면 적지도 보내지도 않고, 끄면 모아 둔 것을 지운다', async () => {
        await recordUsage(['chzzk'], fakeFetch('offline').fn, at('2026-11-04'));
        await recordUsage(['chzzk'], fakeFetch('offline').fn, at('2026-11-05'));
        await fakeBrowser.storage.local.set({ anonymousStats: 'off' });
        await clearUsage();
        const f = fakeFetch();
        await recordUsage(['twitch'], f.fn, at('2026-11-06'));
        await flushUsage(f.fn, at('2026-11-07'));
        expect(await pendingUsage()).toEqual([]);
        expect(f.fn).not.toHaveBeenCalled();
    });

    it('날짜와 주는 사용자 컴퓨터 기준', () => {
        expect(localDay(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
        expect(isoWeek(new Date(2026, 10, 5))).toBe('2026-W45');
        expect(isoWeek(new Date(2027, 0, 1))).toBe('2026-W53');
    });
});
