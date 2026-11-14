/**
 * 실제 사용자 수집 비율 판정. 치지직만 쓴 사용자 중 그날 채팅이 한 번 이상 수집된 사람의 비율을
 * 브라우저마다 지난 며칠의 중앙값과 견준다. 카나리가 보는 방송 몇 개가 아니라 사용자 전체의 채널, 필터, 브라우저를 본다.
 *
 * 기록(usage-report.ts fetchCollect)은 다음 날 늦게까지 들어오므로 정오 전에는 그저께를 본다(collectTarget).
 * 입출력 없는 순수 함수만 둔다.
 */
import type { CheckReport, Finding } from './incidents.ts';

/** 사용자가 이보다 적은 칸은 판정하지 않는다 (트위치는 하루 수십 명이라 늘 빠진다) */
export const MIN_USERS = 500;
export const BASELINE_DAYS = 7;
/** 기준을 내려면 지난 날 중 이만큼은 표본이 있어야 한다 */
export const MIN_BASELINE_DAYS = 5;
/** 중앙값보다 이만큼(비율 차) 낮으면 */
export const RISK_DROP = 0.08;
export const BROKEN_DROP = 0.2;
/** 이 시각(한국) 전에는 어제 기록이 덜 와서 그저께를 본다 */
export const READY_HOUR = 12;

export interface CollectRow {
    date: string;
    browser: string;
    version: string;
    /** 치지직만 쓴 사용자 (표본 배율 반영) */
    users: number;
    /** 그중 수집된 사용자 */
    collected: number;
}

const BROWSER_LABEL: Record<string, string> = { chrome: 'Chrome', edge: 'Edge' };

function shiftDay(date: string, n: number): string {
    return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** 판정할 날짜. today와 hour는 한국 날짜, 시 */
export function collectTarget(today: string, hour: number): string {
    return shiftDay(today, hour >= READY_HOUR ? -1 : -2);
}

function median(xs: number[]): number {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** releasedAt: 버전 → 릴리스 날짜(한국). 알림에 그날 주로 쓰인 버전과 같이 적는다 */
export function judgeCollect(rows: CollectRow[], target: string, at: number, releasedAt: Record<string, string> = {}): CheckReport {
    const findings: Finding[] = [];
    const unknownParts: { part: string; note: string }[] = [];
    const browsers = [...new Set(rows.map((r) => r.browser))].filter((b) => b in BROWSER_LABEL).sort();
    let judged = 0;
    for (const b of browsers) {
        const label = BROWSER_LABEL[b];
        const day = (date: string) => {
            const rs = rows.filter((r) => r.browser === b && r.date === date);
            const users = rs.reduce((n, r) => n + r.users, 0);
            const collected = rs.reduce((n, r) => n + r.collected, 0);
            return { users, ratio: users ? collected / users : 0, rows: rs };
        };
        const now = day(target);
        if (now.users < MIN_USERS) {
            unknownParts.push({ part: label, note: `${target} 치지직 사용자 ${Math.round(now.users)}명 (${MIN_USERS}명 미만)` });
            continue;
        }
        const past = Array.from({ length: BASELINE_DAYS }, (_, i) => day(shiftDay(target, -1 - i))).filter((d) => d.users >= MIN_USERS);
        if (past.length < MIN_BASELINE_DAYS) {
            unknownParts.push({ part: label, note: `기준을 낼 지난 기록이 ${past.length}일뿐` });
            continue;
        }
        judged++;
        const base = median(past.map((d) => d.ratio));
        const drop = base - now.ratio;
        if (drop < RISK_DROP) continue;
        const main = [...now.rows].sort((x, y) => y.users - x.users)[0];
        const share = main.users / now.users;
        findings.push({
            key: `collect:${b}`,
            part: label,
            level: drop >= BROKEN_DROP ? 'broken' : 'risk',
            title: `${label} 치지직 사용자 수집 비율 ${pct(now.ratio)} (지난 ${BASELINE_DAYS}일 중앙값 ${pct(base)}, ${target})`,
            lines: [
                `치지직만 쓴 사용자 ${Math.round(now.users)}명 중 수집 ${Math.round(now.ratio * now.users)}명`,
                `그날 주로 쓰인 버전 v${main.version} (${pct(share)}${releasedAt[main.version] ? `, ${releasedAt[main.version]} 릴리스` : ''})`,
                '확인: 주 경로 시험, 선택자 카나리 결과와 현황판 사용 통계',
            ],
        });
    }
    if (!judged && !findings.length) return { check: 'collect', at, status: 'unknown', note: unknownParts.map((u) => `${u.part} ${u.note}`).join(', ') || '기록 없음', findings };
    return { check: 'collect', at, status: findings.length ? 'issue' : 'ok', findings, ...(unknownParts.length ? { unknownParts } : {}) };
}
