/**
 * 지금 스토어 상세 페이지 현황을 터미널에 출력 — 오늘(한국 시간) 시간별 방문·설치, 유입 경로, 최근 30분 실시간.
 * 로컬 셸의 `tbc` 함수가 ssh로 부른다.
 *
 * install은 스토어 페이지에서 설치를 마친 이벤트다. 스토어 CSV 설치 수의 약 8할이 잡힌다.
 */
import { STORE, dateHourToKstTime, kstDate, realtime, report } from './common.ts';

async function main(): Promise<void> {
    const today = kstDate(Date.now());
    const yesterday = kstDate(Date.now() - 86_400_000);
    // 속성은 LA 날짜라 하루 더 앞에서부터 받는다
    const from = kstDate(Date.now() - 2 * 86_400_000);

    const [events, sources, rtEvents, rtDevices] = await Promise.all([
        report(STORE, [from, 'today'], ['dateHour', 'eventName'], ['eventCount']),
        report(STORE, [from, 'today'], ['dateHour', 'sessionSource'], ['sessions']),
        realtime(STORE, ['eventName'], ['eventCount']),
        realtime(STORE, ['deviceCategory'], ['activeUsers']),
    ]);

    const hours = new Map<number, { visits: number; installs: number }>();
    const totals = { [today]: { visits: 0, installs: 0 }, [yesterday]: { visits: 0, installs: 0 } };
    for (const { dims: [dateHour, event], mets: [n] } of events) {
        if (event !== 'session_start' && event !== 'install') continue;
        const { day, hour } = dateHourToKstTime(dateHour, STORE.tz);
        const key = event === 'install' ? 'installs' : 'visits';
        if (totals[day]) totals[day][key] += n;
        if (day !== today) continue;
        const h = hours.get(hour) ?? { visits: 0, installs: 0 };
        h[key] += n;
        hours.set(hour, h);
    }

    const bySource = new Map<string, number>();
    for (const { dims: [dateHour, source], mets: [n] } of sources) {
        if (dateHourToKstTime(dateHour, STORE.tz).day === today) bySource.set(source, (bySource.get(source) ?? 0) + n);
    }

    const out: string[] = [`스토어 상세 페이지 ${today} (GA, 최근 몇 시간은 덜 잡힘)`, '', ' 시각   방문  설치'];
    for (const [hour, { visits, installs }] of [...hours].sort((a, b) => a[0] - b[0])) {
        out.push(`${String(hour).padStart(3)}시  ${String(visits).padStart(5)} ${String(installs).padStart(5)}`);
    }
    const t = totals[today];
    const y = totals[yesterday];
    out.push(` 합계  ${String(t.visits).padStart(5)} ${String(t.installs).padStart(5)}`);
    out.push(` 어제  ${String(y.visits).padStart(5)} ${String(y.installs).padStart(5)}`);
    out.push('');
    const topSources = [...bySource].sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (topSources.length) out.push(`유입: ${topSources.map(([s, n]) => `${s} ${n}`).join(', ')}`);

    const rtInstalls = rtEvents.find((r) => r.dims[0] === 'install')?.mets[0] ?? 0;
    const rtUsers = rtDevices.reduce((sum, r) => sum + r.mets[0], 0);
    const devices = rtDevices.map(({ dims: [d], mets: [n] }) => `${d} ${n}`).join(', ');
    out.push(`최근 30분: ${rtUsers}명${devices ? ` (${devices})` : ''}, 설치 ${rtInstalls}`);

    console.log(out.join('\n'));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
