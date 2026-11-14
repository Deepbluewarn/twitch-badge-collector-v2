import { describe, expect, it } from 'vitest';
import { comparedCount, judgeContent, judgeMain, mergeStoreReport, type ContentSample, type MainRun, type PaneItem, type ShadowMismatch, type TapChat } from './main-path.ts';

const SOCKET = 'wss://kr-ss3.chat.naver.com/chat';
const healthy: MainRun = {
    at: 1,
    url: 'https://chzzk.naver.com/live/abc',
    sockets: [{ url: SOCKET, chats: 40 }],
    domChats: 35,
    tapInstalled: true,
    tapDelivered: 40,
    paneExists: true,
    pane: 30,
    paneWithBadge: 10,
    paneWithName: 30,
    container: 1,
};
const keys = (r: MainRun) => judgeMain(r).findings.map((f) => [f.key, f.level]);

describe('judgeMain', () => {
    it('창이 있고 채팅이 들어오고 소켓 경로가 살아 있으면 정상', () => {
        expect(judgeMain(healthy).status).toBe('ok');
    });

    it('창이 아예 없으면 깨짐, 채팅 컨테이너 선택자가 안 맞는지 적는다', () => {
        const r = judgeMain({ ...healthy, paneExists: false, pane: 0, container: 0 });
        expect(r.findings.map((f) => [f.key, f.level])).toEqual([['main:no-pane', 'broken']]);
        expect(r.findings[0].lines!.some((l) => l.includes('chatRoomLive'))).toBe(true);
    });

    it('창은 있는데 비면 깨짐', () => {
        expect(keys({ ...healthy, pane: 0 })).toEqual([['main:empty-pane', 'broken']]);
    });

    it('소켓 주소가 바뀌면 탭이 못 붙는다: 채팅은 화면에 있고 창도 차 있어도 위험', () => {
        const r = judgeMain({ ...healthy, tapDelivered: 0, sockets: [{ url: 'wss://kr-ss3.chat.naver.com/v2/chat', chats: 40 }] });
        expect(r.findings.map((f) => [f.key, f.level])).toEqual([['main:socket-path', 'risk']]);
        expect(r.findings[0].title).toContain('HTML 대체');
    });

    it('소켓이 페이지에서 사라지면(다른 곳으로 옮김) 화면 채팅으로 세고 위험', () => {
        expect(keys({ ...healthy, tapDelivered: 0, sockets: [] })).toEqual([['main:socket-path', 'risk']]);
    });

    it('파서가 못 읽으면 위험', () => {
        expect(keys({ ...healthy, tapDelivered: 0, sockets: [{ url: SOCKET, chats: 0 }] })).toEqual([['main:socket-path', 'risk']]);
    });

    it('탭이 설치되지 않으면 위험', () => {
        expect(keys({ ...healthy, tapDelivered: 0, tapInstalled: false })).toEqual([['main:socket-path', 'risk']]);
    });

    it('창도 비고 소켓 경로도 죽으면 둘 다', () => {
        expect(keys({ ...healthy, pane: 0, tapDelivered: 0, sockets: [] })).toEqual([['main:empty-pane', 'broken'], ['main:socket-path', 'risk']]);
    });

    it('소켓과 파서는 정상인데 탭이 안 넘기면(확장 쪽 고장) 위험, 원인 단서를 적는다', () => {
        const r = judgeMain({ ...healthy, tapDelivered: 0 });
        expect(r.findings.map((f) => f.key)).toEqual(['main:socket-path']);
        expect(r.findings[0].lines!.some((l) => l.includes('chzzk-socket-url.ts'))).toBe(true);
    });

    it('탭이 채팅을 넘겼으면 소켓 주소가 낯설어도 정상', () => {
        expect(judgeMain({ ...healthy, sockets: [{ url: 'wss://new.chat.naver.com/chat2', chats: 40 }] }).status).toBe('ok');
    });

    it('방송 채팅이 없거나 실행이 실패하면 확인 못 함', () => {
        expect(judgeMain({ ...healthy, sockets: [{ url: SOCKET, chats: 0 }], domChats: 0 }).status).toBe('unknown');
        const r = judgeMain({ at: 1, error: '확장 zip 404' });
        expect([r.status, r.note]).toEqual(['unknown', '확장 zip 404']);
    });
});

const SUB = 'https://nng-phinf.pstatic.net/glive/subscription/badge/ch/1/3.png';
const FAN = 'https://ssl.pstatic.net/static/nng/glive/badge/fan_01.png';
const groups = new Map([[FAN, 'donation']]);
const tapChat = (i: number, over: Partial<TapChat> = {}): TapChat => ({ id: `u${i}_${1000 + i}`, type: 1, status: 'NORMAL', nickname: `닉${i}`, anonymous: false, message: `안녕 ${i}`, badges: [SUB], ...over });
const item = (c: TapChat, over: Partial<PaneItem> = {}): PaneItem => ({ key: c.id, text: `12:00${c.nickname}${c.message}`, nameImgs: c.badges.length, ...over });
const sample = (n: number, over: Partial<ContentSample> = {}): ContentSample => {
    const chats = Array.from({ length: n }, (_, i) => tapChat(i));
    return { chats, items: chats.map((c) => item(c)), mismatches: [], shadowSummary: { matched: n, mismatched: 0, socketOnly: 0, htmlOnly: 0 }, ...over };
};
const badgeMismatch = (c: TapChat, onlyInHtml: string[], onlyInSocket: string[] = []): ShadowMismatch => ({ field: 'badges', type: c.type, status: 'NORMAL', id: c.id, html: { onlyInHtml }, socket: { onlyInSocket } });
const contentKeys = (c: ContentSample) => judgeContent(c, groups).map((f) => [f.key, f.level]);

describe('judgeContent', () => {
    it('화면 쪽에만 있는 주소 변형(?type=f40_40)은 같은 배지로 본다', () => {
        const c = sample(40);
        c.mismatches = c.chats.slice(0, 30).map((x) => badgeMismatch(x, [`${SUB}?type=f40_40`]));
        c.shadowSummary = { matched: 10, mismatched: 30, socketOnly: 0, htmlOnly: 0 };
        expect(contentKeys(c)).toEqual([]);
    });

    it('소켓이 구독 배지를 빠뜨리면 위험 (묶음별 key)', () => {
        const c = sample(40);
        for (const x of c.chats) x.badges = [];
        c.items = c.chats.map((x) => item(x));
        c.mismatches = c.chats.slice(0, 20).map((x) => badgeMismatch(x, [SUB, `${SUB}?type=f40_40`]));
        c.shadowSummary = { matched: 20, mismatched: 20, socketOnly: 0, htmlOnly: 0 };
        const f = judgeContent(c, groups);
        expect(f.map((x) => [x.key, x.level])).toEqual([['main:compare:missing:subscription', 'risk']]);
        expect(f[0].title).toContain('40건 중 20건');
    });

    it('소켓에만 있는 배지는 대체 경로 문제라 참고', () => {
        const c = sample(40);
        c.mismatches = c.chats.slice(0, 10).map((x) => badgeMismatch(x, [], [FAN]));
        c.shadowSummary = { matched: 30, mismatched: 10, socketOnly: 0, htmlOnly: 0 };
        expect(contentKeys(c)).toEqual([['main:compare:extra:donation', 'info']]);
    });

    it('자세한 불일치가 상한(50건)에 걸리면 그 시간 동안의 채팅으로 비율을 낸다', () => {
        // 1000건 중 300건이 어긋났는데 자세히는 50건만 남은 경우. 전체로 나누면 5%라 놓친다
        const c = sample(1000);
        const broken = c.chats.filter((_, i) => i % 3 === 0).slice(0, 50);
        c.mismatches = broken.map((x) => badgeMismatch({ ...x, badges: [] }, [SUB]));
        for (const x of broken) x.badges = [];
        c.shadowSummary = { matched: 700, mismatched: 300, socketOnly: 0, htmlOnly: 0 };
        expect(comparedCount(c)).toBe(148);
        expect(contentKeys(c)).toEqual([['main:compare:missing:subscription', 'risk']]);
    });

    it('한두 건이나 10% 미만은 넘어간다', () => {
        const c = sample(40);
        for (const x of c.chats.slice(0, 2)) x.badges = [];
        c.mismatches = c.chats.slice(0, 2).map((x) => badgeMismatch(x, [SUB]));
        c.shadowSummary = { matched: 38, mismatched: 2, socketOnly: 0, htmlOnly: 0 };
        expect(contentKeys(c)).toEqual([]);
    });

    it('비교한 채팅이 10건 미만이면 비교 판정을 하지 않는다', () => {
        const c = sample(5);
        for (const x of c.chats) x.badges = [];
        c.mismatches = c.chats.map((x) => badgeMismatch(x, [SUB]));
        c.shadowSummary = { matched: 0, mismatched: 5, socketOnly: 0, htmlOnly: 0 };
        expect(contentKeys(c)).toEqual([]);
    });

    it('소켓이 놓친 채팅(원래 채팅에만)이 많으면 위험', () => {
        const c = sample(40, { shadowSummary: { matched: 40, mismatched: 0, socketOnly: 0, htmlOnly: 10 } });
        expect(contentKeys(c)).toEqual([['main:compare:html-only', 'risk']]);
    });

    it('수집 창이 닉네임, 본문, 배지 그림을 안 그리면 위험', () => {
        const c = sample(20);
        c.items = c.chats.map((x) => item(x, { text: '12:00', nameImgs: 0 }));
        expect(contentKeys(c)).toEqual([['main:render:name', 'risk'], ['main:render:text', 'risk'], ['main:render:badges', 'risk']]);
    });

    it('이모티콘만 있는 채팅, 가려진 채팅, 익명은 해당 비교에서 뺀다', () => {
        const c = sample(20);
        c.chats = c.chats.map((x, i) => (i % 2 ? { ...x, message: '{:d_151:}{:d_151:}' } : { ...x, status: 'CBOTBLIND', anonymous: true }));
        c.items = c.chats.map((x) => item(x, { text: '12:00 이모티콘' }));
        expect(contentKeys(c)).toEqual([['main:render:name', 'risk']]);
    });
});

describe('mergeStoreReport', () => {
    const broken = judgeMain({ ...healthy, paneExists: false, pane: 0, container: 0 });
    const ok = judgeMain(healthy);
    const blind = judgeMain({ at: 1, error: '확장 zip 404' });

    it('스토어 버전만 고장이면 main:store: 사건', () => {
        const r = mergeStoreReport(ok, broken, '2.28.0');
        expect([r.status, r.findings.map((f) => [f.key, f.part])]).toEqual(['issue', [['main:store:no-pane', '스토어 버전']]]);
        expect(r.findings[0].title).toMatch(/^스토어 v2\.28\.0: /);
    });

    it('최신 릴리스 사건은 key가 그대로다 (같은 버전일 때와 같은 사건)', () => {
        expect(mergeStoreReport(broken, ok, '2.28.0').findings.map((f) => f.key)).toEqual(['main:no-pane']);
    });

    it('한쪽만 확인 못 하면 그쪽은 unknownParts, 다른 쪽으로 판정', () => {
        const r = mergeStoreReport(ok, blind, '2.28.0');
        expect([r.status, r.unknownParts]).toEqual(['ok', [{ part: '스토어 버전', note: '확장 zip 404' }]]);
    });

    it('둘 다 확인 못 하면 확인 못 함', () => {
        expect(mergeStoreReport(blind, blind, '2.28.0').status).toBe('unknown');
    });
});
