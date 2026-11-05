/**
 * 하루 통계 리포트 — 어제(한국 날짜) 스토어 상세 페이지 방문과 유입 경로, badgecollector.dev 방문, 확장 익명 사용 통계를
 * Discord(community-watch 웹훅)로 보낸다. ovm crontab에서 매일 10시에 돈다.
 *
 * 스토어 대시보드의 주간 사용자·설치·제거 수는 API가 없어서 넣지 않는다.
 *
 * 스토어 속성은 LA 시간대라 dateHour로 받아 한국 날짜로 다시 묶는다. 시간별로 더해도 맞도록
 * 사용자 수 대신 세션 수를 센다.
 *
 * 플래그:
 *  --dry-run          Discord로 보내지 않고 콘솔에 출력
 *  --date=YYYY-MM-DD  어제 대신 이 날(한국 날짜)
 */
import { SITE, STORE, dateHourToKst, kstDate, report, sendDiscord } from './common.ts';
import { usageLines } from './usage-report.ts';

const DAY = 86_400_000;
const AVG_DAYS = 7;
const SOURCE_DAYS = 30;
const SURGE = 2;
// 유입 경로가 어제 이만큼 넘고, 이전 30일 중 가장 많았던 날의 SOURCE_SURGE배를 넘으면 표시한다.
// 어디선가 링크가 퍼졌다는 뜻이다 (예: 10/25 t.co 107, 이전 최대 8).
const SOURCE_MIN = 10;
const SOURCE_SURGE = 3;
const SCANNER = /\/\.|\.(php|aspx?|jsp|cgi|env|ini|bak|sql|ya?ml)$/i;

function daysBefore(date: string, n: number): string {
    return kstDate(Date.parse(`${date}T12:00:00+09:00`) - n * DAY);
}

function top(map: Map<string, number>, n: number): [string, number][] {
    return [...map].sort((a, b) => b[1] - a[1]).slice(0, n);
}

async function main(): Promise<void> {
    const yesterday = process.argv.find((a) => a.startsWith('--date='))?.slice(7) ?? kstDate(Date.now() - DAY);
    const from = daysBefore(yesterday, SOURCE_DAYS + 1);

    // 스토어: 한국 날짜별 세션, 어제 유입 경로별 세션, 이전 30일 유입 경로별 하루 최대
    const storeRows = await report(STORE, [from, 'today'], ['dateHour', 'sessionSource'], ['sessions']);
    const perDay = new Map<string, number>();
    const sources = new Map<string, number>();
    const before = new Map<string, number>(); // `${day} ${source}` → 세션
    for (const { dims: [dateHour, source], mets: [sessions] } of storeRows) {
        const day = dateHourToKst(dateHour, STORE.tz);
        perDay.set(day, (perDay.get(day) ?? 0) + sessions);
        if (day === yesterday) sources.set(source, (sources.get(source) ?? 0) + sessions);
        else if (day < yesterday) before.set(`${day} ${source}`, (before.get(`${day} ${source}`) ?? 0) + sessions);
    }
    const prevMax = new Map<string, number>();
    for (const [key, n] of before) {
        const source = key.slice(11);
        prevMax.set(source, Math.max(prevMax.get(source) ?? 0, n));
    }
    const visits = perDay.get(yesterday) ?? 0;
    let prev = 0;
    for (let i = 1; i <= AVG_DAYS; i++) prev += perDay.get(daysBefore(yesterday, i)) ?? 0;
    const avg = prev / AVG_DAYS;
    const jumped = [...sources].filter(([s, n]) => n >= SOURCE_MIN && n > (prevMax.get(s) ?? 0) * SOURCE_SURGE);

    // 사이트는 한국 시간대 속성이라 날짜로 바로 묻는다
    const [siteTotal] = await report(SITE, [yesterday, yesterday], [], ['activeUsers', 'screenPageViews']);
    const pages = await report(SITE, [yesterday, yesterday], ['pagePath'], ['screenPageViews']);

    const weekday = new Date(`${yesterday}T12:00:00+09:00`).toLocaleDateString('ko-KR', { weekday: 'short', timeZone: 'Asia/Seoul' });
    const [, mm, dd] = yesterday.split('-').map(Number);
    const lines = [`**통계 ${mm}/${dd} (${weekday})**`];

    const notes: string[] = [];
    if (avg > 0 && visits >= avg * SURGE) notes.push(`스토어 방문이 평소의 ${(visits / avg).toFixed(1)}배`);
    for (const [s, n] of jumped) notes.push(`${s} 유입 ${n} (이전 ${SOURCE_DAYS}일 하루 최대 ${prevMax.get(s) ?? 0})`);
    if (notes.length) lines.push(`> ${notes.join(' / ')}`);

    const ratio = avg > 0 ? ` (${visits >= avg ? '+' : ''}${Math.round((visits / avg - 1) * 100)}%)` : '';
    lines.push(`스토어 페이지 방문 ${visits}, 지난 ${AVG_DAYS}일 평균 ${Math.round(avg)}${ratio}`);
    if (sources.size) lines.push(`유입: ${top(sources, 5).map(([s, n]) => `${s} ${n}`).join(', ')}`);

    const [users = 0, views = 0] = siteTotal?.mets ?? [];
    lines.push(`badgecollector.dev 방문자 ${users}, 페이지뷰 ${views}`);
    // /.env, /config/mail.php 같은 취약점 스캐너 요청은 뺀다
    const pageViews = new Map(pages.filter(({ dims: [path] }) => !SCANNER.test(path)).map(({ dims: [path], mets: [n] }) => [path, n]));
    if (pageViews.size) lines.push(`많이 본 페이지: ${top(pageViews, 5).map(([p, n]) => `${p} ${n}`).join(', ')}`);

    // 확장 익명 사용 통계. 못 읽어도 위 리포트는 보낸다
    try {
        lines.push('', ...(await usageLines(yesterday)));
    } catch (err) {
        lines.push('', `확장 사용 통계를 못 읽음: ${err instanceof Error ? err.message : err}`);
    }

    await sendDiscord(lines);
}

main().catch((err) => {
    console.error(`[stats] ${new Date().toISOString()}`, err);
    process.exit(1);
});
