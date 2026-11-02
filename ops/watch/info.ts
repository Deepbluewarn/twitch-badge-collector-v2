/**
 * 3시간마다: 스토어 수치, GitHub canary 상태, 새 배지, GA 추이를 모은다.
 *
 * 스토어 대시보드의 주간 사용자, 설치, 제거 수는 API가 없다. 공개 상세 페이지와 AMO API에 나오는 값만 쓴다.
 * 새 배지는 badge-harvester가 모은 목록(~/harvester/data/badges.json)과 확장의 배지 목록을 비교한다.
 */
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { SITE, STORE, dateHourToKstTime, kstDate, report } from '../common.ts';
import { RAW, REPO, attempt, fetchJson, fetchText, writeJson } from './state.ts';

const CWS_ID = 'gbcdobpipglclbhabpkacoecddmopojp';
const AMO_SLUG = 'twitch-badge-collector-v2';
const WORKFLOWS = [
    ['canary.yml', '선택자 canary'],
    ['canary-socket.yml', '소켓 canary'],
    ['canary-badges.yml', '배지 canary'],
] as const;
const GA_DAYS = 14;
const NEW_BADGE_DAYS = 14;

async function stores() {
    const [chrome, firefox, release] = await Promise.all([
        attempt(async () => {
            const html = await fetchText(`https://chromewebstore.google.com/detail/badge-collector/${CWS_ID}?hl=en`);
            const data = html.match(new RegExp(`\\["${CWS_ID}","[^"]*","[^"]*",([\\d.]+),(\\d+)`));
            return {
                users: html.match(/([\d,]+\+?) users/)?.[1] ?? null,
                rating: data ? Number(data[1]) : null,
                ratingCount: data ? Number(data[2]) : null,
                version: html.match(/Version<\/div><div[^>]*>([^<]+)/)?.[1] ?? null,
                updated: html.match(/Updated<\/div><div[^>]*>([^<]+)/)?.[1] ?? null,
            };
        }),
        attempt(async () => {
            const d = await fetchJson<{
                average_daily_users: number;
                ratings: { average: number; count: number };
                current_version: { version: string };
                last_updated: string;
            }>(`https://addons.mozilla.org/api/v5/addons/addon/${AMO_SLUG}/`);
            return {
                users: d.average_daily_users.toLocaleString('en-US'),
                rating: d.ratings.average,
                ratingCount: d.ratings.count,
                version: d.current_version.version,
                updated: d.last_updated.slice(0, 10),
            };
        }),
        attempt(async () => {
            const r = await fetchJson<{ tag_name: string; published_at: string }>(`https://api.github.com/repos/${REPO}/releases/latest`);
            return { version: r.tag_name.replace(/^v/, ''), published: r.published_at };
        }),
    ]);
    return { chrome, firefox, release };
}

async function github() {
    const runs = await Promise.all(
        WORKFLOWS.map(async ([file, name]) => {
            const r = await attempt(() =>
                fetchJson<{ workflow_runs: { conclusion: string | null; status: string; created_at: string; html_url: string }[] }>(
                    `https://api.github.com/repos/${REPO}/actions/workflows/${file}/runs?per_page=5&exclude_pull_requests=true`,
                ),
            );
            if ('error' in r) return { file, name, error: r.error };
            const done = r.workflow_runs.filter((x) => x.status === 'completed');
            const last = done[0];
            return {
                file,
                name,
                conclusion: last?.conclusion ?? null,
                at: last?.created_at ?? null,
                url: last?.html_url ?? `https://github.com/${REPO}/actions/workflows/${file}`,
                recent: done.map((x) => x.conclusion),
            };
        }),
    );
    const issues = await attempt(async () => {
        const list = await fetchJson<{ number: number; title: string; html_url: string; labels: { name: string }[]; pull_request?: unknown; created_at: string }[]>(
            `https://api.github.com/repos/${REPO}/issues?state=open&per_page=50`,
        );
        return list.filter((i) => !i.pull_request).map((i) => ({ number: i.number, title: i.title, url: i.html_url, labels: i.labels.map((l) => l.name), created: i.created_at }));
    });
    return { runs, issues };
}

interface HarvestedBadge {
    badgeId: string;
    scope: string;
    imageUrl: string;
    imageUrls: string[];
    firstSeen: number;
    lastSeen: number;
    sightings: number;
    channels: string[];
}

async function badges() {
    const file = join(homedir(), 'harvester/data/badges.json');
    if (!existsSync(file)) throw new Error('harvester 데이터 없음');
    const harvested = Object.values((JSON.parse(readFileSync(file, 'utf8')) as { badges: Record<string, HarvestedBadge> }).badges);
    const list = await fetchJson<{ groups: { title: string; badges: { name: string; imageUrl: string }[] }[] }>(`${RAW}/data/chzzk-badges.json`);
    const known = new Set(list.groups.flatMap((g) => g.badges.map((b) => b.imageUrl)));
    // 구독 배지는 채널마다 달라 목록에 넣지 않는다 (docs/chzzk-badges.md)
    const common = harvested.filter((b) => b.scope !== 'SUBSCRIPTION');
    const view = (b: HarvestedBadge) => ({
        badgeId: b.badgeId,
        scope: b.scope,
        imageUrl: b.imageUrl,
        firstSeen: b.firstSeen,
        lastSeen: b.lastSeen,
        sightings: b.sightings,
        channels: b.channels.length,
    });
    const recentSince = Date.now() - NEW_BADGE_DAYS * 86_400_000;
    return {
        listed: known.size,
        harvested: harvested.length,
        common: common.length,
        unlisted: common.filter((b) => !b.imageUrls.some((u) => known.has(u))).map(view).sort((a, b) => b.firstSeen - a.firstSeen),
        recent: common.filter((b) => b.firstSeen >= recentSince).map(view).sort((a, b) => b.firstSeen - a.firstSeen),
        subscriptionRecent: harvested.filter((b) => b.scope === 'SUBSCRIPTION' && b.firstSeen >= Date.now() - 86_400_000).length,
    };
}

async function analytics() {
    const today = kstDate(Date.now());
    const from = kstDate(Date.now() - (GA_DAYS + 1) * 86_400_000);
    const [events, site] = await Promise.all([
        report(STORE, [from, 'today'], ['dateHour', 'eventName'], ['eventCount']),
        report(SITE, [from, 'today'], ['date'], ['activeUsers', 'screenPageViews']),
    ]);
    const days = new Map<string, { visits: number; installs: number; siteUsers: number; siteViews: number }>();
    const day = (d: string) => days.get(d) ?? (days.set(d, { visits: 0, installs: 0, siteUsers: 0, siteViews: 0 }), days.get(d)!);
    for (const { dims: [dateHour, event], mets: [n] } of events) {
        if (event !== 'session_start' && event !== 'install') continue;
        const d = day(dateHourToKstTime(dateHour, STORE.tz).day);
        if (event === 'install') d.installs += n;
        else d.visits += n;
    }
    for (const { dims: [date], mets: [users, views] } of site) {
        const d = day(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`);
        d.siteUsers += users;
        d.siteViews += views;
    }
    return [...days]
        .filter(([d]) => d > from && d <= today)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, v]) => ({ date, ...v }));
}

async function main(): Promise<void> {
    const [s, g, b, ga] = await Promise.all([attempt(stores), attempt(github), attempt(badges), attempt(analytics)]);
    writeJson('info', { at: Date.now(), stores: s, github: g, badges: b, ga });
    console.log(`[info] ${new Date().toISOString()} ${[s, g, b, ga].map((x) => ('error' in (x as object) ? 'error' : 'ok')).join(' ')}`);
}

main().catch((err) => {
    console.error(`[info] ${new Date().toISOString()}`, err);
    process.exit(1);
});
