import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';

vi.stubGlobal('browser', fakeBrowser);
const { recordUsage, flushUsage, clearUsage, pendingUsage, isoWeek } = await import('./usage-stats');
const { markUsage, localDay } = await import('./usage-mark');
const { settingFlags, langCode } = await import('./setting-snapshot');
const { default: defaultFilter } = await import('@/defaultFilters');

const at = (s: string) => new Date(`${s}T12:00:00`);
type Rec = Record<string, unknown>;
const days = (rs: Rec[]) => rs.filter(r => r.kind === 'day');
const weeks = (rs: Rec[]) => rs.filter(r => r.kind === 'week');

function fakeFetch(status: number | 'offline' = 204) {
    const bodies: { records: Rec[] }[] = [];
    const fn = vi.fn(async (_url: string, init: RequestInit) => {
        if (status === 'offline') throw new TypeError('Failed to fetch');
        bodies.push(JSON.parse(init.body as string));
        return new Response(null, { status });
    });
    return { fn: fn as unknown as typeof fetch, bodies, sent: () => bodies.flatMap(b => b.records) };
}

describe('usage-stats', () => {
    beforeEach(() => {
        fakeBrowser.reset();
        vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({ version: '2.27.0' } as never);
        vi.spyOn(fakeBrowser.i18n, 'getUILanguage').mockReturnValue('ko');
    });

    it('그날 한 일만 1로 적고 아직 보내지 않는다', async () => {
        const f = fakeFetch();
        await recordUsage(['chzzk'], f.fn, at('2026-11-05'));
        await recordUsage(['collected'], f.fn, at('2026-11-05'));
        const [r] = days(await pendingUsage());
        expect(r).toMatchObject({ date: '2026-11-05', v: '2.27.0', chzzk: 1, collected: 1, twitch: 0, capture: 0, firstWeek: 1, firstMonth: 1 });
        expect(f.fn).not.toHaveBeenCalled();
    });

    it('그 주에 처음 쓴 날 설정 기록을 하나 만들고, 그 주에는 다시 만들지 않는다', async () => {
        await fakeBrowser.storage.local.set({ advancedFilter: 'on', chatTime: 'on' });
        const f = fakeFetch();
        await recordUsage(['chzzk'], f.fn, at('2026-11-03'));
        await recordUsage(['chzzk'], f.fn, at('2026-11-04'));
        await recordUsage(['chzzk'], f.fn, at('2026-11-09')); // 다음 주
        await flushUsage(f.fn, at('2026-11-10'));
        const w = weeks(f.sent());
        expect(w.map(r => [r.week, r.date])).toEqual([['2026-W45', '2026-11-03'], ['2026-W46', '2026-11-09']]);
        expect(w[0]).toMatchObject({ lang: 'ko', v: '2.27.0', advancedFilter: 1, chatTime: 1, positionDown: 0 });
        expect(days(f.sent()).map(r => r.date)).toEqual(['2026-11-03', '2026-11-04', '2026-11-09']);
    });

    it('날짜가 바뀐 뒤 처음 표시할 때 어제 기록을 보낸다', async () => {
        const f = fakeFetch();
        await recordUsage(['chzzk'], f.fn, at('2026-11-04'));
        await recordUsage(['twitch'], f.fn, at('2026-11-05'));
        expect(f.bodies).toHaveLength(1);
        expect(days(f.bodies[0].records).map(r => r.date)).toEqual(['2026-11-04']);
        expect((await pendingUsage()).map(r => r.date)).toEqual(['2026-11-05']);
    });

    it('못 보낸 날들은 쌓였다가 브라우저를 켤 때 한 번에 간다', async () => {
        const off = fakeFetch('offline');
        await recordUsage(['chzzk'], off.fn, at('2026-11-02'));
        await recordUsage(['chzzk'], off.fn, at('2026-11-03'));
        await recordUsage(['chzzk'], off.fn, at('2026-11-04'));
        expect(days(await pendingUsage()).map(r => r.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);

        const on = fakeFetch();
        await flushUsage(on.fn, at('2026-11-06'));
        expect(days(on.bodies[0].records).map(r => r.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
        expect(weeks(on.bodies[0].records)).toHaveLength(1);
        expect(await pendingUsage()).toEqual([]);
    });

    it('5xx는 남겨 두고 4xx는 버린다', async () => {
        await recordUsage(['chzzk'], fakeFetch().fn, at('2026-11-04'));
        await flushUsage(fakeFetch(503).fn, at('2026-11-05'));
        expect(await pendingUsage()).toHaveLength(2);
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
        expect(later.sent().map(r => `${r.kind}:${r.date}`)).toEqual(['week:2026-11-04', 'day:2026-11-04']);
        // 다음 날 기록은 평소대로 간다
        await recordUsage(['chzzk'], later.fn, at('2026-11-06'));
        expect(later.bodies).toHaveLength(2);
    });

    it('같은 날짜의 하루 기록과 주간 기록을 따로 지운다', async () => {
        await recordUsage(['chzzk'], fakeFetch().fn, at('2026-11-04'));
        await flushUsage(fakeFetch().fn, at('2026-11-04')); // 주간 기록만 보낼 거리가 있다
        expect((await pendingUsage()).map(r => r.kind)).toEqual(['day']);
    });

    it('오늘보다 뒤 날짜와 겹친 기록은 보내기 전에 걸러진다', async () => {
        const day = (date: string) => ({ kind: 'day', date, v: '2.27.0', b: 'chrome', firstWeek: 0, firstMonth: 0 });
        await fakeBrowser.storage.local.set({ 'usageStats:outbox': [day('2026-11-04'), day('2026-11-04'), day('2026-11-20')] });
        const f = fakeFetch();
        await flushUsage(f.fn, at('2026-11-05'));
        expect(f.sent().map(r => r.date)).toEqual(['2026-11-04']);
    });

    it('시계가 미래로 틀렸을 때 잡힌 쉬는 시각은 무시한다', async () => {
        await recordUsage(['chzzk'], fakeFetch().fn, at('2026-11-04'));
        await fakeBrowser.storage.local.set({ 'usageStats:retryAt': at('2026-12-01').getTime() });
        const f = fakeFetch();
        await flushUsage(f.fn, at('2026-11-05'));
        expect(f.fn).toHaveBeenCalledTimes(1);
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
        expect(days(f.sent()).map(r => [r.date, r.firstWeek, r.firstMonth])).toEqual([
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

describe('setting-snapshot', () => {
    const group = (o: Rec, filters: Rec[] = []) => ({ filterType: 'include', id: `g${Math.random()}`, filterNote: '', platform: 'chzzk', filters, ...o });
    const atom = (category: string, o: Rec = {}) => ({ category, id: `a${Math.random()}`, type: 'include', value: 'x', ...o });

    it('설치 직후 기본값이면 전부 0', () => {
        const s = {
            advancedFilter: 'off', displayMode: 'inline', chzzkCustomTemplate: 'off', filter: defaultFilter,
            position: 'up', chatTime: 'off', maximumNumberChats: undefined, darkTheme: 'system', collectedChatMarker: 'on',
            jumpToBottomButton: 'on', chatPersistence: 'on', floatingBgColor: '', chzzkChatSide: 'right', pointBoxAuto: 'on',
            chzzkProfileCopyId: 'on',
        };
        expect(Object.values(settingFlags(s)).every(v => v === 0)).toBe(true);
    });

    it('직접 만든 필터만 종류, 동작, 채널, 사람 지정을 센다', () => {
        const f = settingFlags({
            filter: [
                ...defaultFilter,
                group({ filterType: 'exclude' }, [atom('keyword')]),
                group({ filterType: 'sleep', filterChannelId: 'c1', markerColor: '#f00', filterNote: '메모' }, [atom('name', { userId: 'u1' })]),
            ],
        });
        expect(f).toMatchObject({
            filterBadge: 0, filterName: 1, filterKeyword: 1, filterExclude: 1, filterSleep: 1,
            filterChannel: 1, filterPerson: 1, filterMarker: 1, filterNote: 1,
        });
    });

    it('기본값에서 바꾼 설정만 1', () => {
        const f = settingFlags({
            displayMode: 'floating', position: 'down', maximumNumberChats: 500, darkTheme: 'dark', collectedChatMarker: 'off',
            chatArchive: { enabled: true, days: 90 }, disabledChannels: { 'chzzk:abc': { at: 1 } }, chzzkChatSide: 'left',
            chzzkProfileCopyId: 'off',
        });
        expect(f).toMatchObject({
            floating: 1, positionDown: 1, maxChats: 1, theme: 1, markerOff: 1, archiveOn: 1, archiveDays: 1,
            channelOff: 1, chatSideLeft: 1, copyIdOff: 1, chatTime: 0, persistOff: 0,
        });
    });

    it('업데이트 때 채워 넣은 옛 값은 바꾼 것으로 보지 않는다', () => {
        expect(settingFlags({ maximumNumberChats: 1000, darkTheme: 'off' })).toMatchObject({ maxChats: 0, theme: 0 });
        expect(settingFlags({ maximumNumberChats: 300, darkTheme: 'on' })).toMatchObject({ maxChats: 1, theme: 1 });
    });

    it('언어는 번역이 있거나 큰 언어만, 나머지는 other', () => {
        expect(langCode('ko')).toBe('ko');
        expect(langCode('en-US')).toBe('en');
        expect(langCode('zh-TW')).toBe('zh_TW');
        expect(langCode('pt-PT')).toBe('pt');
        expect(langCode('fi')).toBe('other');
    });
});
