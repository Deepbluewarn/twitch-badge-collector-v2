/**
 * 익명 사용 통계 (docs/adr/0001-anonymous-usage-stats.md). Chrome, Edge만. Firefox 빌드에선 부르는 쪽이 통째로 건너뛴다.
 *
 * 확장을 쓴 날마다 기록을 하나 만들고, 그날 한 일을 0/1로 표시한다. 날짜가 바뀐 뒤 처음 표시할 때나 브라우저를 켤 때
 * 지난 날들을 outbox로 옮겨 badgecollector.dev/api/ping으로 한 번에 보낸다. 보낸 건 지우고, 못 보낸 건 7일까지 다시 보낸다.
 * 설치 ID는 없다. 주간, 월간 사용자는 그 주, 그 달의 첫 기록에 붙는 firstWeek, firstMonth로 센다.
 *
 * 저장소에 쓰는 건 백그라운드 한 곳뿐이다(탭 여럿이 동시에 표시해도 엉키지 않게). 다른 곳은 markUsage로 메시지만 보낸다.
 */

export const ANONYMOUS_STATS_KEY = 'anonymousStats';
export const USAGE_MARK_MESSAGE = 'tbc-usage-mark';
export const PING_URL = 'https://badgecollector.dev/api/ping';

// 사이트 리포 functions/api/ping.ts와 같은 목록, 같은 순서. 뒤에만 덧붙인다.
export const USAGE_FLAGS = [
    'twitch',
    'chzzk',
    'collected',
    'filterEdit',
    'advancedFilter',
    'floating',
    'template',
    'archiveOpen',
    'capture',
    'settingOpen',
] as const;
export type UsageFlag = typeof USAGE_FLAGS[number];

export type UsageRecord = {
    date: string;
    v: string;
    b: 'chrome' | 'edge';
    firstWeek: 0 | 1;
    firstMonth: 0 | 1;
} & Record<UsageFlag, 0 | 1>;

const TODAY_KEY = 'usageStats:today';
const OUTBOX_KEY = 'usageStats:outbox';
const MARKS_KEY = 'usageStats:marks';
const RETRY_KEY = 'usageStats:retryAt';
const KEEP_DAYS = 7;
const DAY = 86_400_000;
// 못 보냈으면 이만큼 쉰다. 서비스 워커는 하루에도 수십 번 깨는데, 깰 때마다 다시 보내면 서버가 죽었을 때
// 사용자 수만큼 요청이 쏟아져 같은 계정의 사이트 API 한도(하루 10만)를 먹는다.
const RETRY_MS = 6 * 3_600_000;

interface Marks { week?: string; month?: string }

export const statsEnabled = (v: unknown) => v !== 'off';

/** 사용자 컴퓨터 기준 날짜 YYYY-MM-DD */
export function localDay(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** ISO 주 (월요일 시작) — 2026-W45 */
export function isoWeek(d: Date): string {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dow = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dow);
    const year = t.getUTCFullYear();
    const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
}

function browserName(): UsageRecord['b'] {
    return /\bEdg\//.test(navigator.userAgent) ? 'edge' : 'chrome';
}

function newRecord(now: Date, marks: Marks): { record: UsageRecord; marks: Marks } {
    const week = isoWeek(now);
    const month = localDay(now).slice(0, 7);
    const record = {
        date: localDay(now),
        v: browser.runtime.getManifest().version,
        b: browserName(),
        firstWeek: marks.week === week ? 0 : 1,
        firstMonth: marks.month === month ? 0 : 1,
        ...Object.fromEntries(USAGE_FLAGS.map(f => [f, 0])),
    } as UsageRecord;
    return { record, marks: { week, month } };
}

// 7일보다 오래된 기록은 버린다 — 늦게 들어와 이미 낸 통계를 바꾸지 않게. 서버도 8일까지만 받는다.
function fresh(outbox: UsageRecord[], now: Date): UsageRecord[] {
    const oldest = localDay(new Date(now.getTime() - KEEP_DAYS * DAY));
    return outbox.filter(r => r.date >= oldest);
}

async function load() {
    const res = await browser.storage.local.get([TODAY_KEY, OUTBOX_KEY, MARKS_KEY, RETRY_KEY, ANONYMOUS_STATS_KEY]);
    return {
        enabled: statsEnabled(res[ANONYMOUS_STATS_KEY]),
        retryAt: (res[RETRY_KEY] as number | undefined) ?? 0,
        today: (res[TODAY_KEY] as UsageRecord | undefined) ?? null,
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
    if (records.length === 0 || now.getTime() < retryAt) return;
    const batch = records.slice(0, KEEP_DAYS);
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
    const sent = new Set(batch.map(r => r.date));
    const { outbox: latest } = await load();
    await browser.storage.local.set({ [OUTBOX_KEY]: latest.filter(r => !sent.has(r.date)) });
}

/** 백그라운드 — 표시 메시지 처리 */
export function recordUsage(flags: UsageFlag[], fetchImpl: typeof fetch = fetch, now = new Date()): Promise<void> {
    return serial(async () => {
        const rolled = await rollOver(now);
        const { enabled, today, marks } = await load();
        if (!enabled) return;
        let record = today;
        if (!record) {
            const made = newRecord(now, marks);
            record = made.record;
            await browser.storage.local.set({ [MARKS_KEY]: made.marks });
        }
        for (const f of flags) record[f] = 1;
        // 설정으로 정해지는 것은 방송 화면을 띄운 날 그 설정이었는지로 본다
        if (flags.includes('twitch') || flags.includes('chzzk')) {
            const s = await browser.storage.local.get(['advancedFilter', 'displayMode', 'chzzkCustomTemplate']);
            if (s.advancedFilter === 'on') record.advancedFilter = 1;
            if (s.displayMode === 'floating') record.floating = 1;
            if (flags.includes('chzzk') && s.chzzkCustomTemplate === 'on') record.template = 1;
        }
        await browser.storage.local.set({ [TODAY_KEY]: record });
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

/** 설정 화면의 [보기] — 보낼 기록 그대로 (못 보낸 지난 날 + 오늘) */
export async function pendingUsage(): Promise<UsageRecord[]> {
    const { today, outbox } = await load();
    return today ? [...outbox, today] : outbox;
}

export function isUsageFlag(x: unknown): x is UsageFlag {
    return typeof x === 'string' && (USAGE_FLAGS as readonly string[]).includes(x);
}

const sentThisPage = new Set<string>();

/**
 * 콘텐츠 스크립트, 설정 페이지 — 그날 한 일을 백그라운드에 알린다. 같은 페이지에서 같은 날 같은 표시는 한 번만 보낸다.
 * 꺼져 있는지는 백그라운드가 본다. 채팅 처리 한가운데서도 불리므로 무슨 일이 있어도 던지지 않는다
 * (업데이트로 연결이 끊긴 옛 스크립트에선 sendMessage가 "Extension context invalidated"를 바로 던진다).
 */
export function markUsage(flag: UsageFlag): void {
    if (import.meta.env.BROWSER === 'firefox') return;
    try {
        const key = `${localDay(new Date())}:${flag}`;
        if (sentThisPage.has(key)) return;
        sentThisPage.add(key);
        if (!browser.runtime?.id) return;
        browser.runtime.sendMessage({ type: USAGE_MARK_MESSAGE, flags: [flag] }).catch(() => { /* 백그라운드 깨는 중 */ });
    } catch { /* 통계는 없어도 된다 */ }
}
