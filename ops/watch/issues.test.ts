import { describe, expect, it } from 'vitest';
import type { Incident } from './incidents.ts';
import { isIssueWorthy, issueBody, judgeIssues, planIssues, selectorFix } from './issues.ts';

const inc = (key: string, over: Partial<Incident> = {}): Incident => ({ key, check: 'selector', level: 'broken', title: '제목', lines: ['줄'], firstSeen: 0, lastSeen: 0, lastNotified: 0, ...over });
const ref = (n: number) => ({ number: n, url: `https://github.com/x/y/issues/${n}` });

describe('isIssueWorthy', () => {
    it('깨짐은 전부, 위험은 선택자 카나리만, 확인 못 함은 아니다', () => {
        expect(isIssueWorthy(inc('main:no-pane', { check: 'main' }))).toBe(true);
        expect(isIssueWorthy(inc('selector:badge:missed', { level: 'risk' }))).toBe(true);
        expect(isIssueWorthy(inc('vod:displayName', { check: 'vod', level: 'risk' }))).toBe(true);
        expect(isIssueWorthy(inc('main:socket-path', { check: 'main', level: 'risk' }))).toBe(false);
        expect(isIssueWorthy(inc('blind:selector', { level: 'risk' }))).toBe(false);
        expect(isIssueWorthy(inc('deploy:1', { check: 'deploy', level: 'info' }))).toBe(false);
    });
});

describe('planIssues', () => {
    it('새 사건은 열고, 표시로 찾은 이슈는 잇고, 사라진 사건은 닫는다', () => {
        const open = { a: inc('a'), b: inc('b'), c: inc('c'), info: inc('info', { level: 'info' }) };
        const plan = planIssues(open, { c: ref(3), gone: ref(9) }, new Map([['b', ref(2)]]));
        expect(plan.create.map((i) => i.key)).toEqual(['a']);
        expect(plan.adopt).toEqual([['b', ref(2)]]);
        expect(plan.close).toEqual([['gone', ref(9)]]);
    });

    it('토큰을 나중에 넣으면 열려 있던 대상 사건이 한꺼번에 열린다', () => {
        expect(planIssues({ a: inc('a'), b: inc('b') }, {}, new Map()).create).toHaveLength(2);
    });
});

const probe = (selector: string, replaced = 'x → y') => ({ selector, replaced, score: 0.98, docCount: 40 });

describe('selectorFix', () => {
    it('선택자 깨짐은 후보 전체 문자열', () => {
        const f = selectorFix(inc('selector:displayName', { evidence: { selector: '[class*="_a_1_"]', candidates: [probe('[class*="_a_2_"]')] } }));
        expect([f?.name, f?.candidates[0].selector]).toEqual(['displayName', '[class*="_a_2_"]']);
    });

    it('갈래 후보는 전체 선택자에서 그 갈래만 바꿔 끼운다', () => {
        const f = selectorFix(inc('vod:badge:branch:B1', { check: 'vod', level: 'risk', evidence: { selector: 'A, B1', branch: 'B1', candidates: [probe('B2')] } }));
        expect(f?.candidates[0].selector).toBe('A, B2');
    });

    it('후보가 없거나 선택자 사건이 아니면 없음', () => {
        expect(selectorFix(inc('selector:badge:missed', { level: 'risk' }))).toBeNull();
        expect(selectorFix(inc('main:no-pane', { check: 'main' }))).toBeNull();
    });
});

describe('issueBody', () => {
    it('후보가 있으면 rev+1과 바꿀 줄, 끝에 표시', () => {
        const { title, body, labels } = issueBody(inc('selector:displayName', { title: '선택자 displayName 깨짐', evidence: { selector: 'old', candidates: [probe('new')] } }), 22);
        expect(title).toBe('[깨짐] 선택자 displayName 깨짐');
        expect(body).toContain('"rev": 23,\n"displayName": "new"');
        expect(body.endsWith('<!-- ops-alert key: selector:displayName -->')).toBe(true);
        expect(labels).toEqual(['ops-alert', 'ops:selector']);
    });

    it('후보가 없으면 고칠 내용 절이 없다', () => {
        expect(issueBody(inc('main:no-pane', { check: 'main' }), 22).body).not.toContain('## 고칠 내용');
    });
});

describe('judgeIssues', () => {
    const NOW = Date.UTC(2027, 1, 1);
    const DAY = 86_400_000;

    it('토큰이 없으면 정상(건너뜀)', () => {
        expect(judgeIssues({ skipped: true, errors: [] }, NOW).status).toBe('ok');
    });

    it('만료 7일 전부터 위험', () => {
        expect(judgeIssues({ errors: [], expiresAt: NOW + 8 * DAY }, NOW).status).toBe('ok');
        const r = judgeIssues({ errors: [], expiresAt: NOW + 3 * DAY }, NOW);
        expect(r.findings.map((f) => [f.key, f.level, f.title])).toEqual([['issues:token-expiring', 'risk', '이슈 토큰이 3일 뒤 만료 (2027-02-04)']]);
    });

    it('거절(401)이면 위험, 만료 임박 사건 대신', () => {
        const r = judgeIssues({ errors: [{ status: 401, message: 'GitHub GET /issues: 401 Bad credentials' }], expiresAt: NOW - DAY }, NOW);
        expect(r.findings.map((f) => [f.key, f.level])).toEqual([['issues:token', 'risk']]);
    });

    it('권한이 모자라면(403) 위험', () => {
        expect(judgeIssues({ errors: [{ status: 403, message: 'x' }] }, NOW).findings.map((f) => f.key)).toEqual(['issues:permission']);
    });

    it('네트워크, GitHub 장애는 확인 못 함', () => {
        const r = judgeIssues({ errors: [{ status: 502, message: 'GitHub GET /issues: 502' }] }, NOW);
        expect([r.status, r.findings.length]).toEqual(['error', 0]);
    });
});
