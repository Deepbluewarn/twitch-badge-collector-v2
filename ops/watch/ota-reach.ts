/**
 * OTA 전달 판정. 리포(ovm이 막 pull한 master)의 파일과 jsDelivr가 사용자에게 주는 같은 주소의 파일을 비교한다.
 * 다르면 ota.ts가 purge하고, 처음 다르다고 본 뒤 STALE_AFTER_MS가 지나도 그대로면 사건을 낸다.
 *
 * 입출력 없는 순수 함수만 둔다. 받기와 purge는 ota.ts가 한다.
 */
import type { CheckReport, Finding, Level } from './incidents.ts';

export const STALE_AFTER_MS = 30 * 60_000;

export interface OtaTarget {
    name: string;
    label: string;
    /** 리포 안 경로이자 jsDelivr 경로 */
    path: string;
    /** selectors는 rev 숫자로, 그 밖은 내용 해시로 비교한다 */
    kind: 'rev' | 'hash';
    /** 30분 넘게 안 닿을 때 */
    level: Level;
}

export const TARGETS: OtaTarget[] = [
    { name: 'selectors', label: '선택자 (v2.18.16 이후 빌드)', path: 'src/platform/bundled-selectors.prod.json', kind: 'rev', level: 'risk' },
    { name: 'selectors-old', label: '선택자 (v2.18.15 이전 빌드)', path: 'src/platform/bundled-selectors.json', kind: 'rev', level: 'info' },
    { name: 'badges', label: '치지직 배지 목록', path: 'data/chzzk-badges.json', kind: 'hash', level: 'info' },
];

export interface FileState {
    repo: string;
    cdn?: string;
    /** 리포와 다르다고 처음 본 시각. 같아지면 지운다 */
    diffSince?: number;
    /** 이 리포 버전으로 purge를 했다 (같은 버전에 한 번만) */
    purgedFor?: string;
    /** 이번 실행에 jsDelivr를 못 읽었으면 */
    error?: string;
}

/** jsDelivr가 리포보다 뒤처졌는지. rev는 jsDelivr가 앞서면(ovm pull이 늦음) 뒤처진 게 아니다 */
export function behind(kind: OtaTarget['kind'], repo: string, cdn: string): boolean {
    return kind === 'rev' ? Number(cdn) < Number(repo) : cdn !== repo;
}

/** 이번 관찰로 상태를 갱신한다. purged: 이번 실행에 purge했으면 그 리포 버전 */
export function nextState(prev: FileState | undefined, target: OtaTarget, obs: { repo: string; cdn?: string; error?: string; purged?: string }, now: number): FileState {
    const purgedFor = obs.purged ?? (prev?.repo === obs.repo ? prev.purgedFor : undefined);
    if (obs.cdn === undefined) return { repo: obs.repo, cdn: prev?.cdn, diffSince: prev?.diffSince, purgedFor, error: obs.error ?? 'jsDelivr를 못 읽음' };
    const stale = behind(target.kind, obs.repo, obs.cdn);
    return { repo: obs.repo, cdn: obs.cdn, purgedFor, ...(stale ? { diffSince: prev?.diffSince ?? now } : {}) };
}

/** 선택자가 새 rev로 jsDelivr에 닿은 순간인지 (바로 카나리, 주 경로 시험을 띄운다). 첫 실행은 아니다 */
export function newlyReached(prev: FileState | undefined, next: FileState, target: OtaTarget): boolean {
    if (!prev?.cdn || next.cdn === undefined || next.diffSince !== undefined) return false;
    return target.kind === 'rev' ? Number(next.cdn) > Number(prev.cdn) : next.cdn !== prev.cdn;
}

const shown = (t: OtaTarget, v?: string) => (v === undefined ? '모름' : t.kind === 'rev' ? `rev ${v}` : v.slice(0, 12));

export function judgeOta(states: Record<string, FileState>, now: number, at = now): CheckReport {
    const findings: Finding[] = [];
    const unknownParts: { part: string; note: string }[] = [];
    for (const t of TARGETS) {
        const s = states[t.name];
        if (!s) continue;
        if (s.error) unknownParts.push({ part: t.label, note: s.error });
        if (s.diffSince === undefined || now - s.diffSince < STALE_AFTER_MS) continue;
        findings.push({
            key: `ota:stale:${t.name}`,
            part: t.label,
            level: t.level,
            title: `${t.label}이(가) ${Math.round((now - s.diffSince) / 60_000)}분째 jsDelivr에 안 닿음`,
            lines: [
                `리포 ${shown(t, s.repo)}, jsDelivr ${shown(t, s.cdn)}${s.purgedFor === s.repo ? ' (purge 했음)' : ''}`,
                `확인: https://cdn.jsdelivr.net/gh/Deepbluewarn/twitch-badge-collector-v2@master/${t.path}`,
                `purge: https://purge.jsdelivr.net/gh/Deepbluewarn/twitch-badge-collector-v2@master/${t.path}`,
            ],
        });
    }
    const all = TARGETS.filter((t) => states[t.name]);
    if (all.length && unknownParts.length === all.length) return { check: 'ota', at, status: 'unknown', note: unknownParts[0].note, findings };
    return { check: 'ota', at, status: findings.length ? 'issue' : 'ok', findings, ...(unknownParts.length ? { unknownParts } : {}) };
}
