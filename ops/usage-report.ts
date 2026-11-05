/**
 * 확장 익명 사용 통계 (docs/adr/0001-anonymous-usage-stats.md).
 * - fetchUsage: 현황판(ops/watch/usage.ts → render.ts)이 그릴 숫자를 모은다
 * - usageLine: 하루 리포트(stats-report.ts)의 사용자 수 한 줄
 *
 * badgecollector.dev/api/ping이 Cloudflare Analytics Engine(tbc_usage)에 쓴 것을 SQL API로 읽는다.
 * 열 배치는 사이트 리포 functions/api/ping.ts 머리 주석. 개수는 SUM(_sample_interval)로 센다.
 * 실제 릴리스된 버전(GitHub 릴리스)의 기록만 센다. 개발 빌드, 시험 기록(0.0.0), 가짜 핑을 거른다.
 *
 * env: ~/.config/badge-collector/cloudflare.env  CF_ACCOUNT_ID, CF_ANALYTICS_TOKEN (Account Analytics 읽기)
 */
import { SETTING_FLAGS, USAGE_FLAGS, type SettingFlag, type UsageFlag } from '../src/telemetry/flags.ts';

const DAY = 86_400_000;
const WINDOW_DAYS = 28;
// 이보다 적게 모였으면 5% 미만 목록을 내지 않는다 (처음 며칠은 거의 전부 걸린다)
const MIN_DAYS = 14;
const MIN_WEEKS = 2;
const REVIEW = 0.05; // 이 아래면 접을지 검토할 목록 (ADR)
// 기록은 7일까지 늦게 온다. 쓰인 시각으로 거르므로 4주 + 늦게 온 것까지
const QUERY_DAYS = WINDOW_DAYS + 12;
const ROW_DOUBLES = 20;

const USAGE_LABEL: Record<UsageFlag, string> = {
    twitch: '트위치', chzzk: '치지직', collected: '수집', vod: '다시보기', filterEdit: '필터 수정', templateEdit: '템플릿 수정',
    archiveOpen: '보관함', archiveSearch: '보관함 검색', archiveExport: '보관함 내보내기', capture: '캡처', settingOpen: '설정 열기',
    popupOpen: '팝업 열기', clearChats: '채팅 비우기', ratioReset: '비율 초기화', resize: '경계 끌기', jumpBottom: '맨 아래로',
    copyId: 'ID 복사', channelToggle: '채널 끄기',
};
const SETTING_LABEL: Record<SettingFlag, string> = {
    advancedFilter: '고급 필터', floating: '팝오버', template: '템플릿', filterBadge: '배지 필터', filterName: '닉네임 필터',
    filterKeyword: '키워드 필터', filterExclude: '제외 필터', filterSleep: '꺼둔 필터', filterChannel: '채널 지정 필터',
    filterPerson: '사람 지정 필터', filterMarker: '필터 표시 색', filterNote: '필터 메모', archiveOn: '보관함 켬',
    archiveDays: '보관 기간 변경', channelOff: '꺼둔 채널', positionDown: '아래 배치', chatTime: '시간 표시',
    maxChats: '최대 개수 변경', theme: '테마 변경', markerOff: '수집 표시 끔', jumpBottomOff: '맨 아래 버튼 끔',
    persistOff: '채팅 유지 끔', floatingBg: '팝오버 배경색', chatSideLeft: '채팅 왼쪽', pointBoxOff: '포인트 자동 끔',
};

type SqlRow = Record<string, string | number>;

async function sql(query: string): Promise<SqlRow[]> {
    const { CF_ACCOUNT_ID: account, CF_ANALYTICS_TOKEN: token } = process.env;
    if (!account || !token) throw new Error('cloudflare.env 없음');
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: `${query} FORMAT JSON`,
    });
    if (!res.ok) throw new Error(`analytics engine: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return ((await res.json()) as { data: SqlRow[] }).data;
}

async function releasedVersions(): Promise<Set<string>> {
    const res = await fetch('https://api.github.com/repos/Deepbluewarn/twitch-badge-collector-v2/releases?per_page=100', {
        headers: { 'User-Agent': 'badge-collector-ops', Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`github releases: ${res.status}`);
    const list = (await res.json()) as { tag_name: string; draft: boolean }[];
    return new Set(list.filter((r) => !r.draft).map((r) => r.tag_name.replace(/^v/, '')));
}

const sums = (n: number) => Array.from({ length: n }, (_, i) => `SUM(_sample_interval * double${i + 1}) AS d${i + 1}`).join(', ');
const num = (x: string | number | undefined) => Number(x ?? 0);
const doubles = (r: SqlRow) => Array.from({ length: ROW_DOUBLES }, (_, i) => num(r[`d${i + 1}`]));

function shiftDay(date: string, n: number): string {
    return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/** ISO 주 — 확장 usage-stats.ts isoWeek와 같은 계산 */
function isoWeek(date: string): string {
    const t = new Date(`${date}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    const year = t.getUTCFullYear();
    return `${year}-W${String(Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7)).padStart(2, '0')}`;
}

export interface Ratio { key: string; label: string; now: number; avg: number }
export interface UsageSummary {
    at: number;
    /** 기준일(어제, 한국 날짜) */
    yesterday: string;
    /** 최근 28일, 오래된 날부터. 기록이 없는 날은 0 */
    daily: { date: string; users: number; chrome: number; edge: number }[];
    week: number;
    month: number;
    /** 4주 창에 기록이 있는 날 수. MIN_DAYS보다 적으면 5% 미만 판정을 하지 않는다 */
    days: number;
    /** now = 어제 비율, avg = 4주 평균 비율 */
    features: Ratio[];
    /** 지난 완결된 주의 설정 기록. now = 그 주 비율, avg = 최근 4주 평균 */
    settings: null | { week: string; users: number; weeks: number; items: Ratio[]; langs: { lang: string; ratio: number }[] };
    review: number;
    minDays: number;
    minWeeks: number;
}

export async function fetchUsage(yesterday: string): Promise<UsageSummary> {
    const released = await releasedVersions();
    const [dayRows, weekRows] = await Promise.all([
        sql(`SELECT blob2 AS date, blob3 AS v, blob4 AS b, SUM(_sample_interval) AS n, ${sums(ROW_DOUBLES)} FROM tbc_usage
             WHERE blob1 = 'day' AND timestamp > NOW() - INTERVAL '${QUERY_DAYS}' DAY GROUP BY date, v, b`),
        sql(`SELECT blob1 AS row, blob5 AS week, blob3 AS v, blob6 AS lang, SUM(_sample_interval) AS n, ${sums(ROW_DOUBLES)} FROM tbc_usage
             WHERE (blob1 = 'week' OR blob1 = 'week2') AND timestamp > NOW() - INTERVAL '${QUERY_DAYS}' DAY GROUP BY row, week, v, lang`),
    ]);

    // ── 하루 기록 ── double1 firstWeek, double2 firstMonth, double3.. USAGE_FLAGS
    const dow = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekStart = shiftDay(yesterday, 1 - (dow(yesterday) || 7));
    const windowStart = shiftDay(yesterday, 1 - WINDOW_DAYS);
    const daily = Array.from({ length: WINDOW_DAYS }, (_, i) => ({ date: shiftDay(windowStart, i), users: 0, chrome: 0, edge: 0 }));
    const byDate = new Map(daily.map((d) => [d.date, d]));
    let week = 0, month = 0, n28 = 0;
    const flagsY = USAGE_FLAGS.map(() => 0);
    const flags28 = USAGE_FLAGS.map(() => 0);
    for (const r of dayRows) {
        if (!released.has(String(r.v))) continue;
        const date = String(r.date), n = num(r.n), d = doubles(r);
        if (date > yesterday) continue;
        if (date >= weekStart) week += d[0];
        if (date.slice(0, 7) === yesterday.slice(0, 7)) month += d[1];
        const slot = byDate.get(date);
        if (!slot) continue;
        slot.users += n;
        if (r.b === 'edge') slot.edge += n; else slot.chrome += n;
        n28 += n;
        USAGE_FLAGS.forEach((_, i) => { flags28[i] += d[i + 2]; if (date === yesterday) flagsY[i] += d[i + 2]; });
    }
    const dau = byDate.get(yesterday)?.users ?? 0;
    const features = USAGE_FLAGS.map((key, i) => ({
        key, label: USAGE_LABEL[key], now: dau ? flagsY[i] / dau : 0, avg: n28 ? flags28[i] / n28 : 0,
    }));

    // ── 주간 설정 기록 ── 지난 완결된 주(오늘이 속한 주의 바로 앞 주). week 행에 앞 20개, week2 행에 나머지
    const today = shiftDay(yesterday, 1);
    const lastSunday = shiftDay(today, -(dow(today) || 7));
    const lastWeek = isoWeek(lastSunday);
    const recentWeeks = new Set([0, 7, 14, 21].map((back) => isoWeek(shiftDay(lastSunday, -back))));
    const weeks = weekRows.filter((r) => released.has(String(r.v)));
    const tally = (pick: (week: string) => boolean) => {
        const counts = SETTING_FLAGS.map(() => 0);
        const base = { week: 0, week2: 0 };
        const langs = new Map<string, number>();
        const seen = new Set<string>();
        for (const r of weeks) {
            if (!pick(String(r.week))) continue;
            seen.add(String(r.week));
            const row = String(r.row) as 'week' | 'week2', n = num(r.n), d = doubles(r);
            base[row] += n;
            const offset = row === 'week' ? 0 : ROW_DOUBLES;
            d.forEach((x, i) => { if (offset + i < counts.length) counts[offset + i] += x; });
            if (row === 'week') langs.set(String(r.lang), (langs.get(String(r.lang)) ?? 0) + n);
        }
        // 표본 추출 전엔 week와 week2 행 수가 같다. 그래도 칸마다 자기 행 수로 나눈다
        const ratio = counts.map((c, i) => c / ((i < ROW_DOUBLES ? base.week : base.week2) || 1));
        return { users: base.week, ratio, langs, weeks: seen.size };
    };
    const last = tally((w) => w === lastWeek);
    const recent = tally((w) => recentWeeks.has(w));
    const settings = last.users === 0 ? null : {
        week: lastWeek,
        users: last.users,
        weeks: recent.weeks,
        items: SETTING_FLAGS.map((key, i) => ({ key, label: SETTING_LABEL[key], now: last.ratio[i], avg: recent.ratio[i] })),
        langs: [...last.langs].sort((a, b) => b[1] - a[1]).map(([lang, n]) => ({ lang, ratio: n / last.users })),
    };

    const days = daily.filter((d) => d.users > 0).length;
    return { at: Date.now(), yesterday, daily, week, month, days, features, settings, review: REVIEW, minDays: MIN_DAYS, minWeeks: MIN_WEEKS };
}

/** 하루 리포트에 붙는 한 줄. 자세한 건 현황판 */
export function usageLine(u: UsageSummary): string {
    const y = u.daily.at(-1);
    if (!u.daily.some((d) => d.users > 0)) return '확장 사용자: 아직 기록 없음';
    return `확장 사용자 어제 ${y?.users ?? 0} (Chrome ${y?.chrome ?? 0}, Edge ${y?.edge ?? 0}), 이번 주 ${u.week}, 이번 달 ${u.month}`;
}
