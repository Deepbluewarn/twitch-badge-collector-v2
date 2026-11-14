import { describe, expect, it } from 'vitest';
import { STALE_AFTER_MS, TARGETS, judgeOta, newlyReached, nextState, type FileState } from './ota-reach.ts';

const [SEL, OLD, BADGES] = TARGETS;
const T0 = 1_000_000;

describe('nextState', () => {
    it('같으면 diffSince 없음', () => {
        expect(nextState(undefined, SEL, { repo: '22', cdn: '22' }, T0)).toEqual({ repo: '22', cdn: '22', purgedFor: undefined });
    });

    it('jsDelivr가 뒤처지면 처음 본 시각을 이어 간다', () => {
        const a = nextState(undefined, SEL, { repo: '23', cdn: '22', purged: '23' }, T0);
        const b = nextState(a, SEL, { repo: '23', cdn: '22' }, T0 + 600_000);
        expect([a.diffSince, b.diffSince, b.purgedFor]).toEqual([T0, T0, '23']);
    });

    it('rev는 jsDelivr가 앞서면(ovm pull이 늦음) 뒤처진 게 아니다', () => {
        expect(nextState(undefined, SEL, { repo: '22', cdn: '23' }, T0).diffSince).toBeUndefined();
    });

    it('내용 해시는 다르기만 하면 뒤처진 것', () => {
        expect(nextState(undefined, BADGES, { repo: 'b', cdn: 'a' }, T0).diffSince).toBe(T0);
    });

    it('리포 버전이 바뀌면 purge 기록을 지운다 (새 버전으로 다시 purge)', () => {
        const prev: FileState = { repo: '23', cdn: '22', diffSince: T0, purgedFor: '23' };
        expect(nextState(prev, SEL, { repo: '24', cdn: '22' }, T0 + 1).purgedFor).toBeUndefined();
    });

    it('jsDelivr를 못 읽으면 지난 값과 시각을 둔다', () => {
        const prev: FileState = { repo: '23', cdn: '22', diffSince: T0 };
        expect(nextState(prev, SEL, { repo: '23', error: 'HTTP 503' }, T0 + 1)).toMatchObject({ cdn: '22', diffSince: T0, error: 'HTTP 503' });
    });
});

describe('newlyReached', () => {
    it('새 rev가 닿은 순간만', () => {
        const prev: FileState = { repo: '23', cdn: '22', diffSince: T0 };
        expect(newlyReached(prev, nextState(prev, SEL, { repo: '23', cdn: '23' }, T0 + 1), SEL)).toBe(true);
        expect(newlyReached({ repo: '23', cdn: '23' }, { repo: '23', cdn: '23' }, SEL)).toBe(false);
    });

    it('첫 실행은 아니다', () => {
        expect(newlyReached(undefined, { repo: '23', cdn: '23' }, SEL)).toBe(false);
    });
});

describe('judgeOta', () => {
    it('30분 안이면 정상', () => {
        const r = judgeOta({ selectors: { repo: '23', cdn: '22', diffSince: T0 } }, T0 + STALE_AFTER_MS - 1);
        expect(r.status).toBe('ok');
    });

    it('새 빌드 선택자가 30분 넘게 안 닿으면 위험, 나머지는 참고', () => {
        const states = {
            selectors: { repo: '23', cdn: '22', diffSince: T0, purgedFor: '23' },
            'selectors-old': { repo: '17', cdn: '16', diffSince: T0 },
            badges: { repo: 'bbbbbbbbbbbbbbbb', cdn: 'aaaaaaaaaaaaaaaa', diffSince: T0 },
        };
        const r = judgeOta(states, T0 + STALE_AFTER_MS);
        expect(r.findings.map((f) => [f.key, f.level])).toEqual([
            ['ota:stale:selectors', 'risk'],
            ['ota:stale:selectors-old', 'info'],
            ['ota:stale:badges', 'info'],
        ]);
        expect(r.findings[0].lines![0]).toBe('리포 rev 23, jsDelivr rev 22 (purge 했음)');
        expect(r.findings[2].lines![0]).toBe('리포 bbbbbbbbbbbb, jsDelivr aaaaaaaaaaaa');
    });

    it('일부만 못 읽으면 그 파일만 확인 못 함, 다 못 읽으면 확인 못 함', () => {
        const err = { repo: '22', error: 'HTTP 503' };
        expect(judgeOta({ selectors: err, badges: { repo: 'a', cdn: 'a' } }, T0).unknownParts).toEqual([{ part: SEL.label, note: 'HTTP 503' }]);
        expect(judgeOta({ selectors: err, 'selectors-old': { ...err } }, T0).status).toBe('unknown');
        expect(OLD.level).toBe('info');
    });
});
