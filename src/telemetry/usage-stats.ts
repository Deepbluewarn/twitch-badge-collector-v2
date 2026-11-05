/**
 * 익명 사용 통계 (docs/adr/0001-anonymous-usage-stats.md). Chrome, Edge만. Firefox 빌드에선 부르는 쪽이 통째로 건너뛴다.
 *
 * 기록은 두 가지다.
 * - 하루 기록(day): 확장을 쓴 날마다 하나. 그날 한 일(usage-mark.ts)을 0/1로 적는다.
 * - 주간 기록(week): 그 주에 처음 쓴 날 하나. 그때 설정을 기본값에서 바꿨는지(setting-snapshot.ts)를 0/1로 적는다.
 *   설정은 날마다 거의 같아서 매일 보내면 그 묶음이 사람을 잇는 단서가 된다. 그래서 주에 한 번만, 하루 기록과 따로 보낸다.
 *
 * 날짜가 바뀐 뒤 처음 표시할 때나 브라우저를 켤 때 지난 기록을 badgecollector.dev/api/ping으로 한 번에 보낸다.
 * 보낸 건 지우고, 못 보낸 건 7일까지 다시 보낸다. 설치 ID는 없다. 주간, 월간 사용자는 firstWeek, firstMonth로 센다.
 *
 * 저장소에 쓰는 건 백그라운드 한 곳뿐이다(탭 여럿이 동시에 표시해도 엉키지 않게). 다른 곳은 markUsage로 메시지만 보낸다.
 */
import { USAGE_FLAGS, localDay, type UsageFlag } from './usage-mark';
import { SETTING_SOURCE_KEYS, langCode, settingFlags, type SettingFlag } from './setting-snapshot';

export const ANONYMOUS_STATS_KEY = 'anonymousStats';
export const PING_URL = 'https://badgecollector.dev/api/ping';

type Browser = 'chrome' | 'edge';
export type DayRecord = {
    kind: 'day';
    date: string;
    v: string;
    b: Browser;
    firstWeek: 0 | 1;
    firstMonth: 0 | 1;
} & Record<UsageFlag, 0 | 1>;
export type WeekRecord = {
    kind: 'week';
    date: string;
    week: string;
    v: string;
    b: Browser;
    lang: string;
} & Record<SettingFlag, 0 | 1>;
export type UsageRecord = DayRecord | WeekRecord;

const TODAY_KEY = 'usageStats:today';
const OUTBOX_KEY = 'usageStats:outbox';
const MARKS_KEY = 'usageStats:marks';
const RETRY_KEY = 'usageStats:retryAt';
const KEEP_DAYS = 7;
// 하루 기록 8일치(오늘 빼고 7일 전까지) + 주간 기록 2개
const MAX_BATCH = 10;
const DAY = 86_400_000;
// 못 보냈으면 이만큼 쉰다. 서비스 워커는 하루에도 수십 번 깨는데, 깰 때마다 다시 보내면 서버가 죽었을 때
// 사용자 수만큼 요청이 쏟아져 같은 계정의 사이트 API 한도(하루 10만)를 먹는다.
const RETRY_MS = 6 * 3_600_000;

interface Marks { week?: string; month?: string }

export const statsEnabled = (v: unknown) => v !== 'off';

/** ISO 주 (월요일 시작) — 2026-W45 */
export function isoWeek(d: Date): string {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dow = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dow);
    const year = t.getUTCFullYear();
    const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
}

function browserName(): Browser {
    return /\bEdg\//.test(globalThis.navigator?.userAgent ?? '') ? 'edge' : 'chrome';
}

function newDay(now: Date, marks: Marks): DayRecord {
    return {
        kind: 'day',
        date: localDay(now),
        v: browser.runtime.getManifest().version,
        b: browserName(),
        firstWeek: marks.week === isoWeek(now) ? 0 : 1,
        firstMonth: marks.month === localDay(now).slice(0, 7) ? 0 : 1,
        ...Object.fromEntries(USAGE_FLAGS.map(f => [f, 0])),
    } as DayRecord;
}

async function newWeek(now: Date): Promise<WeekRecord> {
    const s = await browser.storage.local.get(SETTING_SOURCE_KEYS);
    return {
        kind: 'week',
        date: localDay(now),
        week: isoWeek(now),
        v: browser.runtime.getManifest().version,
        b: browserName(),
        lang: langCode(browser.i18n.getUILanguage()),
        ...settingFlags(s),
    };
}

const keyOf = (r: UsageRecord) => `${r.kind ?? 'day'}:${r.date}`;

// 7일보다 오래된 기록은 버린다 — 늦게 들어와 이미 낸 통계를 바꾸지 않게. 서버는 시간대 차이까지 9일을 받는다.
// 오늘보다 뒤 날짜(시계를 앞당겼다 되돌린 경우)도 버린다. 같은 기록이 두 번 들어 있으면(롤오버 중 서비스 워커가 죽음) 하나만 둔다.
function fresh(outbox: UsageRecord[], now: Date): UsageRecord[] {
    const oldest = localDay(new Date(now.getTime() - KEEP_DAYS * DAY));
    const today = localDay(now);
    const byKey = new Map<string, UsageRecord>();
    for (const r of outbox) if (r && r.date >= oldest && r.date <= today) byKey.set(keyOf(r), r);
    return [...byKey.values()];
}

async function load() {
    const res = await browser.storage.local.get([TODAY_KEY, OUTBOX_KEY, MARKS_KEY, RETRY_KEY, ANONYMOUS_STATS_KEY]);
    return {
        enabled: statsEnabled(res[ANONYMOUS_STATS_KEY]),
        retryAt: (res[RETRY_KEY] as number | undefined) ?? 0,
        today: (res[TODAY_KEY] as DayRecord | undefined) ?? null,
        outbox: (res[OUTBOX_KEY] as UsageRecord[] | undefined) ?? [],
        marks: (res[MARKS_KEY] as Marks | undefined) ?? {},
    };
}

// 표시와 전송을 한 줄로 세운다. 전송 중에 들어온 표시가 outbox를 덮어쓰지 않게.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
}

/** 지난 날의 기록을 outbox로 옮긴다. 옮긴 게 있으면 true */
async function rollOver(now: Date): Promise<boolean> {
    const { today, outbox } = await load();
    if (!today || today.date === localDay(now)) return false;
    await browser.storage.local.set({ [OUTBOX_KEY]: fresh([...outbox, today], now) });
    await browser.storage.local.remove(TODAY_KEY);
    return true;
}

async function send(fetchImpl: typeof fetch, now: Date): Promise<void> {
    const { enabled, outbox, retryAt } = await load();
    if (!enabled) return;
    const records = fresh(outbox, now);
    if (records.length !== outbox.length) await browser.storage.local.set({ [OUTBOX_KEY]: records });
    // 시계가 미래로 틀렸을 때 잡힌 쉬는 시각은 무시한다 (시계를 고친 뒤 며칠씩 안 보내지 않게)
    if (records.length === 0 || (now.getTime() < retryAt && retryAt - now.getTime() <= RETRY_MS)) return;
    const batch = records.slice(0, MAX_BATCH);
    let status: number;
    try {
        // text/plain이라 preflight 없이 간다
        const res = await fetchImpl(PING_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ records: batch }),
            signal: AbortSignal.timeout(10_000),
        });
        status = res.status;
    } catch {
        status = 0; // 오프라인 등
    }
    // 4xx는 다시 보내도 같은 답이라 버린다. 5xx와 네트워크 오류만 남겨 두고 쉬었다가 다시 보낸다.
    if (status === 0 || status >= 500) {
        await browser.storage.local.set({ [RETRY_KEY]: now.getTime() + RETRY_MS });
        return;
    }
    if (retryAt) await browser.storage.local.remove(RETRY_KEY);
    const sent = new Set(batch.map(keyOf));
    const { outbox: latest } = await load();
    await browser.storage.local.set({ [OUTBOX_KEY]: latest.filter(r => !sent.has(keyOf(r))) });
}

/** 백그라운드 — 표시 메시지 처리 */
export function recordUsage(flags: UsageFlag[], fetchImpl: typeof fetch = fetch, now = new Date()): Promise<void> {
    return serial(async () => {
        const rolled = await rollOver(now);
        const { enabled, today, outbox, marks } = await load();
        if (!enabled) return;
        if (today) {
            // 이미 1인 표시만 왔으면 쓰지 않는다 (열린 탭마다 storage.onChanged가 퍼지지 않게)
            if (flags.some(f => today[f] !== 1)) {
                for (const f of flags) today[f] = 1;
                await browser.storage.local.set({ [TODAY_KEY]: today });
            }
        } else {
            const record = newDay(now, marks);
            for (const f of flags) record[f] = 1;
            // 그 주에 처음 쓴 날 — 설정 기록은 이때 한 번 만들어 바로 보낼 목록에 넣는다.
            // 기록을 먼저 쓰고 주, 달 표시는 맨 뒤에 — 중간에 실패해도 그 주의 첫 기록이 빠지지 않게
            const week = record.firstWeek ? await newWeek(now) : null;
            await browser.storage.local.set({ [TODAY_KEY]: record, ...(week ? { [OUTBOX_KEY]: [...outbox, week] } : {}) });
            await browser.storage.local.set({ [MARKS_KEY]: { week: isoWeek(now), month: localDay(now).slice(0, 7) } });
        }
        if (rolled) await send(fetchImpl, now);
    });
}

/** 백그라운드 — 브라우저 시작, 서비스 워커 시작 때. 지난 날 기록을 보낸다 */
export function flushUsage(fetchImpl: typeof fetch = fetch, now = new Date()): Promise<void> {
    return serial(async () => {
        await rollOver(now);
        await send(fetchImpl, now);
    });
}

/** 끄면 모아 둔 것을 다 지운다. 주, 달 표시도 지워서 다시 켜면 그 주의 첫 기록부터 다시 센다 */
export function clearUsage(): Promise<void> {
    return serial(() => browser.storage.local.remove([TODAY_KEY, OUTBOX_KEY, MARKS_KEY, RETRY_KEY]));
}

/** 설정 화면의 [보기] — 보낼 기록 그대로 (못 보낸 기록 + 오늘) */
export async function pendingUsage(): Promise<UsageRecord[]> {
    const { today, outbox } = await load();
    return today ? [...outbox, today] : outbox;
}
