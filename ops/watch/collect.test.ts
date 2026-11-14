import { describe, expect, it } from 'vitest';
import { collectTarget, judgeCollect, type CollectRow } from './collect.ts';

const days = ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
const row = (date: string, ratio: number, over: Partial<CollectRow> = {}): CollectRow => ({ date, browser: 'chrome', version: '2.29.0', users: 7000, collected: 7000 * ratio, ...over });
const steady = (last: number) => days.map((d, i) => row(d, i === days.length - 1 ? last : 0.82 + (i % 3) * 0.01));
const T = '2026-11-13';

describe('collectTarget', () => {
    it('정오 전에는 그저께, 정오부터 어제', () => {
        expect(collectTarget('2026-11-14', 11)).toBe('2026-11-12');
        expect(collectTarget('2026-11-14', 12)).toBe('2026-11-13');
    });
});

describe('judgeCollect', () => {
    it('평소 범위면 정상', () => {
        expect(judgeCollect(steady(0.79), T, 1).status).toBe('ok');
    });

    it('중앙값보다 8%p 넘게 낮으면 위험, 20%p 넘게 낮으면 깨짐', () => {
        const risk = judgeCollect(steady(0.72), T, 1);
        expect(risk.findings.map((f) => [f.key, f.level])).toEqual([['collect:chrome', 'risk']]);
        expect(judgeCollect(steady(0.6), T, 1).findings[0].level).toBe('broken');
    });

    it('알림에 그날 주로 쓰인 버전과 릴리스 날짜', () => {
        const rows = [...steady(0.6).slice(0, -1), row(T, 0.6, { version: '2.30.0', users: 6000, collected: 3600 }), row(T, 0.6, { version: '2.29.0', users: 1000, collected: 600 })];
        const f = judgeCollect(rows, T, 1, { '2.30.0': '2026-11-12' }).findings[0];
        expect(f.lines![1]).toBe('그날 주로 쓰인 버전 v2.30.0 (85.7%, 2026-11-12 릴리스)');
    });

    it('브라우저마다 따로. 사용자가 적은 브라우저는 그 부분만 확인 못 함', () => {
        const rows = [...steady(0.8), ...days.map((d) => row(d, 0.5, { browser: 'edge', users: 100, collected: 50 }))];
        const r = judgeCollect(rows, T, 1);
        expect([r.status, r.unknownParts?.map((u) => u.part)]).toEqual(['ok', ['Edge']]);
    });

    it('지난 기록이 5일 미만이면 기준을 내지 않는다', () => {
        const r = judgeCollect(steady(0.3).slice(-4), T, 1);
        expect([r.status, r.findings.length]).toEqual(['unknown', 0]);
    });

    it('기록이 없으면 확인 못 함', () => {
        expect(judgeCollect([], T, 1).status).toBe('unknown');
    });
});
