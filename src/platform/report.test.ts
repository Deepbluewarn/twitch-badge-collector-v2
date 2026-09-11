// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { sanitizeReport } from './report';
import type { DiagnoseReport, DiagnoseSample } from './diagnose';

const sample = (over: Partial<DiagnoseSample> = {}): DiagnoseSample => ({
    source: 'inject-wrapper',
    outerHTML: '<div class="_item_x"><span class="_text_y">비밀번호 공유합니다 hunter2</span></div>',
    extract: 'pass',
    extractedNickname: '실명닉네임',
    extractedText: '비밀번호 공유합니다 hunter2',
    extractError: null,
    unavailable: null,
    ...over,
});

const report = (over: Partial<DiagnoseReport> = {}): DiagnoseReport => ({
    timestamp: '', url: 'https://chzzk.naver.com/live/abc', platform: 'chzzk', pageMode: 'live',
    manifest: { rev: 14, schemaVersion: 1, source: 'ota', fetchedAt: null },
    selectorResults: [],
    injectWrapper: { exists: true, chatCountInside: 10, chatsWithKeyAttr: 9 },
    sample: sample(),
    samples: [sample(), sample({ extractedNickname: '두번째닉', extractedText: '두번째 발화' })],
    health: { verdict: 'ok', broken: [], degraded: [], chatCount: 10 },
    filters: { totalGroupCount: 1, currentPlatformGroupCount: 1, firstGroupSummary: 'badge=x' },
    userAgent: 'UA',
    ...over,
});

describe('sanitizeReport', () => {
    it('sample의 닉네임·발화를 지운다', () => {
        const s = sanitizeReport(report());
        expect(s.sample.extractedNickname).toBeNull();
        expect(s.sample.extractedText).toBeNull();
    });

    it('samples 배열도 전부 지운다', () => {
        // 이 배열은 나중에 추가됐다. sample만 sanitize하던 시절엔 여기로 그대로 샜다.
        const s = sanitizeReport(report());
        expect(s.samples).toHaveLength(2);
        for (const x of s.samples) {
            expect(x.extractedNickname).toBeNull();
            expect(x.extractedText).toBeNull();
        }
    });

    it('outerHTML의 텍스트 노드를 모두 비운다 (구조는 보존)', () => {
        const s = sanitizeReport(report());
        const all = [s.sample, ...s.samples];
        for (const x of all) {
            expect(x.outerHTML).not.toContain('hunter2');
            expect(x.outerHTML).not.toContain('비밀번호');
            // selector 분석에 필요한 class는 남아야 한다
            expect(x.outerHTML).toContain('_text_y');
        }
    });

    it('직렬화된 리포트 어디에도 원문이 남지 않는다', () => {
        // 실제로 Discord에 가는 건 JSON.stringify 결과다. 필드 단위로 확인하면
        // 새 필드가 추가됐을 때 놓친다 — 전체 문자열로 검사한다.
        const json = JSON.stringify(sanitizeReport(report()));
        expect(json).not.toContain('hunter2');
        expect(json).not.toContain('실명닉네임');
        expect(json).not.toContain('두번째닉');
        expect(json).not.toContain('두번째 발화');
    });

    it('samples가 없는 옛 리포트에서도 죽지 않는다', () => {
        const r = report();
        delete (r as { samples?: unknown }).samples;
        expect(() => sanitizeReport(r)).not.toThrow();
    });
});
