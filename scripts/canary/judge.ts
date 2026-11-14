/**
 * 선택자 카나리 판정. 방문한 방송 전체의 결과로 "지금 어떤가"를 사건 목록으로 낸다.
 * 지난번과 비교하지 않는다. 같은 일을 다시 알리지 않는 것은 ovm 상황실 장부(ops/watch/incidents.ts)가 맡는다.
 *
 *  - selector:<이름>                 채팅이 뜬 방송 전부에서 0개. 채팅 컨테이너는 깨짐(수집 창이 붙을 곳이 없다).
 *                                    내용 선택자(닉네임, 본문, 배지)는 소켓 경로가 주 경로인 동안 위험(대체 경로만 영향)
 *  - selector:<이름>:branch:<갈래>   선택자는 맞는데 이 갈래는 모든 방송에서 0개. 위험 (11-12에 배지 예비 갈래가 이랬다)
 *  - selector:<이름>:channels        맞은 방송이 CHANNEL_RATIO 미만. 위험
 *  - selector:badge:missed           닉네임 영역에 배지 그림이 있는데 배지 선택자가 못 잡음. 위험
 *
 * 채팅이 뜬 방송이 MIN_CHANNELS 미만이면 판정하지 않고 unknown을 낸다. 다만 페이지는 열렸는데 채팅 컨테이너가
 * 어디에도 없으면 채팅이 없는 게 아니라 컨테이너가 바뀐 것으로 보고 깨짐을 낸다.
 */
import type { AutoFixProbe, ChannelVisitResult } from './snapshot-types.ts';

export const MIN_CHANNELS = 3;
export const CHANNEL_RATIO = 0.7;
/** 배지 놓침은 이만큼의 방송에서 보여야 사건으로 본다. 한 방송의 일시적인 그림 하나로 울리지 않게 */
const MISSED_MIN_CHANNELS = 2;

export interface CanaryFinding {
    key: string;
    level: 'broken' | 'risk' | 'info';
    title: string;
    lines: string[];
    evidence?: unknown;
}

export interface Judgement {
    status: 'ok' | 'issue' | 'unknown';
    note?: string;
    findings: CanaryFinding[];
}

const short = (url: string) => url.replace('https://chzzk.naver.com/', '');

function candidateLines(probes: AutoFixProbe[]): string[] {
    return probes.slice(0, 3).map((c) => `검증된 후보: ${c.replaced} (점수 ${c.score.toFixed(2)}, ${c.docCount}건)`);
}

/** 여러 방송의 후보를 바꿔 끼운 결과(selector)마다 하나로 모아 점수, 매칭 수가 높은 순으로 */
function mergeCandidates(lists: (AutoFixProbe[] | null | undefined)[]): AutoFixProbe[] {
    const best = new Map<string, AutoFixProbe>();
    for (const c of lists.flatMap((l) => l ?? [])) {
        const was = best.get(c.selector);
        if (!was || c.score > was.score || (c.score === was.score && c.docCount > was.docCount)) best.set(c.selector, c);
    }
    return [...best.values()].sort((a, b) => b.score - a.score || b.docCount - a.docCount);
}

/** 배지 그림 URL이 어느 묶음인지. 목록(data/chzzk-badges.json)에 없으면 구독 배지 경로인지만 본다 */
export function badgeGroup(url: string, groupOf: Map<string, string>): string {
    return groupOf.get(url) ?? (url.includes('/glive/subscription/') ? 'subscription' : '모름');
}

export interface JudgeOptions {
    /** 수집 창이 붙는 채팅 컨테이너 선택자 이름 (chatRoomLive, chatRoomVod) */
    containers: string[];
    /** 컨테이너 말고 필수 선택자가 전부 깨졌을 때의 등급. 소켓 경로가 주 경로면 risk */
    contentLevel: 'broken' | 'risk';
}

/** OTA 상수로 소켓 경로가 모든 사용자의 주 경로인지 (src/content-scripts/chzzk/socket-mode.ts와 같은 규칙) */
export function socketIsMain(constants: Record<string, string | number> | undefined): boolean {
    return Number(constants?.socketRender ?? 1) !== 0 && Number(constants?.socketRenderPercent ?? 100) >= 100;
}

export function judge(results: ChannelVisitResult[], requiredList: string[], groupOf: Map<string, string>, opts: JudgeOptions): Judgement {
    const loaded = results.filter((r) => r.ok && (r.chatItemCount ?? 0) > 0);
    if (loaded.length < MIN_CHANNELS) {
        const opened = results.filter((r) => r.ok);
        const gone = opts.containers.filter((name) => requiredList.includes(name));
        if (opened.length >= MIN_CHANNELS && gone.length && opened.every((r) => gone.every((name) => !((r.selectors.find((x) => x.name === name)?.count ?? 0) > 0)))) {
            return {
                status: 'issue',
                findings: gone.map((name) => ({
                    key: `selector:${name}`,
                    level: 'broken' as const,
                    title: `채팅 컨테이너 ${name}를 못 찾음 (열린 방송 ${opened.length}곳 모두). 수집 창이 붙을 곳이 없다`,
                    lines: [`지금 선택자: ${opened[0].selectors.find((x) => x.name === name)?.selector ?? ''}`, ...candidateLines(mergeCandidates(opened.map((r) => r.selectors.find((x) => x.name === name)?.candidates))), `대표 방송: ${opened[0].url}`, '고치는 법: docs/ota-selectors.md'],
                })),
            };
        }
        return { status: 'unknown', note: `채팅이 뜬 방송이 ${loaded.length}곳뿐 (방문 ${results.length}곳)`, findings: [] };
    }

    const findings: CanaryFinding[] = [];
    for (const name of requiredList) {
        const samples = loaded.map((r) => ({ r, s: r.selectors.find((x) => x.name === name) }));
        const selector = samples.find((x) => x.s?.selector)?.s?.selector ?? '';
        const matched = samples.filter((x) => (x.s?.count ?? 0) > 0);

        if (matched.length === 0) {
            const probes = mergeCandidates(samples.map((x) => x.s?.candidates));
            const container = opts.containers.includes(name);
            const level = container ? 'broken' : opts.contentLevel;
            findings.push({
                key: `selector:${name}`,
                level,
                title: container
                    ? `채팅 컨테이너 ${name} 깨짐 (채팅이 뜬 방송 ${loaded.length}곳 모두 0개). 수집 창이 붙을 곳이 없다`
                    : `선택자 ${name} 깨짐 (채팅이 뜬 방송 ${loaded.length}곳 모두 0개)${level === 'risk' ? '. 소켓 경로는 영향 없고 HTML 대체 경로만 깨짐' : ''}`,
                lines: [`지금 선택자: ${selector}`, ...candidateLines(probes), `대표 방송: ${loaded[0].url}`, '고치는 법: docs/ota-selectors.md'],
                evidence: { selector, candidates: probes.slice(0, 5) },
            });
            continue;
        }

        // 배지는 배지 단 채팅이 없는 방송이 흔하다. 닉네임 영역에 그림이 있던 방송만 센다
        const pool = name === 'badge' ? samples.filter((x) => (x.r.badgeImages?.total ?? 0) > 0) : samples;
        const poolMatched = pool.filter((x) => (x.s?.count ?? 0) > 0);
        if (pool.length >= MIN_CHANNELS && poolMatched.length / pool.length < CHANNEL_RATIO) {
            const failed = pool.filter((x) => !((x.s?.count ?? 0) > 0)).map((x) => short(x.r.url));
            findings.push({
                key: `selector:${name}:channels`,
                level: 'risk',
                title: `선택자 ${name}: 방송 ${poolMatched.length}/${pool.length}곳에서만 맞음`,
                lines: [`지금 선택자: ${selector}`, `안 맞은 방송: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? ` 외 ${failed.length - 3}곳` : ''}`],
            });
        }

        // 갈래는 방송 전체를 합쳐 0개인 것만 죽은 것으로 본다
        const branches = matched[0].s?.branchCounts ?? [];
        for (const b of branches) {
            const all = matched.map((x) => x.s?.branchCounts?.find((y) => y.selector === b.selector));
            if (all.some((y) => (y?.count ?? 0) > 0)) continue;
            const probes = mergeCandidates(all.map((y) => y?.candidates));
            findings.push({
                key: `selector:${name}:branch:${b.selector}`,
                level: 'risk',
                title: `선택자 ${name}의 갈래 하나가 모든 방송에서 0개 (다른 갈래로 아직 동작)`,
                lines: [`죽은 갈래: ${b.selector}`, ...candidateLines(probes), '남은 갈래까지 죽기 전에 교체: docs/ota-selectors.md'],
                evidence: { selector, branch: b.selector, candidates: probes.slice(0, 5) },
            });
        }
    }

    const withMissed = loaded.filter((r) => (r.badgeImages?.missed.length ?? 0) > 0);
    if (withMissed.length >= MISSED_MIN_CHANNELS) {
        const byGroup = new Map<string, Set<string>>();
        for (const url of withMissed.flatMap((r) => r.badgeImages!.missed)) {
            const g = badgeGroup(url, groupOf);
            byGroup.set(g, (byGroup.get(g) ?? new Set()).add(url));
        }
        const total = loaded.reduce((n, r) => n + (r.badgeImages?.total ?? 0), 0);
        const missed = withMissed.reduce((n, r) => n + r.badgeImages!.missed.length, 0);
        findings.push({
            key: 'selector:badge:missed',
            level: 'risk',
            title: `배지 선택자가 닉네임 옆 배지 그림을 놓침 (${missed}/${total}장, 방송 ${withMissed.length}곳)`,
            lines: [...[...byGroup].map(([g, urls]) => `${g}: ${[...urls].slice(0, 2).join(' ')}${urls.size > 2 ? ` 외 ${urls.size - 2}종` : ''}`), `대표 방송: ${withMissed[0].url}`],
            evidence: Object.fromEntries([...byGroup].map(([g, urls]) => [g, [...urls]])),
        });
    }

    return { status: findings.length ? 'issue' : 'ok', findings };
}
