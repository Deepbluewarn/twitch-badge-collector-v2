import { describe, it, expect } from 'vitest';
import { diffSnapshots } from './diff.ts';
import type { CanarySnapshot, SelectorSample } from './snapshot-types.ts';

const snap = (selectors: SelectorSample[], over: Partial<CanarySnapshot> = {}): CanarySnapshot => ({
    pageMode: 'live',
    capturedAt: '2026-09-11T00:00:00.000Z',
    url: 'https://chzzk.naver.com/live/abc',
    selectors,
    anchorLayer: 'L1',
    manifestRev: 14,
    ...over,
});

describe('diffSnapshots — auto-fix 후보', () => {
    const baseline = snap([{ name: 'displayName', required: true, present: true }]);

    it('라이브 검증을 통과한 후보를 auto-fix로 채택한다', () => {
        // rev 13 사고 재현: `_container_`는 페이지에 여러 hash로 존재해 옛 로직은
        // "애매함"으로 포기했다. 검증 점수가 있으면 정답 하나를 고를 수 있다.
        const current = snap([{
            name: 'displayName',
            required: true,
            count: 0,
            selector: '[class*="_container_zw6kq_"] [class*="_text_"]',
            candidates: [
                { selector: '[class*="_container_1mc5x_"] [class*="_text_"]', replaced: '_container_zw6kq_ → _container_1mc5x_', docCount: 25, score: 1 },
            ],
        }]);

        const d = diffSnapshots(baseline, current);
        expect(d.brokenRequired.map(s => s.name)).toEqual(['displayName']);
        expect(d.autoFixCandidates).toHaveLength(1);
        expect(d.autoFixCandidates[0].newSelector).toBe('[class*="_container_1mc5x_"] [class*="_text_"]');
    });

    it('최고점 동점 후보가 여러 개면 자동 치환하지 않는다', () => {
        const current = snap([{
            name: 'displayName',
            required: true,
            count: 0,
            selector: '[class*="_container_zw6kq_"] [class*="_text_"]',
            candidates: [
                { selector: 'A', replaced: 'x → a', docCount: 20, score: 1 },
                { selector: 'B', replaced: 'x → b', docCount: 20, score: 1 },
            ],
        }]);

        const d = diffSnapshots(baseline, current);
        expect(d.autoFixCandidates).toHaveLength(0);
        expect(d.brokenRequired.map(s => s.name)).toEqual(['displayName']);
    });

    it('후보가 아예 없으면 깨짐만 남긴다', () => {
        const current = snap([{
            name: 'displayName',
            required: true,
            count: 0,
            selector: 'button[aria-haspopup="true"] [class*="_text_"]',
            candidates: [],
        }]);

        const d = diffSnapshots(baseline, current);
        expect(d.autoFixCandidates).toHaveLength(0);
        expect(d.brokenRequired.map(s => s.name)).toEqual(['displayName']);
    });
});
