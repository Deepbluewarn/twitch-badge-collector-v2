/**
 * 고칠 사건을 GitHub 이슈로 연다. 상황실(dispatch.ts)이 매번 장부를 맞춘 뒤 부른다.
 *
 * - 대상: 깨짐 사건 전부, 선택자 카나리(라이브, 다시보기)의 위험 사건. 확인 못 함 사건은 아니다
 * - 장부에 열린 대상 사건마다 이슈가 하나. 사건이 장부에서 사라지면(회복) 댓글을 달고 닫는다
 * - 본문 끝 표시(<!-- ops-alert key: ... -->)로 이슈를 찾는다. watch/issues.json이 사라져도 다시 잇는다
 * - 선택자 사건에 검증된 후보가 있으면 바꿀 JSON 줄(rev+1)을 본문에 넣는다. 처리는 로컬 스킬 .claude/skills/ops-alert
 *
 * 토큰: ~/.config/badge-collector/ops.env GITHUB_ISSUES_TOKEN (이 리포만, Issues 읽기와 쓰기). 없으면 건너뛴다.
 * 토큰을 나중에 넣으면 그때 열려 있는 대상 사건의 이슈가 한꺼번에 열린다.
 */
import type { AutoFixProbe } from '../../scripts/canary/snapshot-types.ts';
import { CHECK_LABEL, LEVEL_LABEL, type Incident } from './incidents.ts';
import { REPO } from './state.ts';

export const LABEL = 'ops-alert';
const MARKER = /<!-- ops-alert key: (.+?) -->/;

export interface IssueRef {
    number: number;
    url: string;
}

export function isIssueWorthy(i: Incident): boolean {
    if (i.key.startsWith('blind:')) return false;
    if (i.level === 'broken') return true;
    return i.level === 'risk' && (i.check === 'selector' || i.check === 'vod');
}

export interface IssuePlan {
    create: Incident[];
    /** 표시로 찾은 이미 열린 이슈 (issues.json에 없던 것) */
    adopt: [string, IssueRef][];
    /** 사건이 장부에서 사라짐 */
    close: [string, IssueRef][];
}

/** known: issues.json, existing: GitHub에 열린 ops-alert 이슈를 표시 key로 */
export function planIssues(open: Record<string, Incident>, known: Record<string, IssueRef>, existing: Map<string, IssueRef>): IssuePlan {
    const plan: IssuePlan = { create: [], adopt: [], close: [] };
    for (const i of Object.values(open)) {
        if (!isIssueWorthy(i) || known[i.key]) continue;
        const found = existing.get(i.key);
        if (found) plan.adopt.push([i.key, found]);
        else plan.create.push(i);
    }
    for (const [key, ref] of Object.entries(known)) if (!open[key]) plan.close.push([key, ref]);
    return plan;
}

const kst = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');

/** 선택자 이름과 바꿀 전체 선택자. key: selector:<이름>, selector:<이름>:branch:<갈래>, vod:도 같다 */
export function selectorFix(i: Incident): { name: string; current: string; candidates: { selector: string; probe: AutoFixProbe }[] } | null {
    const m = i.key.match(/^(?:selector|vod):([A-Za-z]+)(?::branch:(.+))?$/);
    const ev = i.evidence as { selector?: string; branch?: string; candidates?: AutoFixProbe[] } | undefined;
    if (!m || !ev?.selector || !ev.candidates?.length) return null;
    const current = ev.selector;
    // 갈래 후보는 갈래만 바꾼 문자열이다. 전체 선택자에서 그 갈래를 바꿔 끼운다
    const candidates = ev.candidates.map((probe) => ({ probe, selector: m[2] ? current.replace(m[2], probe.selector) : probe.selector })).filter((c) => c.selector !== current);
    return candidates.length ? { name: m[1], current, candidates } : null;
}

export function issueBody(i: Incident, rev: number): { title: string; body: string; labels: string[] } {
    const parts = [
        'ovm 상황실이 연 이슈. 사건이 회복하면 댓글을 달고 닫는다.',
        '',
        `**${LEVEL_LABEL[i.level]}**, ${CHECK_LABEL[i.check] ?? i.check}, 처음 본 시각 ${kst(i.firstSeen)} (한국)`,
        '',
        ...i.lines.map((l) => `- ${l}`),
    ];
    const fix = selectorFix(i);
    if (fix) {
        const [best, ...rest] = fix.candidates;
        parts.push(
            '',
            '## 고칠 내용',
            '',
            '라이브 화면에서 검증된 후보로 바꾼 줄. `src/platform/bundled-selectors.prod.json`과 옛 빌드용 `bundled-selectors.json`에 같이 넣는다.',
            '',
            '```json',
            `"rev": ${rev + 1},`,
            `"${fix.name}": ${JSON.stringify(best.selector)}`,
            '```',
            '',
            `- 바꾼 부분: ${best.probe.replaced} (점수 ${best.probe.score.toFixed(2)}, ${best.probe.docCount}건)`,
            `- 지금: \`${fix.current}\``,
            ...rest.slice(0, 2).map((c) => `- 다른 후보: \`${c.selector}\` (점수 ${c.probe.score.toFixed(2)})`),
        );
    }
    parts.push(
        '',
        '## 처리',
        '',
        '- 세션에서 `ops-alert` 스킬로 처리한다. 선택자는 푸시가 곧 OTA 배포라 diff를 확인한 뒤 푸시한다',
        '- 선택자 절차: docs/ota-selectors.md, 감시 구조: docs/monitoring.md',
        '- 확장 문제가 아니면 이유를 댓글로 남기고 닫는다(오탐으로 센다)',
        '',
        `<!-- ops-alert key: ${i.key} -->`,
    );
    const title = `[${LEVEL_LABEL[i.level]}] ${i.title}`;
    return { title: title.length > 200 ? `${title.slice(0, 199)}…` : title, body: parts.join('\n'), labels: [LABEL, `ops:${i.check}`] };
}

// ── GitHub ──

async function gh<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'badge-collector-ops', 'X-GitHub-Api-Version': '2022-11-28' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`GitHub ${method} ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
}

async function openIssues(token: string): Promise<Map<string, IssueRef>> {
    const list = await gh<{ number: number; html_url: string; body: string | null; pull_request?: unknown }[]>(token, 'GET', `/issues?labels=${LABEL}&state=open&per_page=100`);
    const map = new Map<string, IssueRef>();
    for (const x of list) {
        const key = x.body?.match(MARKER)?.[1];
        if (key && !x.pull_request) map.set(key, { number: x.number, url: x.html_url });
    }
    return map;
}

async function ensureLabels(token: string, labels: string[]): Promise<void> {
    for (const name of labels) {
        // 이미 있으면 422. 무시한다
        await gh(token, 'POST', '/labels', { name, color: name === LABEL ? 'B60205' : 'D93F0B', description: name === LABEL ? 'ovm 감시 상황실이 연 이슈' : '' }).catch(() => {});
    }
}

/**
 * 이슈를 맞추고 갱신된 issues.json 내용을 돌려준다. 하나가 실패해도 나머지는 한다(실패는 로그에).
 * 새로 연 이슈는 created에 넣어 알림에 링크를 붙인다.
 */
export async function syncIssues(token: string, open: Record<string, Incident>, known: Record<string, IssueRef>, rev: number, log: (s: string) => void): Promise<{ known: Record<string, IssueRef>; links: Map<string, string> }> {
    const next = { ...known };
    const links = new Map<string, string>(Object.entries(known).map(([k, r]) => [k, r.url]));
    const plan = planIssues(open, known, await openIssues(token));
    for (const [key, ref] of plan.adopt) {
        next[key] = ref;
        links.set(key, ref.url);
    }
    if (plan.create.length) await ensureLabels(token, [LABEL, ...new Set(plan.create.map((i) => `ops:${i.check}`))]);
    for (const i of plan.create) {
        try {
            const created = await gh<{ number: number; html_url: string }>(token, 'POST', '/issues', issueBody(i, rev));
            next[i.key] = { number: created.number, url: created.html_url };
            links.set(i.key, created.html_url);
            log(`이슈 #${created.number} 열림 ${i.key}`);
        } catch (e) {
            log(`이슈 열기 실패 ${i.key}: ${String((e as Error).message ?? e)}`);
        }
    }
    for (const [key, ref] of plan.close) {
        try {
            await gh(token, 'POST', `/issues/${ref.number}/comments`, { body: `회복: 감시에서 더 이상 보이지 않는다 (${kst(Date.now())} 한국). 자동으로 닫는다.` });
            await gh(token, 'PATCH', `/issues/${ref.number}`, { state: 'closed', state_reason: 'completed' });
            delete next[key];
            log(`이슈 #${ref.number} 닫음 ${key}`);
        } catch (e) {
            log(`이슈 닫기 실패 #${ref.number}: ${String((e as Error).message ?? e)}`);
        }
    }
    return { known: next, links };
}
