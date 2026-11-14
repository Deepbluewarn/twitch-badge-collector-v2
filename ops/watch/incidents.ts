/**
 * 상황실의 장부 규칙. 확인 작업들의 보고서(watch/checks/*.json)를 지금 열린 사건 장부와 맞춰
 * 보낼 알림을 정한다. 파일, 네트워크를 건드리지 않는 순수 함수만 둔다 (입출력은 dispatch.ts).
 *
 * 사건은 key 하나다. key는 "어느 확인이, 무엇에서, 어떤 문제"를 나타내고 바뀌는 숫자는 넣지 않는다
 * (숫자는 title, lines에). 같은 key가 다시 보고되면 장부만 고치고 알리지 않는다.
 *
 * 알림
 *  - 새 사건 (open)
 *  - 등급이 오름 (up), 내려감 (down)
 *  - 안 고친 채 이어짐 (recur): 깨짐 6시간마다, 위험 24시간마다, 참고는 없음
 *  - 사라짐 (resolved): 참고는 알리지 않는다
 * 확인을 못 한 보고(unknown, error)는 사건을 닫지 않는다. 같은 확인이 연달아 못 하면 위험 사건(blind:)을 연다.
 */

export type Level = 'broken' | 'risk' | 'info';

export interface Finding {
    key: string;
    level: Level;
    /** 알림 첫 줄. 숫자가 들어가도 된다 */
    title: string;
    lines?: string[];
    /** 확인 안의 갈래(예: 실제 시험의 '치지직 (소켓 끔)'). 그 갈래를 확인 못 했으면 사건을 닫지 않는다 */
    part?: string;
    evidence?: unknown;
}

export interface CheckReport {
    check: string;
    at: number;
    /** ok 정상, issue 이상, unknown 확인 못 함, error 확인 작업 실패 */
    status: 'ok' | 'issue' | 'unknown' | 'error';
    findings: Finding[];
    /** 일부 갈래만 확인 못 했을 때 */
    unknownParts?: { part: string; note: string }[];
    note?: string;
}

export interface Incident extends Finding {
    check: string;
    lines: string[];
    firstSeen: number;
    lastSeen: number;
    lastNotified: number;
}

export interface Ledger {
    startedAt: number;
    open: Record<string, Incident>;
    /** 확인 못 함 연속 횟수. key는 check 또는 check:part. 같은 보고서(at)는 한 번만 센다 */
    blind: Record<string, { count: number; lastAt: number; since: number; note: string }>;
    /** 최근에 닫힌 참고 사건. 깜빡이는 참고(드문 메시지, 처음 보는 값)를 다시 알리지 않으려고 */
    recent: Record<string, number>;
}

export type AlertState = 'open' | 'up' | 'down' | 'recur' | 'resolved';

export interface Alert {
    at: number;
    state: AlertState;
    key: string;
    check: string;
    level: Level;
    prevLevel?: Level;
    title: string;
    lines: string[];
    firstSeen: number;
    evidence?: unknown;
}

const HOUR = 3_600_000;
export const REMIND_MS: Record<Level, number | null> = { broken: 6 * HOUR, risk: 24 * HOUR, info: null };
const RECENT_MS = 7 * 24 * HOUR;
const RANK: Record<Level, number> = { info: 0, risk: 1, broken: 2 };

/** 몇 번 연달아 확인 못 하면 위험으로 올릴지. 주기가 길수록 적게 */
// collect는 5분마다 보고서를 내므로 한 시간쯤 이어질 때만
export const BLIND_AFTER: Record<string, number> = { selector: 2, live: 3, main: 2, bundle: 3, socket: 3, collect: 6 };
const DEFAULT_BLIND_AFTER = 3;

export const CHECK_LABEL: Record<string, string> = {
    deploy: '배포 감지',
    selector: '선택자 카나리',
    socket: '소켓 카나리',
    live: '확장 실제 시험',
    main: '주 경로 시험',
    bundle: '번들 검사',
    ota: 'OTA 전달',
    collect: '사용자 수집 비율',
    heartbeat: '감시 작업 확인',
    badges: '새 배지',
    spike: '방문 급증',
};
export const LEVEL_LABEL: Record<Level, string> = { broken: '깨짐', risk: '위험', info: '참고' };

const isBlind = (r: CheckReport) => r.status === 'unknown' || r.status === 'error';

/** 확인 못 함 횟수를 갱신하고, 기준을 넘은 것을 위험 사건 후보로 돌려준다 */
function updateBlind(prev: Ledger['blind'], reports: CheckReport[]): { blind: Ledger['blind']; findings: (Finding & { check: string })[] } {
    const blind: Ledger['blind'] = {};
    const findings: (Finding & { check: string })[] = [];
    const bump = (key: string, at: number, note: string) => {
        const p = prev[key];
        blind[key] = !p ? { count: 1, lastAt: at, since: at, note } : p.lastAt === at ? p : { count: p.count + 1, lastAt: at, since: p.since, note };
    };
    for (const r of reports) {
        if (isBlind(r)) bump(r.check, r.at, r.note ?? (r.status === 'error' ? '실행 실패' : '확인 못 함'));
        for (const u of r.unknownParts ?? []) bump(`${r.check}:${u.part}`, r.at, u.note);
    }
    for (const [key, b] of Object.entries(blind)) {
        const [check, part] = key.split(/:(.*)/s);
        if (b.count < (BLIND_AFTER[check] ?? DEFAULT_BLIND_AFTER)) continue;
        const label = CHECK_LABEL[check] ?? check;
        findings.push({
            key: `blind:${key}`,
            check,
            level: 'risk',
            title: `${label}${part ? ` ${part}` : ''}: ${b.count}번 연달아 확인 못 함`,
            lines: [`마지막 이유: ${b.note}`],
        });
    }
    return { blind, findings };
}

export function reconcile(prev: Ledger | undefined, reports: CheckReport[], now: number): { ledger: Ledger; alerts: Alert[] } {
    const { blind, findings: blindFindings } = updateBlind(prev?.blind ?? {}, reports);
    const current = new Map<string, Finding & { check: string }>();
    for (const r of reports) for (const f of r.findings) current.set(f.key, { ...f, check: r.check });
    for (const f of blindFindings) current.set(f.key, f);

    const open: Record<string, Incident> = {};
    const recent: Record<string, number> = {};
    for (const [k, at] of Object.entries(prev?.recent ?? {})) if (now - at < RECENT_MS) recent[k] = at;
    const alerts: Alert[] = [];
    const alert = (state: AlertState, i: Incident, prevLevel?: Level) =>
        alerts.push({ at: now, state, key: i.key, check: i.check, level: i.level, prevLevel, title: i.title, lines: i.lines, firstSeen: i.firstSeen, evidence: i.evidence });

    // 장부가 없으면(처음 켤 때) 지금 보이는 것을 알리지 않고 장부에만 적는다. 이미 알던 일을 한꺼번에 다시 보내지 않게
    const bootstrap = !prev;

    for (const f of current.values()) {
        const was = prev?.open[f.key];
        const lines = f.lines ?? [];
        if (!was) {
            const i: Incident = { ...f, lines, firstSeen: now, lastSeen: now, lastNotified: now };
            open[f.key] = i;
            delete recent[f.key];
            const flicker = f.level === 'info' && (prev?.recent[f.key] ?? -Infinity) > now - RECENT_MS;
            if (!bootstrap && !flicker) alert('open', i);
            continue;
        }
        const i: Incident = { ...was, ...f, lines, firstSeen: was.firstSeen, lastSeen: now, lastNotified: was.lastNotified };
        open[f.key] = i;
        if (f.level !== was.level) {
            i.lastNotified = now;
            alert(RANK[f.level] > RANK[was.level] ? 'up' : 'down', i, was.level);
            continue;
        }
        const remind = REMIND_MS[i.level];
        if (remind !== null && now - was.lastNotified >= remind) {
            i.lastNotified = now;
            alert('recur', i);
        }
    }

    const byCheck = new Map(reports.map((r) => [r.check, r]));
    for (const was of Object.values(prev?.open ?? {})) {
        if (current.has(was.key)) continue;
        const r = byCheck.get(was.check);
        // 확인을 못 했으면 고쳐졌는지 모른다. 사건을 그대로 둔다
        const unseen = !was.key.startsWith('blind:') && (!r || isBlind(r) || (was.part !== undefined && r.unknownParts?.some((u) => u.part === was.part)));
        if (unseen) {
            open[was.key] = was;
            continue;
        }
        if (was.level === 'info') recent[was.key] = now;
        else alert('resolved', was);
    }

    return { ledger: { startedAt: prev?.startedAt ?? now, open, blind, recent }, alerts };
}

/** 소켓 카나리 문구처럼 숫자가 섞인 문장에서 사건 key를 만든다. 비율, 건수, 표본 예시를 지운다 */
export function stableKey(text: string): string {
    // 소켓 카나리 문구는 '설명 — 표본' 모양이다 (scripts/canary/socket-check.ts)
    return text
        .split(' — ')[0]
        .replace(/\d+(\.\d+)?%/g, '%')
        .replace(/\d+\/\d+/g, 'n/n')
        .replace(/\d+건/g, 'n건')
        .trim();
}

function duration(ms: number): string {
    const m = Math.max(1, Math.round(ms / 60_000));
    if (m < 60) return `${m}분`;
    const h = Math.round(m / 60);
    return h < 48 ? `${h}시간` : `${Math.round(h / 24)}일`;
}

/** 긴급: 깨짐, 위험이 생기거나 심해지거나 이어질 때. 참고: 그 밖(참고 사건, 회복, 완화) */
export function isUrgent(a: Alert): boolean {
    return a.level !== 'info' && (a.state === 'open' || a.state === 'up' || a.state === 'recur');
}

const MAX_PER_MESSAGE = 15;

function alertLines(a: Alert, now: number): string[] {
    const label = LEVEL_LABEL[a.level];
    switch (a.state) {
        case 'open':
            return [a.level === 'info' ? `**${a.title}**` : `**${label}: ${a.title}**`, ...a.lines];
        case 'up':
            return [`**${LEVEL_LABEL[a.prevLevel!]} → ${label}: ${a.title}**`, ...a.lines];
        case 'down':
            return [`**완화 (${LEVEL_LABEL[a.prevLevel!]} → ${label}): ${a.title}**`, ...a.lines];
        case 'recur':
            return [`**아직 ${label} (${duration(now - a.firstSeen)}째): ${a.title}**`, ...a.lines.slice(0, 6)];
        case 'resolved':
            return [`**회복: ${a.title}** (${duration(now - a.firstSeen)} 만)`];
    }
}

/** 알림 묶음을 Discord 메시지 두 개(긴급, 참고)의 줄로 만든다. 비어 있으면 그 메시지는 보내지 않는다 */
export function formatAlerts(alerts: Alert[], now: number, dashboard: string): { urgent: string[]; normal: string[]; mention: boolean } {
    const build = (list: Alert[]) => {
        if (!list.length) return [];
        const shown = list.slice(0, MAX_PER_MESSAGE);
        const lines = shown.flatMap((a, i) => [...(i ? [''] : []), ...alertLines(a, now)]);
        if (list.length > shown.length) lines.push('', `외 ${list.length - shown.length}건은 현황판과 ovm alerts.jsonl에`);
        return [...lines, '', dashboard];
    };
    const urgent = alerts.filter(isUrgent);
    return {
        urgent: build(urgent),
        normal: build(alerts.filter((a) => !isUrgent(a))),
        mention: urgent.some((a) => a.level === 'broken'),
    };
}
