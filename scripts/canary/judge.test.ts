import { describe, it, expect } from 'vitest';
import { judge as judgeWith, socketIsMain, type JudgeOptions } from './judge.ts';
import type { ChannelVisitResult, SelectorSample } from './snapshot-types.ts';

const BADGE = '[class*="_icon_"] > [class*="_container_"]:has(> img), [class*="_container_1nwpy_"]:has(> img)';
const [STRUCT, SPARE] = BADGE.split(', ');

const channel = (i: number, selectors: SelectorSample[], over: Partial<ChannelVisitResult> = {}): ChannelVisitResult => ({
    url: `https://chzzk.naver.com/live/ch${i}`,
    ok: true,
    anchorLayer: 'L1',
    selectors,
    sampleSkeleton: null,
    badgeUrls: [],
    chatItemCount: 30,
    badgeImages: { total: 5, missed: [] },
    ...over,
});
const sel = (name: string, count: number, over: Partial<SelectorSample> = {}): SelectorSample => ({ name, selector: name, count, required: true, ...over });
const groups = new Map([['https://x/badge/fan_01.png', 'donation']]);
const OPTS: JudgeOptions = { containers: ['chatRoomLive'], contentLevel: 'broken' };
const judge = (results: ChannelVisitResult[], required: string[], g: Map<string, string>, opts: Partial<JudgeOptions> = {}) => judgeWith(results, required, g, { ...OPTS, ...opts });

describe('judge', () => {
    it('11-12 경우: 구조 갈래는 맞고 예비 갈래는 모든 방송에서 0이면 위험과 후보를 낸다', () => {
        const badge = (n: number) => sel('badge', n, {
            selector: BADGE,
            branchCounts: [
                { selector: STRUCT, count: n },
                { selector: SPARE, count: 0, candidates: [{ selector: '[class*="_container_14814_"]:has(> img)', replaced: '_container_1nwpy_ → _container_14814_', docCount: n, score: 1 }] },
            ],
        });
        const r = judge([1, 2, 3, 4].map((i) => channel(i, [badge(4 + i)])), ['badge'], groups);
        expect(r.status).toBe('issue');
        expect(r.findings).toHaveLength(1);
        const f = r.findings[0];
        expect(f.key).toBe(`selector:badge:branch:${SPARE}`);
        expect(f.level).toBe('risk');
        expect(f.lines.some((l) => l.includes('_container_1nwpy_ → _container_14814_'))).toBe(true);
    });

    it('갈래가 한 방송에서라도 맞으면 살아 있다', () => {
        const badge = (spare: number) => sel('badge', 5, { selector: BADGE, branchCounts: [{ selector: STRUCT, count: 5 }, { selector: SPARE, count: spare }] });
        const r = judge([channel(1, [badge(0)]), channel(2, [badge(2)]), channel(3, [badge(0)])], ['badge'], groups);
        expect(r.status).toBe('ok');
    });

    it('채팅이 뜬 방송 전부에서 0이면 깨짐, key는 갈래와 상관없이 selector:<이름>', () => {
        const r = judge([1, 2, 3].map((i) => channel(i, [sel('displayName', 0)])), ['displayName'], groups);
        expect(r.findings.map((f) => [f.key, f.level])).toEqual([['selector:displayName', 'broken']]);
    });

    it('맞은 방송이 70% 미만이면 위험', () => {
        const list = [1, 2, 3, 4, 5].map((i) => channel(i, [sel('messageText', i <= 3 ? 4 : 0)]));
        expect(judge(list, ['messageText'], groups).findings.map((f) => f.key)).toEqual(['selector:messageText:channels']);
        const enough = [1, 2, 3, 4].map((i) => channel(i, [sel('messageText', i <= 3 ? 4 : 0)]));
        expect(judge(enough, ['messageText'], groups).status).toBe('ok');
    });

    it('배지는 닉네임 옆 그림이 있던 방송만 센다', () => {
        const list = [1, 2, 3, 4, 5].map((i) => channel(i, [sel('badge', i <= 3 ? 4 : 0)], i > 3 ? { badgeImages: { total: 0, missed: [] } } : {}));
        expect(judge(list, ['badge'], groups).status).toBe('ok');
    });

    it('배지 선택자가 못 잡은 그림이 두 방송 이상이면 묶음별로 위험', () => {
        const sub = 'https://x/glive/subscription/a.png';
        const list = [
            channel(1, [sel('badge', 3)], { badgeImages: { total: 5, missed: [sub, 'https://x/badge/fan_01.png'] } }),
            channel(2, [sel('badge', 3)], { badgeImages: { total: 4, missed: [sub] } }),
            channel(3, [sel('badge', 3)]),
        ];
        const f = judge(list, ['badge'], groups).findings;
        expect(f.map((x) => [x.key, x.level])).toEqual([['selector:badge:missed', 'risk']]);
        expect(f[0].title).toContain('3/14장');
        expect(f[0].lines.some((l) => l.startsWith('subscription: '))).toBe(true);
        expect(f[0].lines.some((l) => l.startsWith('donation: '))).toBe(true);
    });

    it('한 방송에서만 놓치면 넘어간다', () => {
        const list = [channel(1, [sel('badge', 3)], { badgeImages: { total: 5, missed: ['https://x/a.png'] } }), channel(2, [sel('badge', 3)]), channel(3, [sel('badge', 3)])];
        expect(judge(list, ['badge'], groups).status).toBe('ok');
    });

    it('채팅이 뜬 방송이 3곳 미만이면 판정하지 않는다', () => {
        const list = [channel(1, [sel('badge', 0)]), channel(2, [sel('badge', 0)], { chatItemCount: 0 }), channel(3, [], { ok: false })];
        const r = judge(list, ['badge'], groups);
        expect(r.status).toBe('unknown');
        expect(r.findings).toEqual([]);
        expect(r.note).toContain('1곳');
    });

    it('소켓이 주 경로면 내용 선택자 깨짐은 위험, 채팅 컨테이너는 그대로 깨짐', () => {
        const list = [1, 2, 3].map((i) => channel(i, [sel('chatRoomLive', 0), sel('displayName', 0)]));
        const r = judge(list, ['chatRoomLive', 'displayName'], groups, { contentLevel: 'risk' });
        expect(r.findings.map((f) => [f.key, f.level])).toEqual([['selector:chatRoomLive', 'broken'], ['selector:displayName', 'risk']]);
    });

    it('페이지는 열렸는데 채팅 컨테이너가 어디에도 없으면 확인 못 함이 아니라 깨짐', () => {
        const list = [1, 2, 3].map((i) => channel(i, [sel('chatRoomLive', 0)], { chatItemCount: 0 }));
        const r = judge(list, ['chatRoomLive'], groups);
        expect(r.status).toBe('issue');
        expect(r.findings.map((f) => [f.key, f.level])).toEqual([['selector:chatRoomLive', 'broken']]);
    });

    it('socketIsMain은 비상 스위치와 배포 비율을 따른다', () => {
        expect(socketIsMain({ socketRenderPercent: 100 })).toBe(true);
        expect(socketIsMain({})).toBe(true);
        expect(socketIsMain({ socketRenderPercent: 50 })).toBe(false);
        expect(socketIsMain({ socketRender: 0, socketRenderPercent: 100 })).toBe(false);
    });
});
