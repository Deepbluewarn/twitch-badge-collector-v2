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
        expect(evaluateFilterGroup(chat(), [])).toBe(false);
    });

    it('returns false when filterGroup is undefined-equivalent', () => {
        expect(evaluateFilterGroup(chat(), undefined as any)).toBe(false);
    });
});

// ----- Single composite, atomic categories -------------------------------

describe('evaluateFilterGroup — atomic categories', () => {
    it('keyword include matches when chat text contains value', () => {
        const fg = [composite({
            filters: [atom({ category: 'keyword', value: 'hello' })],
        })];
        expect(evaluateFilterGroup(chat({ textContents: ['hello world'] }), fg)).toBe(true);
        expect(evaluateFilterGroup(chat({ textContents: ['bye'] }), fg)).toBe(false);
    });

    it('name include matches loginName or nickName (case-insensitive)', () => {
        const fg = [composite({
            filters: [atom({ category: 'name', value: 'Alice' })],
        })];
        expect(evaluateFilterGroup(chat({ loginName: 'alice' }), fg)).toBe(true);
        expect(evaluateFilterGroup(chat({ nickName: 'ALICE' }), fg)).toBe(true);
        expect(evaluateFilterGroup(chat({ loginName: 'bob' }), fg)).toBe(false);
    });

    it('badge include matches when value or badgeSetId is in chat.badges', () => {
        const fg = [composite({
            filters: [atom({ category: 'badge', value: 'subscriber/0', badgeSetId: 'subscriber' })],
        })];
        expect(evaluateFilterGroup(chat({ badges: ['subscriber/0'] }), fg)).toBe(true);
        expect(evaluateFilterGroup(chat({ badges: ['subscriber'] }), fg)).toBe(true); // matched via badgeSetId
        expect(evaluateFilterGroup(chat({ badges: ['moderator'] }), fg)).toBe(false);
    });
});

// ----- Atomic Filter Type modifiers --------------------------------------

describe('evaluateFilterGroup — atomic Filter Type modifiers', () => {
    it('atomic exclude negates the match (NOT)', () => {
        const fg = [composite({
            filters: [atom({ category: 'name', value: 'spam', type: 'exclude' })],
        })];
        // chat name is NOT spam → atomic returns true → composite include → admit
        expect(evaluateFilterGroup(chat({ loginName: 'alice' }), fg)).toBe(true);
        // chat name IS spam → atomic returns false → composite skip → res unchanged (false)
        expect(evaluateFilterGroup(chat({ loginName: 'spam' }), fg)).toBe(false);
    });

    it('atomic sleep makes the parent composite have no effect', () => {
        const fg = [composite({
            filters: [
                atom({ id: 'a1', category: 'name', value: 'alice' }),
                atom({ id: 'a2', category: 'keyword', value: 'hi', type: 'sleep' }),
            ],
        })];
        // even though name matches, sleep atomic forces composite to not fire → admit verdict stays false
        expect(evaluateFilterGroup(chat({ loginName: 'alice', textContents: ['hi'] }), fg)).toBe(false);
    });

    it('atoms in a Filter are joined by AND', () => {
        const fg = [composite({
            filters: [
                atom({ id: 'a1', category: 'name', value: 'alice' }),
                atom({ id: 'a2', category: 'keyword', value: 'gg' }),
            ],
        })];
        expect(evaluateFilterGroup(chat({ loginName: 'alice', textContents: ['gg'] }), fg)).toBe(true);
        expect(evaluateFilterGroup(chat({ loginName: 'alice', textContents: ['bye'] }), fg)).toBe(false);
        expect(evaluateFilterGroup(chat({ loginName: 'bob', textContents: ['gg'] }), fg)).toBe(false);
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
        expect(evaluateFilterGroup(chat({ loginName: 'alice', textContents: ['gg'] }), fg)).toBe(true);
    });

    it('composite exclude short-circuits the entire Filter Group', () => {
        const fg = [
            composite({ id: 'c1', filterType: 'include', filters: [atom({ category: 'name', value: 'alice' })] }),
            composite({ id: 'c2', filterType: 'exclude', filters: [atom({ category: 'keyword', value: 'spam' })] }),
            // c3 should NOT be reached if c2 fires
            composite({ id: 'c3', filterType: 'include', filters: [atom({ category: 'keyword', value: 'gg' })] }),
        ];
        // alice + spam → c1 admits, c2 excludes (short-circuit) → drop
        expect(evaluateFilterGroup(chat({ loginName: 'alice', textContents: ['spam', 'gg'] }), fg)).toBe(false);
    });

    it('composite exclude that does NOT match leaves earlier admit intact', () => {
        const fg = [
            composite({ id: 'c1', filterType: 'include', filters: [atom({ category: 'name', value: 'alice' })] }),
            composite({ id: 'c2', filterType: 'exclude', filters: [atom({ category: 'keyword', value: 'spam' })] }),
        ];
        expect(evaluateFilterGroup(chat({ loginName: 'alice', textContents: ['gg'] }), fg)).toBe(true);
    });

    it('composite sleep does not change the verdict (skipped)', () => {
        const fg = [
            composite({ id: 'c1', filterType: 'sleep', filters: [atom({ category: 'name', value: 'alice' })] }),
        ];
        expect(evaluateFilterGroup(chat({ loginName: 'alice' }), fg)).toBe(false);
    });

    it('later include can re-admit after a sleep composite', () => {
        const fg = [
            composite({ id: 'c1', filterType: 'sleep', filters: [atom({ category: 'name', value: 'alice' })] }),
            composite({ id: 'c2', filterType: 'include', filters: [atom({ category: 'keyword', value: 'gg' })] }),
        ];
        expect(evaluateFilterGroup(chat({ loginName: 'alice', textContents: ['gg'] }), fg)).toBe(true);
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
        expect(evaluateFilterGroup(chat({ loginName: 'alice' }), fg, '12345')).toBe(true);
        // wrong channel → composite skipped entirely
        expect(evaluateFilterGroup(chat({ loginName: 'alice' }), fg, '99999')).toBe(false);
        // no channel arg → composite skipped (filterChannelId set + arg falsy)
        expect(evaluateFilterGroup(chat({ loginName: 'alice' }), fg)).toBe(false);
    });

    it('composite without filterChannelId applies regardless of channelId arg', () => {
        const fg = [composite({
            filters: [atom({ category: 'name', value: 'alice' })],
        })];
        expect(evaluateFilterGroup(chat({ loginName: 'alice' }), fg, '12345')).toBe(true);
        expect(evaluateFilterGroup(chat({ loginName: 'alice' }), fg)).toBe(true);
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
        )).toBe(true);
        // chat from another channel with same badge → mismatch
        expect(evaluateFilterGroup(
            chat({ badges: ['subscriber/0'], channelLogin: 'other' }),
            fg,
        )).toBe(false);
    });

    it('atomic without channelLogin/channelId is platform-neutral (Chzzk path)', () => {
        // Chzzk badges don't have channelLogin/channelId set on filter — auto pass.
        const fg = [composite({
            filters: [atom({ category: 'badge', value: 'https://example.com/badge.png' })],
        })];
        expect(evaluateFilterGroup(
            chat({ badges: ['https://example.com/badge.png'] }), // no channelLogin on chat either
            fg,
        )).toBe(true);
    });

    it('chat lacking channelLogin while atomic has one — no mismatch (loose check)', () => {
        // Per current logic: only treat as mismatch if BOTH sides set + differ.
        const fg = [composite({
            filters: [atom({ category: 'badge', value: 'sub/0', channelLogin: 'cohh' })],
        })];
        expect(evaluateFilterGroup(chat({ badges: ['sub/0'] /* no channelLogin */ }), fg)).toBe(true);
    });
});
