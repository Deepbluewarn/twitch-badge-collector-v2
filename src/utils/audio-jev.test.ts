import { describe, it, expect } from 'vitest';
import { PARAM_RANGE, type AudioParams } from './audio-compressor';
import { JEV_QUESTIONS, clampParams, paramsFromAnswers } from './audio-jev';

const answers = (choice: string, score: number) => ({ problem: { type: 'choice', choice }, strength: { type: 'score', score } });

describe('paramsFromAnswers', () => {
    it('세기가 셀수록 더 누른다', () => {
        const light = paramsFromAnswers(answers('peaks', 0))!;
        const strong = paramsFromAnswers(answers('peaks', 4))!;
        expect(strong.threshold).toBeLessThan(light.threshold);
        expect(strong.ratio).toBeGreaterThan(light.ratio);
    });

    it('세기 중간값은 양 끝 사이', () => {
        const mid = paramsFromAnswers(answers('voice', 2))!;
        expect(mid.threshold).toBeLessThan(paramsFromAnswers(answers('voice', 0))!.threshold);
        expect(mid.threshold).toBeGreaterThan(paramsFromAnswers(answers('voice', 4))!.threshold);
    });

    it('none을 빼고 모든 보기에 값이 있고, 슬라이더 범위와 눈금 안에 있다', () => {
        const choices = Object.keys(JEV_QUESTIONS.problem.criteria).filter(c => c !== 'none');
        for (const c of choices) for (const score of [0, 1.3, 2.7, 4]) {
            const p = paramsFromAnswers(answers(c, score));
            expect(p, c).not.toBeNull();
            for (const k of Object.keys(PARAM_RANGE) as (keyof AudioParams)[]) {
                const r = PARAM_RANGE[k];
                expect(p![k]).toBeGreaterThanOrEqual(r.min);
                expect(p![k]).toBeLessThanOrEqual(r.max);
                expect(Math.abs(p![k] / r.step - Math.round(p![k] / r.step))).toBeLessThan(1e-9);
            }
        }
    });

    it('소리 문제가 아니거나 답이 이상하면 null', () => {
        expect(paramsFromAnswers(answers('none', 2))).toBeNull();
        expect(paramsFromAnswers(answers('???', 2))).toBeNull();
        expect(paramsFromAnswers({ problem: { choice: 'peaks' } })).toBeNull();
        expect(paramsFromAnswers(null)).toBeNull();
    });

    it('범위 밖 세기는 끝에 붙인다', () => {
        expect(paramsFromAnswers(answers('quiet', 9))).toEqual(paramsFromAnswers(answers('quiet', 4)));
    });
});

describe('clampParams', () => {
    it('범위 밖은 자르고 빠진 값은 기본값', () => {
        const p = clampParams({ threshold: -99, ratio: 1.3 });
        expect(p.threshold).toBe(-60);
        expect(p.ratio).toBe(1.5);
        expect(p.release).toBe(250);
    });
});
