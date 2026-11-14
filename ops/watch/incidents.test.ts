import { describe, expect, it } from 'vitest';
import { formatAlerts, reconcile, stableKey, type CheckReport, type Finding, type Ledger } from './incidents.ts';

const H = 3_600_000;
const T0 = 1_800_000_000_000;

const report = (check: string, at: number, findings: Finding[] = [], extra: Partial<CheckReport> = {}): CheckReport => ({
    check, at, status: findings.length ? 'issue' : 'ok', findings, ...extra,
});
const badge: Finding = { key: 'selector:badge', level: 'broken', title: '선택자 badge 깨짐' };
const name: Finding = { key: 'selector:displayName', level: 'broken', title: '선택자 displayName 깨짐' };

/** 빈 장부에서 시작한다 (처음 켤 때의 조용한 기록을 건너뛰려고) */
const empty: Ledger = { startedAt: T0, open: {}, blind: {}, recent: {} };

describe('reconcile', () => {
    it('처음 켤 때는 알리지 않고 장부에만 적는다', () => {
        const { ledger, alerts } = reconcile(undefined, [report('selector', T0, [badge])], T0);
        expect(alerts).toEqual([]);
        expect(Object.keys(ledger.open)).toEqual(['selector:badge']);
    });

    it('새 사건은 알리고, 같은 사건이 다시 오면 숫자만 고치고 알리지 않는다', () => {
        const a = reconcile(empty, [report('live', T0, [{ key: 'live:a:empty', level: 'broken', title: '비었음', lines: ['방송 25줄'] }])], T0);
        expect(a.alerts.map((x) => x.state)).toEqual(['open']);
        const b = reconcile(a.ledger, [report('live', T0 + H, [{ key: 'live:a:empty', level: 'broken', title: '비었음', lines: ['방송 40줄'] }])], T0 + H);
        expect(b.alerts).toEqual([]);
        expect(b.ledger.open['live:a:empty'].lines).toEqual(['방송 40줄']);
        expect(b.ledger.open['live:a:empty'].firstSeen).toBe(T0);
    });

    it('깨진 상태에서 다른 선택자가 또 깨지면 그것만 알린다', () => {
        const a = reconcile(empty, [report('selector', T0, [badge])], T0);
        const b = reconcile(a.ledger, [report('selector', T0 + H, [badge, name])], T0 + H);
        expect(b.alerts.map((x) => [x.state, x.key])).toEqual([['open', 'selector:displayName']]);
    });

    it('깨짐은 6시간, 위험은 24시간마다 다시 알리고 참고는 다시 알리지 않는다', () => {
        const fs: Finding[] = [badge, { key: 'r', level: 'risk', title: '위험' }, { key: 'i', level: 'info', title: '참고' }];
        let { ledger } = reconcile(empty, [report('selector', T0, fs)], T0);
        const at = (h: number) => reconcile(ledger, [report('selector', T0 + h * H, fs)], T0 + h * H);
        expect(at(5).alerts).toEqual([]);
        expect(at(6).alerts.map((x) => [x.state, x.key])).toEqual([['recur', 'selector:badge']]);
        ledger = at(6).ledger;
        expect(reconcile(ledger, [report('selector', T0 + 24 * H, fs)], T0 + 24 * H).alerts.map((x) => x.key)).toEqual(['selector:badge', 'r']);
    });

    it('등급이 오르거나 내려가면 알린다', () => {
        const a = reconcile(empty, [report('selector', T0, [{ ...badge, level: 'risk' }])], T0);
        const b = reconcile(a.ledger, [report('selector', T0 + H, [badge])], T0 + H);
        expect(b.alerts.map((x) => [x.state, x.prevLevel, x.level])).toEqual([['up', 'risk', 'broken']]);
        const c = reconcile(b.ledger, [report('selector', T0 + 2 * H, [{ ...badge, level: 'risk' }])], T0 + 2 * H);
        expect(c.alerts.map((x) => x.state)).toEqual(['down']);
    });

    it('사라지면 회복을 알린다. 참고는 조용히 닫는다', () => {
        const a = reconcile(empty, [report('selector', T0, [badge, { key: 'i', level: 'info', title: '참고' }])], T0);
        const b = reconcile(a.ledger, [report('selector', T0 + H)], T0 + H);
        expect(b.alerts.map((x) => [x.state, x.key])).toEqual([['resolved', 'selector:badge']]);
        expect(b.ledger.open).toEqual({});
    });

    it('확인을 못 한 보고는 사건을 닫지 않는다', () => {
        const a = reconcile(empty, [report('live', T0, [{ key: 'live:a:empty', level: 'broken', title: '비었음' }])], T0);
        const b = reconcile(a.ledger, [report('live', T0 + H, [], { status: 'unknown', note: '방송 채팅 없음' })], T0 + H);
        expect(b.alerts).toEqual([]);
        expect(Object.keys(b.ledger.open)).toEqual(['live:a:empty']);
    });

    it('갈래 하나만 확인 못 했으면 그 갈래의 사건만 남긴다', () => {
        const fs: Finding[] = [
            { key: 'live:a:empty', level: 'broken', title: 'a', part: 'a' },
            { key: 'live:b:empty', level: 'broken', title: 'b', part: 'b' },
        ];
        const a = reconcile(empty, [report('live', T0, fs)], T0);
        const b = reconcile(a.ledger, [report('live', T0 + H, [], { unknownParts: [{ part: 'a', note: '채팅 없음' }] })], T0 + H);
        expect(b.alerts.map((x) => [x.state, x.key])).toEqual([['resolved', 'live:b:empty']]);
        expect(Object.keys(b.ledger.open)).toEqual(['live:a:empty']);
    });

    it('연달아 확인 못 하면 위험을 열고, 확인되면 회복한다. 같은 보고서는 한 번만 센다', () => {
        let ledger = empty;
        const blindAt = (h: number) => report('live', T0 + h * H, [], { status: 'error', note: 'zip 504' });
        for (const h of [0, 6]) ledger = reconcile(ledger, [blindAt(h)], T0 + h * H).ledger;
        // 같은 보고서로 상황실이 다시 돌아도 세지 않는다
        const again = reconcile(ledger, [blindAt(6)], T0 + 7 * H);
        expect(again.alerts).toEqual([]);
        expect(again.ledger.blind.live.count).toBe(2);
        const third = reconcile(again.ledger, [blindAt(12)], T0 + 12 * H);
        expect(third.alerts.map((x) => [x.state, x.key, x.level])).toEqual([['open', 'blind:live', 'risk']]);
        const ok = reconcile(third.ledger, [report('live', T0 + 18 * H)], T0 + 18 * H);
        expect(ok.alerts.map((x) => [x.state, x.key])).toEqual([['resolved', 'blind:live']]);
        expect(ok.ledger.blind).toEqual({});
    });

    it('깜빡이는 참고는 7일 안에 다시 보여도 알리지 않는다', () => {
        const rare: Finding = { key: 'socket:warn:x', level: 'info', title: '처음 보는 값' };
        const a = reconcile(empty, [report('socket', T0, [rare])], T0);
        const b = reconcile(a.ledger, [report('socket', T0 + H)], T0 + H);
        const c = reconcile(b.ledger, [report('socket', T0 + 2 * H, [rare])], T0 + 2 * H);
        expect([a.alerts.length, b.alerts.length, c.alerts.length]).toEqual([1, 0, 0]);
        const d = reconcile(c.ledger, [report('socket', T0 + 3 * H)], T0 + 3 * H);
        const e = reconcile(d.ledger, [report('socket', T0 + 8 * 24 * H, [rare])], T0 + 8 * 24 * H);
        expect(e.alerts.length).toBe(1);
    });
});

describe('formatAlerts', () => {
    it('깨짐은 긴급으로 멘션, 회복과 참고는 참고로 보낸다', () => {
        const a = reconcile(empty, [report('selector', T0, [badge, { key: 'i', level: 'info', title: '배포 감지' }])], T0);
        const out = formatAlerts(a.alerts, T0, 'URL');
        expect(out.mention).toBe(true);
        expect(out.urgent[0]).toBe('**깨짐: 선택자 badge 깨짐**');
        expect(out.normal[0]).toBe('**배포 감지**');
        const r = reconcile(a.ledger, [report('selector', T0 + 3 * H)], T0 + 3 * H);
        expect(formatAlerts(r.alerts, T0 + 3 * H, 'URL')).toEqual({ urgent: [], normal: ['**회복: 선택자 badge 깨짐** (3시간 만)', '', 'URL'], mention: false });
    });
});

describe('stableKey', () => {
    it('비율, 건수, 표본을 지우고 정체는 남긴다', () => {
        expect(stableKey('profile.nickname 없음 12.5% — 닉네임 필터가 깨집니다')).toBe('profile.nickname 없음 %');
        expect(stableKey('접속 완료를 받은 채널이 절반 미만 — 3/8')).toBe('접속 완료를 받은 채널이 절반 미만');
        expect(stableKey('채팅 120건 중 배지가 계산된 채팅이 0건 — x')).toBe('채팅 n건 중 배지가 계산된 채팅이 n건');
        expect(stableKey('처음 보는 msgTypeCode: 31, 32 — 새 메시지 종류')).toBe('처음 보는 msgTypeCode: 31, 32');
    });
});
