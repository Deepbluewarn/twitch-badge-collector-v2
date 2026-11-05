/**
 * 확장 익명 사용 통계 (docs/adr/0001-anonymous-usage-stats.md) — stats-report.ts가 하루 리포트 끝에 붙인다.
 *
 * badgecollector.dev/api/ping이 Cloudflare Analytics Engine(tbc_usage)에 쓴 것을 SQL API로 읽는다.
 * 열 배치는 사이트 리포 functions/api/ping.ts 머리 주석. 개수는 SUM(_sample_interval)로 센다.
 * 실제 릴리스된 버전(GitHub 릴리스)의 기록만 센다. 개발 빌드, 시험 기록(0.0.0), 가짜 핑을 거른다.
 *
 * - 매일: 어제 사용자(일, 이번 주, 이번 달), 어제 기능별 사용 비율, 4주 평균 5% 미만 기능
 * - 월요일: 지난주 설정 기록(기본값에서 바꾼 비율), 4주 평균 5% 미만 설정, 언어
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

function pct(part: number, whole: number): string {
    const p = whole > 0 ? (part / whole) * 100 : 0;
    return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}

/** 라벨과 합계를 비율 높은 순으로. under를 주면 그 비율 아래만(0 포함), 안 주면 0은 뺀다 */
function rank(labels: string[], counts: number[], whole: number, under?: number): string {
    return labels
        .map((label, i) => ({ label, n: counts[i] }))
        .filter(({ n }) => (under === undefined ? n > 0 : whole > 0 && n / whole < under))
        .sort((a, b) => b.n - a.n)
        .map(({ label, n }) => `${label} ${pct(n, whole)}`)
        .join(', ');
}

export async function usageLines(yesterday: string): Promise<string[]> {
    const released = await releasedVersions();
    const [dayRows, weekRows] = await Promise.all([
        sql(`SELECT blob2 AS date, blob3 AS v, blob4 AS b, SUM(_sample_interval) AS n, ${sums(ROW_DOUBLES)} FROM tbc_usage
             WHERE blob1 = 'day' AND timestamp > NOW() - INTERVAL '${QUERY_DAYS}' DAY GROUP BY date, v, b`),
        sql(`SELECT blob1 AS row, blob5 AS week, blob3 AS v, blob6 AS lang, SUM(_sample_interval) AS n, ${sums(ROW_DOUBLES)} FROM tbc_usage
             WHERE (blob1 = 'week' OR blob1 = 'week2') AND timestamp > NOW() - INTERVAL '${QUERY_DAYS}' DAY GROUP BY row, week, v, lang`),
    ]);

    // ── 하루 기록 ── double1 firstWeek, double2 firstMonth, double3.. USAGE_FLAGS
    const days = dayRows.filter((r) => released.has(String(r.v)));
    const weekStart = (() => {
        const d = new Date(`${yesterday}T00:00:00Z`).getUTCDay() || 7;
        return shiftDay(yesterday, 1 - d);
    })();
    const windowStart = shiftDay(yesterday, 1 - WINDOW_DAYS);
    let dau = 0, wau = 0, mau = 0;
    const browsers = new Map<string, number>();
    const flagsY = USAGE_FLAGS.map(() => 0);
    const flags28 = USAGE_FLAGS.map(() => 0);
    let n28 = 0;
    const dates28 = new Set<string>();
    for (const r of days) {
        const date = String(r.date), n = num(r.n), d = doubles(r);
        if (date >= weekStart && date <= yesterday) wau += d[0];
        if (date.slice(0, 7) === yesterday.slice(0, 7) && date <= yesterday) mau += d[1];
        if (date === yesterday) {
            dau += n;
            browsers.set(String(r.b), (browsers.get(String(r.b)) ?? 0) + n);
            USAGE_FLAGS.forEach((_, i) => { flagsY[i] += d[i + 2]; });
        }
        if (date >= windowStart && date <= yesterday) {
            n28 += n;
            dates28.add(date);
            USAGE_FLAGS.forEach((_, i) => { flags28[i] += d[i + 2]; });
        }
    }

    if (days.length === 0) return ['**확장 사용**: 아직 기록 없음'];
    const usageLabels = USAGE_FLAGS.map((f) => USAGE_LABEL[f]);
    const lines = [
        '**확장 사용** (늦게 오는 기록이 있어 며칠 동안 늘 수 있음)',
        `사용자 어제 ${dau} (${[...browsers].map(([b, n]) => `${b === 'edge' ? 'Edge' : 'Chrome'} ${n}`).join(', ') || '없음'}), 이번 주 ${wau}, 이번 달 ${mau}`,
    ];
    if (dau > 0) lines.push(`어제 기능: ${rank(usageLabels, flagsY, dau)}`);
    const lowUsage = rank(usageLabels, flags28, n28, REVIEW);
    if (lowUsage && dates28.size >= MIN_DAYS) lines.push(`4주 평균 5% 미만 (${dates28.size}일치): ${lowUsage}`);

    // ── 주간 설정 기록 ── 월요일 리포트(어제가 일요일)에만. week 행에 앞 20개, week2 행에 나머지
    if (new Date(`${yesterday}T00:00:00Z`).getUTCDay() !== 0) return lines;
    const thisWeek = isoWeek(yesterday);
    const recentWeeks = new Set([0, 7, 14, 21].map((back) => isoWeek(shiftDay(yesterday, -back))));
    const weeks = weekRows.filter((r) => released.has(String(r.v)));
    const tally = (pick: (week: string) => boolean) => {
        const counts = SETTING_FLAGS.map(() => 0);
        const base = { week: 0, week2: 0 };
        const langs = new Map<string, number>();
        for (const r of weeks) {
            if (!pick(String(r.week))) continue;
            const row = String(r.row) as 'week' | 'week2', n = num(r.n), d = doubles(r);
            base[row] += n;
            const offset = row === 'week' ? 0 : ROW_DOUBLES;
            d.forEach((x, i) => { if (offset + i < counts.length) counts[offset + i] += x; });
            if (row === 'week') langs.set(String(r.lang), (langs.get(String(r.lang)) ?? 0) + n);
        }
        // week2 칸은 week2 행 수로 나눠야 하지만, 표본 추출 전엔 둘이 같다. 비율은 각자 분모로 낸다
        const ratio = counts.map((c, i) => (i < ROW_DOUBLES ? c / (base.week || 1) : c / (base.week2 || 1)));
        const weekCount = new Set(weeks.filter((r) => pick(String(r.week))).map((r) => String(r.week))).size;
        return { users: base.week, ratio, langs, weekCount };
    };
    const now = tally((w) => w === thisWeek);
    const recent = tally((w) => recentWeeks.has(w));
    if (now.users === 0) return lines;
    const settingLabels = SETTING_FLAGS.map((f) => SETTING_LABEL[f]);
    const asCounts = (ratio: number[]) => ratio.map((r) => r * 1000);
    lines.push(`**설정 ${thisWeek}** (그 주 사용자 ${now.users}, 기본값에서 바꾼 비율)`);
    lines.push(rank(settingLabels, asCounts(now.ratio), 1000) || '바꾼 사람 없음');
    const lowSetting = rank(settingLabels, asCounts(recent.ratio), 1000, REVIEW);
    if (lowSetting && recent.weekCount >= MIN_WEEKS) lines.push(`4주 평균 5% 미만 (${recent.weekCount}주치): ${lowSetting}`);
    lines.push(`언어: ${rank([...now.langs.keys()], [...now.langs.values()], now.users)}`);
    return lines;
}
