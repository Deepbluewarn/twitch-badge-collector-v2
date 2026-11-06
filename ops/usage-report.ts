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

// 현황판에 보이는 이름과 한 줄 설명. 표시 위치는 확장 리포 docs/releases/v2.27.0.md "표시 위치"
const USAGE_TEXT: Record<UsageFlag, [string, string]> = {
    twitch: ['트위치', '트위치 방송이나 다시보기에서 모아보기 창이 떴다'],
    chzzk: ['치지직', '치지직 방송이나 다시보기에서 모아보기 창이 떴다'],
    collected: ['채팅 수집', '필터에 맞는 채팅이 모아보기에 한 번 이상 모였다'],
    vod: ['다시보기', '다시보기 화면에서 모아보기 창이 떴다'],
    filterEdit: ['필터 수정', '설정에서 필터를 추가, 수정, 삭제했다'],
    templateEdit: ['템플릿 수정', '치지직 채팅 모양(템플릿, 스타일)을 저장했다'],
    archiveOpen: ['보관함 열기', '설정의 채팅 보관함 화면을 열었다'],
    archiveSearch: ['보관함 검색', '보관함에서 채팅을 검색했다'],
    archiveExport: ['보관함 내보내기', '보관함 채팅을 TXT나 CSV로 내려받았다'],
    capture: ['캡처', '채팅을 이미지로 캡처했다'],
    settingOpen: ['설정 열기', '설정 페이지를 열었다'],
    popupOpen: ['팝업 열기', '툴바 아이콘을 눌러 팝업을 열었다'],
    clearChats: ['채팅 비우기', '팝업에서 모아보기 채팅을 비웠다'],
    ratioReset: ['비율 초기화', '팝업에서 원래 채팅과 모아보기의 비율을 처음으로 되돌렸다'],
    resize: ['경계 끌기', '원래 채팅과 모아보기 사이 경계를 끌어 크기를 바꿨다'],
    jumpBottom: ['맨 아래로', '모아보기의 맨 아래로 버튼을 눌렀다'],
    copyId: ['ID 복사', '치지직 프로필 창의 ID 복사를 눌렀다'],
    channelToggle: ['채널 끄기', '팝업이나 설정에서 채널별 사용을 끄거나 켰다'],
};
const SETTING_TEXT: Record<SettingFlag, [string, string]> = {
    advancedFilter: ['고급 필터', '고급 필터 모드를 켜 두었다'],
    floating: ['팝오버', '모아보기를 채팅창 안이 아니라 떠 있는 창으로 본다'],
    template: ['치지직 템플릿', '치지직 채팅 모양 템플릿을 켜 두었다'],
    filterBadge: ['배지 필터', '직접 만든 배지 조건이 있다 (설치 때 들어가는 기본 필터는 빼고 셈)'],
    filterName: ['닉네임 필터', '직접 만든 닉네임 조건이 있다 (기본 필터 제외)'],
    filterKeyword: ['키워드 필터', '직접 만든 키워드 조건이 있다'],
    filterExclude: ['제외 필터', '"제외" 동작의 필터를 직접 만들었다'],
    filterSleep: ['꺼 둔 필터', '만들어 두고 꺼 둔 필터가 있다'],
    filterChannel: ['채널 지정 필터', '특정 채널에서만 쓰는 필터가 있다'],
    filterPerson: ['사람 지정 필터', '닉네임 대신 사람(ID)으로 고른 필터가 있다'],
    filterMarker: ['필터 표시 색', '필터에 표시 색을 정해 두었다'],
    filterNote: ['필터 메모', '필터에 메모를 달아 두었다'],
    archiveOn: ['보관함 켬', '채팅 보관함을 켜 두었다 (기본 꺼짐)'],
    archiveDays: ['보관 기간 변경', '보관 기간이 기본 30일이 아니다'],
    channelOff: ['꺼 둔 채널', '확장을 꺼 둔 채널이 하나 이상 있다'],
    positionDown: ['아래 배치', '모아보기를 원래 채팅 아래에 둔다 (기본 위)'],
    chatTime: ['시간 표시', '모아보기 채팅에 시각을 표시한다'],
    maxChats: ['최대 개수 변경', '최대 개수가 100(기본)이나 1000(옛 사용자 자동값)이 아니다. 예전 스토어 빌드에서 칸이 비어 있어 직접 넣은 값이 많다'],
    theme: ['테마 변경', '시스템 설정을 따르지 않고 밝게나 어둡게를 골랐다'],
    markerOff: ['수집 표시 끔', '원래 채팅에 수집 표시를 하지 않는다'],
    jumpBottomOff: ['맨 아래 버튼 끔', '모아보기의 맨 아래로 버튼을 껐다'],
    persistOff: ['채팅 유지 끔', '새로고침 후 모아보기 채팅을 남기지 않는다'],
    floatingBg: ['팝오버 배경색', '팝오버 창의 배경색을 정해 두었다'],
    chatSideLeft: ['채팅 왼쪽', '치지직 채팅창을 왼쪽에 둔다'],
    pointBoxOff: ['포인트 자동 끔', '치지직 채널 포인트 자동 받기를 껐다'],
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

/** now, avg는 비율. nowN, avgN은 추정 인원(표본 배율 반영). 기능의 avgN은 하루 평균, 설정의 avgN은 주 평균 */
export interface Ratio { key: string; label: string; desc: string; now: number; avg: number; nowN: number; avgN: number }
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
    /** partial = 지난주 기록이 없어 진행 중인 이번 주를 보여 준다 (배포 첫 주) */
    /** users = 그 주 주간 기록 수(= 그 주에 쓴 사람), chrome = 그중 Chrome. 스토어 사용자와 견줄 때 쓴다 */
    settings: null | { week: string; range: string; partial: boolean; users: number; chrome: number; weeks: number; items: Ratio[]; langs: { lang: string; ratio: number }[] };
    review: number;
    minDays: number;
    minWeeks: number;
}

export async function fetchUsage(yesterday: string): Promise<UsageSummary> {
    const released = await releasedVersions();
    const [dayRows, weekRows] = await Promise.all([
        sql(`SELECT blob2 AS date, blob3 AS v, blob4 AS b, SUM(_sample_interval) AS n, ${sums(ROW_DOUBLES)} FROM tbc_usage
             WHERE blob1 = 'day' AND timestamp > NOW() - INTERVAL '${QUERY_DAYS}' DAY GROUP BY date, v, b`),
        sql(`SELECT blob1 AS row, blob5 AS week, blob2 AS date, blob3 AS v, blob4 AS b, blob6 AS lang, SUM(_sample_interval) AS n, ${sums(ROW_DOUBLES)} FROM tbc_usage
             WHERE (blob1 = 'week' OR blob1 = 'week2') AND timestamp > NOW() - INTERVAL '${QUERY_DAYS}' DAY GROUP BY row, week, date, v, b, lang`),
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
    const dataDays = daily.filter((d) => d.users > 0).length || 1;
    const features = USAGE_FLAGS.map((key, i) => ({
        key, label: USAGE_TEXT[key][0], desc: USAGE_TEXT[key][1], now: dau ? flagsY[i] / dau : 0, avg: n28 ? flags28[i] / n28 : 0,
        nowN: Math.round(flagsY[i]), avgN: Math.round(flags28[i] / dataDays),
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
        let chrome = 0;
        const langs = new Map<string, number>();
        const seen = new Set<string>();
        for (const r of weeks) {
            if (!pick(String(r.week))) continue;
            seen.add(String(r.week));
            const row = String(r.row) as 'week' | 'week2', n = num(r.n), d = doubles(r);
            base[row] += n;
            if (row === 'week' && r.b !== 'edge') chrome += n;
            const offset = row === 'week' ? 0 : ROW_DOUBLES;
            d.forEach((x, i) => { if (offset + i < counts.length) counts[offset + i] += x; });
            if (row === 'week') langs.set(String(r.lang), (langs.get(String(r.lang)) ?? 0) + n);
        }
        // 표본 추출 전엔 week와 week2 행 수가 같다. 그래도 칸마다 자기 행 수로 나눈다
        const ratio = counts.map((c, i) => c / ((i < ROW_DOUBLES ? base.week : base.week2) || 1));
        return { users: base.week, chrome, ratio, counts, langs, weeks: seen.size };
    };
    // 지난주 기록이 없으면(배포 첫 주) 진행 중인 이번 주를 보여 준다
    const thisWeek = isoWeek(today);
    const partial = tally((w) => w === lastWeek).users === 0;
    const shownWeek = partial ? thisWeek : lastWeek;
    const last = tally((w) => w === shownWeek);
    const recent = tally((w) => recentWeeks.has(w) || (partial && w === thisWeek));
    const settings = last.users === 0 ? null : {
        week: shownWeek,
        // 사람이 읽는 날짜 범위 (월요일 ~ 일요일)
        range: (() => { const sun = partial ? shiftDay(today, 7 - (dow(today) || 7)) : lastSunday; return `${shiftDay(sun, -6).slice(5)} ~ ${sun.slice(5)}`; })(),
        partial,
        users: last.users,
        chrome: last.chrome,
        weeks: recent.weeks,
        items: SETTING_FLAGS.map((key, i) => ({ key, label: SETTING_TEXT[key][0], desc: SETTING_TEXT[key][1], now: last.ratio[i], avg: recent.ratio[i],
            nowN: Math.round(last.counts[i]), avgN: Math.round(recent.counts[i] / (recent.weeks || 1)) })),
        langs: [...last.langs].sort((a, b) => b[1] - a[1]).map(([lang, n]) => ({ lang, ratio: n / last.users })),
    };

    // 이번 주 사용자는 주간 기록 수로 센다 — 설치마다 그 주 처음 쓴 날 바로 오므로, 다음 날 오는 하루 기록의 firstWeek보다 빠르다
    week = Math.max(week, tally((w) => w === thisWeek).users);
    // 이번 달도 같은 이유로, 이번 주 기록 중 이번 달에 쓴 사람만큼은 이미 이번 달 사용자다
    const monthPrefix = yesterday.slice(0, 7);
    const thisWeekInMonth = weeks.filter((r) => r.row === 'week' && r.week === thisWeek && String(r.date).startsWith(monthPrefix)).reduce((n, r) => n + num(r.n), 0);
    month = Math.max(month, thisWeekInMonth);

    const days = daily.filter((d) => d.users > 0).length;
    return { at: Date.now(), yesterday, daily, week, month, days, features, settings, review: REVIEW, minDays: MIN_DAYS, minWeeks: MIN_WEEKS };
}

/** 하루 리포트에 붙는 한 줄. 자세한 건 현황판 */
export function usageLine(u: UsageSummary): string {
    const y = u.daily.at(-1);
    if (!u.daily.some((d) => d.users > 0)) return '확장 사용자: 아직 기록 없음';
    return `확장 사용자 어제 ${y?.users ?? 0} (Chrome ${y?.chrome ?? 0}, Edge ${y?.edge ?? 0}), 이번 주 ${u.week}, 이번 달 ${u.month}`;
}
