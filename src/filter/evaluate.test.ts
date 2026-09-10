import { describe, it, expect } from 'vitest';
import { evaluateFilterGroup } from './evaluate';
import { CompositeFilterElement, AtomicFilterElement, FilterType } from '@/interfaces/filter';
import { ChatInfo } from '@/interfaces/chat';

// ----- Test fixture builders ---------------------------------------------

const chat = (over: Partial<ChatInfo> = {}): ChatInfo => ({
    badges: [],
    textContents: [],
    loginName: '',
    nickName: '',
    ...over,
});

const atom = (over: Partial<AtomicFilterElement>): AtomicFilterElement => ({
    id: 'a',
    category: 'keyword',
    type: 'include',
    value: '',
    ...over,
});

const composite = (over: Partial<CompositeFilterElement>): CompositeFilterElement => ({
    id: 'c',
    filterType: 'include' as FilterType,
    filterNote: '',
    filters: [],
    platform: 'twitch',
    ...over,
});

// ----- Empty Filter Group -------------------------------------------------

describe('evaluateFilterGroup — empty/missing', () => {
    it('returns false for empty Filter Group', () => {
        expect(evaluateFilterGroup(chat(), []).pass).toBe(false);
    });

    it('returns false when filterGroup is undefined-equivalent', () => {
        expect(evaluateFilterGroup(chat(), undefined as any).pass).toBe(false);
    });
});

// ----- Single composite, atomic categories -------------------------------

describe('evaluateFilterGroup — atomic categories', () => {
    it('keyword include matches when chat text contains value', () => {
        const fg = [composite({
            filters: [atom({ category: 'keyword', value: 'hello' })],
        })];
        expect(evaluateFilterGroup(chat({ textContents: ['hello world'] }), fg).pass).toBe(true);
        expect(evaluateFilterGroup(chat({ textContents: ['bye'] }), fg).pass).toBe(false);
    });

    it('name include matches loginName or nickName (case-insensitive)', () => {
        const fg = [composite({
            filters: [atom({ category: 'name', value: 'Alice' })],
        })];
        expect(evaluateFilterGroup(chat({ loginName: 'alice' }), fg).pass).toBe(true);
        expect(evaluateFilterGroup(chat({ nickName: 'ALICE' }), fg).pass).toBe(true);
        expect(evaluateFilterGroup(chat({ loginName: 'bob' }), fg).pass).toBe(false);
    });

    it('badge include matches when value or badgeSetId is in chat.badges', () => {
        const fg = [composite({
            filters: [atom({ category: 'badge', value: 'subscriber/0', badgeSetId: 'subscriber' })],
        })];
        expect(evaluateFilterGroup(chat({ badges: ['subscriber/0'] }), fg).pass).toBe(true);
        expect(evaluateFilterGroup(chat({ badges: ['subscriber'] }), fg).pass).toBe(true); // matched via badgeSetId
        expect(evaluateFilterGroup(chat({ badges: ['moderator'] }), fg).pass).toBe(false);
    });
});

// ----- Atomic Filter Type modifiers --------------------------------------

describe('evaluateFilterGroup — atomic Filter Type modifiers', () => {
    it('atomic exclude negates the match (NOT)', () => {
        const fg = [composite({
            filters: [atom({ category: 'name', value: 'spam', type: 'exclude' })],
        })];
        // chat name is NOT spam → atomic returns true → composite include → admit
        expect(evaluateFilterGroup(chat({ loginName: 'alice' }), fg).pass).toBe(true);
        // chat name IS spam → atomic returns false → composite skip → res unchanged (false)
        expect(evaluateFilterGroup(chat({ loginName: 'spam' }), fg).pass).toBe(false);
    });

    it('atomic sleep makes the parent composite have no effect', () => {
        const fg = [composite({
            filters: [
                atom({ id: 'a1', category: 'name', value: 'alice' }),
                atom({ id: 'a2', category: 'keyword', value: 'hi', type: 'sleep' }),
            ],
        })];
        // even though name matches, sleep atomic forces composite to not fire → admit verdict stays false
        expect(evaluateFilterGroup(chat({ loginName: 'alice', textContents: ['hi'] }), fg).pass).toBe(false);
    });

    it('atoms in a Filter are joined by AND', () => {
        const fg = [composite({
            filters: [
                atom({ id: 'a1', category: 'name', value: 'alice' }),
                atom({ id: 'a2', category: 'keyword', value: 'gg' }),
            ],
        })];
        expect(evaluateFilterGroup(chat({ loginName: 'alice', textContents: ['gg'] }), fg).pass).toBe(true);
        expect(evaluateFilterGroup(chat({ loginName: 'alice', textContents: ['bye'] }), fg).pass).toBe(false);
        expect(evaluateFilterGroup(chat({ loginName: 'bob', textContents: ['gg'] }), fg).pass).toBe(false);
    });
});

// ----- Composite Filter Type terminal actions ----------------------------

describe('evaluateFilterGroup — composite Filter Type', () => {
    it('composite include sets admit verdict but keeps evaluating', () => {
        const fg = [
            composite({ id: 'c1', filterType: 'include', filters: [atom({ category: 'name', value: 'alice' })] }),
            composite({ id: 'c2', filterType: 'include', filters: [atom({ category: 'keyword', value: 'gg' })] }),
        ];
        // first include sets true; second matches too — still true
        expect(evaluateFilterGroup(chat({ loginName: 'alice', textContents: ['gg'] }), fg).pass).toBe(true);
    });

    it('composite exclude short-circuits the entire Filter Group', () => {
        const fg = [
            composite({ id: 'c1', filterType: 'include', filters: [atom({ category: 'name', value: 'alice' })] }),
            composite({ id: 'c2', filterType: 'exclude', filters: [atom({ category: 'keyword', value: 'spam' })] }),
            // c3 should NOT be reached if c2 fires
            composite({ id: 'c3', filterType: 'include', filters: [atom({ category: 'keyword', value: 'gg' })] }),
        ];
        // alice + spam → c1 admits, c2 excludes (short-circuit) → drop
        expect(evaluateFilterGroup(chat({ loginName: 'alice', textContents: ['spam', 'gg'] }), fg).pass).toBe(false);
    });

    it('composite exclude that does NOT match leaves earlier admit intact', () => {
        const fg = [
            composite({ id: 'c1', filterType: 'include', filters: [atom({ category: 'name', value: 'alice' })] }),
            composite({ id: 'c2', filterType: 'exclude', filters: [atom({ category: 'keyword', value: 'spam' })] }),
        ];
        expect(evaluateFilterGroup(chat({ loginName: 'alice', textContents: ['gg'] }), fg).pass).toBe(true);
    });

    it('composite sleep does not change the verdict (skipped)', () => {
        const fg = [
            composite({ id: 'c1', filterType: 'sleep', filters: [atom({ category: 'name', value: 'alice' })] }),
        ];
        expect(evaluateFilterGroup(chat({ loginName: 'alice' }), fg).pass).toBe(false);
    });

    it('later include can re-admit after a sleep composite', () => {
        const fg = [
            composite({ id: 'c1', filterType: 'sleep', filters: [atom({ category: 'name', value: 'alice' })] }),
            composite({ id: 'c2', filterType: 'include', filters: [atom({ category: 'keyword', value: 'gg' })] }),
        ];
        expect(evaluateFilterGroup(chat({ loginName: 'alice', textContents: ['gg'] }), fg).pass).toBe(true);
    });
});

// ----- Channel Scope ------------------------------------------------------

describe('evaluateFilterGroup — Channel Scope', () => {
    it('composite with filterChannelId applies only when channelId arg matches', () => {
        const fg = [composite({
            filterChannelId: '12345',
            filters: [atom({ category: 'name', value: 'alice' })],
        })];
        // matching channel → admit
        expect(evaluateFilterGroup(chat({ loginName: 'alice' }), fg, '12345').pass).toBe(true);
        // wrong channel → composite skipped entirely
        expect(evaluateFilterGroup(chat({ loginName: 'alice' }), fg, '99999').pass).toBe(false);
        // no channel arg → composite skipped (filterChannelId set + arg falsy)
        expect(evaluateFilterGroup(chat({ loginName: 'alice' }), fg).pass).toBe(false);
    });

    it('composite without filterChannelId applies regardless of channelId arg', () => {
        const fg = [composite({
            filters: [atom({ category: 'name', value: 'alice' })],
        })];
        expect(evaluateFilterGroup(chat({ loginName: 'alice' }), fg, '12345').pass).toBe(true);
        expect(evaluateFilterGroup(chat({ loginName: 'alice' }), fg).pass).toBe(true);
    });
});

// ----- Badge channel scope (Twitch sub/cheer) ----------------------------

describe('evaluateFilterGroup — atomic badge channel scope', () => {
    it('atomic with channelLogin scope only matches chats from that channel', () => {
        const fg = [composite({
            filters: [atom({
                category: 'badge',
                value: 'subscriber/0',
                channelLogin: 'cohh',
            })],
        })];
        // chat from cohh with subscriber badge → match
        expect(evaluateFilterGroup(
            chat({ badges: ['subscriber/0'], channelLogin: 'cohh' }),
            fg,
        ).pass).toBe(true);
        // chat from another channel with same badge → mismatch
        expect(evaluateFilterGroup(
            chat({ badges: ['subscriber/0'], channelLogin: 'other' }),
            fg,
        ).pass).toBe(false);
    });

    it('atomic without channelLogin/channelId is platform-neutral (Chzzk path)', () => {
        // Chzzk badges don't have channelLogin/channelId set on filter — auto pass.
        const fg = [composite({
            filters: [atom({ category: 'badge', value: 'https://example.com/badge.png' })],
        })];
        expect(evaluateFilterGroup(
            chat({ badges: ['https://example.com/badge.png'] }), // no channelLogin on chat either
            fg,
        ).pass).toBe(true);
    });

    it('chat lacking channelLogin while atomic has one — no mismatch (loose check)', () => {
        // Per current logic: only treat as mismatch if BOTH sides set + differ.
        const fg = [composite({
            filters: [atom({ category: 'badge', value: 'sub/0', channelLogin: 'cohh' })],
        })];
        expect(evaluateFilterGroup(chat({ badges: ['sub/0'] /* no channelLogin */ }), fg).pass).toBe(true);
    });
});

// ----- unavailable 필드 (부분 수집) --------------------------------------

describe('evaluateFilterGroup — unavailable 필드', () => {
    it('name이 unavailable이면 name include composite가 발화하지 않는다', () => {
        const group = [composite({
            filterType: 'include',
            filters: [atom({ category: 'name', type: 'include', value: 'alice' })],
        })];
        // 값을 못 뽑았을 뿐인데 빈 문자열이 'alice'와 다르다고 판단하면 조용히 누락된다.
        // 어차피 include는 pass=false로 같지만, 아래 exclude 케이스와 대칭을 맞춰 명시.
        expect(evaluateFilterGroup(chat({ unavailable: ['name'] }), group).pass).toBe(false);
    });

    it('name이 unavailable이면 name exclude atomic이 전원 매칭으로 뒤집히지 않는다', () => {
        // 이것이 Layer 3의 핵심 이유.
        // `NOT name=alice` AND `badge=streamer` 를 include로 묶은 composite에서
        // 닉네임을 못 뽑았다고 name atomic을 그냥 false로 두면, exclude가 그걸 부정해
        // true가 되고 배지만 맞는 모든 채팅이 통과한다 — 사용자가 만든 조건과 다르다.
        const group = [composite({
            filterType: 'include',
            filters: [
                atom({ id: 'a1', category: 'name', type: 'exclude', value: 'alice' }),
                atom({ id: 'a2', category: 'badge', type: 'include', value: 'streamer' }),
            ],
        })];

        const known = chat({ nickName: 'bob', loginName: 'bob', badges: ['streamer'] });
        expect(evaluateFilterGroup(known, group).pass).toBe(true);

        const unknownName = chat({ nickName: '', loginName: '', badges: ['streamer'], unavailable: ['name'] });
        expect(evaluateFilterGroup(unknownName, group).pass).toBe(false);
    });

    it('name이 unavailable이면 name exclude composite가 채팅을 전량 드롭하지 않는다', () => {
        // exclude composite는 매칭 시 Filter Group 전체를 단락시킨다. 확정 못 한 필드로
        // 그게 발화하면 수집이 통째로 멈춘다.
        const group = [
            composite({
                id: 'inc',
                filterType: 'include',
                filters: [atom({ id: 'b', category: 'badge', type: 'include', value: 'streamer' })],
            }),
            composite({
                id: 'exc',
                filterType: 'exclude',
                filters: [atom({ id: 'n', category: 'name', type: 'exclude', value: 'alice' })],
            }),
        ];

        const unknownName = chat({ badges: ['streamer'], unavailable: ['name'] });
        // exclude composite는 건너뛰고 include만 평가 → 배지 필터는 계속 동작.
        expect(evaluateFilterGroup(unknownName, group).pass).toBe(true);
    });

    it('badge가 unavailable이면 badge를 쓰는 composite만 빠지고 나머지는 동작한다', () => {
        const group = [
            composite({
                id: 'byBadge',
                filterType: 'include',
                filters: [atom({ id: 'b', category: 'badge', type: 'include', value: 'streamer' })],
            }),
            composite({
                id: 'byKeyword',
                filterType: 'include',
                filters: [atom({ id: 'k', category: 'keyword', type: 'include', value: 'hello' })],
            }),
        ];

        const noBadge = chat({ textContents: ['hello world'], badges: [], unavailable: ['badge'] });
        expect(evaluateFilterGroup(noBadge, group).pass).toBe(true);

        const noBadgeNoKeyword = chat({ textContents: ['nope'], badges: [], unavailable: ['badge'] });
        expect(evaluateFilterGroup(noBadgeNoKeyword, group).pass).toBe(false);
    });

    it('빈 unavailable 배열은 정상 채팅과 동일하게 평가된다', () => {
        const group = [composite({
            filterType: 'include',
            filters: [atom({ category: 'name', type: 'include', value: 'alice' })],
        })];
        const c = chat({ nickName: 'alice', loginName: 'alice', unavailable: [] });
        expect(evaluateFilterGroup(c, group).pass).toBe(true);
    });
});
