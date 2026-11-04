import { describe, it, expect } from 'vitest';
import type { AtomicFilterElement, CompositeFilterElement, FilterType } from '@/interfaces/filter';
import { findDuplicateFilterIds } from './duplicate';

const atom = (category: AtomicFilterElement['category'], value: string, type: FilterType = 'include'): AtomicFilterElement => ({ id: Math.random().toString(), category, type, value });
const f = (id: string, filters: AtomicFilterElement[], extra: Partial<CompositeFilterElement> = {}): CompositeFilterElement =>
    ({ id, platform: 'chzzk', filterType: 'include', filterNote: '', filters, ...extra });

describe('findDuplicateFilterIds', () => {
    it('조건이 같으면 순서·메모·색과 상관없이 같은 필터', () => {
        const ids = findDuplicateFilterIds([
            f('a', [atom('name', 'x'), atom('keyword', '공지')]),
            f('b', [atom('keyword', '공지'), atom('name', 'x')], { filterNote: '메모', markerColor: '#000' }),
            f('c', [atom('name', 'x')]),
        ]);
        expect([...ids].sort()).toEqual(['a', 'b']);
    });
    it('포함/제외만 다르면 같은 필터로 본다 (제외가 늘 이긴다)', () => {
        expect(findDuplicateFilterIds([f('a', [atom('name', 'x')]), f('b', [atom('name', 'x')], { filterType: 'exclude' })]).size).toBe(2);
    });
    it('맞음/아님이 다르거나 채널·플랫폼이 다르면 다른 필터', () => {
        expect(findDuplicateFilterIds([
            f('a', [atom('name', 'x')]),
            f('b', [atom('name', 'x', 'exclude')]),
            f('c', [atom('name', 'x')], { filterChannelId: 'ch' }),
            f('d', [atom('name', 'x')], { platform: 'twitch' }),
        ]).size).toBe(0);
    });
    it('사람으로 고른 이름 조건은 닉네임이 달라도 ID가 같으면 같은 필터', () => {
        const who = (value: string, userId?: string) => ({ ...atom('name', value), ...(userId ? { userId } : {}) });
        expect([...findDuplicateFilterIds([
            f('a', [who('예전닉', 'u1')]),
            f('b', [who('새닉', 'u1')]),
            f('c', [who('새닉', 'u2')]),
            f('d', [who('새닉')]),
        ])].sort()).toEqual(['a', 'b']);
    });
});
