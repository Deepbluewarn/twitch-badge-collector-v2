import { describe, it, expect } from 'vitest';
import type { CompositeFilterElement } from '@/interfaces/filter';
import { personState, togglePerson } from './person';

const who = { userId: 'u1', nickname: '고양이', image: 'https://x/p.png' };
const personFilter = (over: Partial<CompositeFilterElement> = {}): CompositeFilterElement => ({
    id: 'p', filterType: 'include', filterNote: '', platform: 'chzzk',
    filters: [{ id: 'a', category: 'name', type: 'include', value: '옛닉', userId: 'u1' }],
    ...over,
});
const other: CompositeFilterElement = {
    id: 'o', filterType: 'include', filterNote: '', platform: 'chzzk',
    filters: [{ id: 'b', category: 'keyword', type: 'include', value: 'ㅋ' }],
};

describe('togglePerson', () => {
    it('없으면 그 사람 필터를 새로 넣는다', () => {
        const next = togglePerson([other], who, 'include');
        expect(next).toHaveLength(2);
        expect(next[1]).toMatchObject({ filterType: 'include', platform: 'chzzk', filters: [{ category: 'name', type: 'include', value: '고양이', userId: 'u1', userImage: who.image }] });
        expect(personState(next, 'u1')).toBe('include');
    });

    it('같은 상태를 다시 누르면 해제', () => {
        expect(togglePerson([other, personFilter()], who, 'include')).toEqual([other]);
    });

    it('반대 상태면 자리와 메모를 지키고 바꾼다', () => {
        const next = togglePerson([personFilter({ filterNote: '메모' }), other], who, 'exclude');
        expect(next).toEqual([personFilter({ filterNote: '메모', filterType: 'exclude' }), other]);
    });

    it('채널을 지정했거나 조건이 섞인 필터는 그 사람 필터로 보지 않는다', () => {
        const scoped = personFilter({ id: 's', filterChannelId: 'ch' });
        const mixed = personFilter({ id: 'm', filters: [...personFilter().filters, other.filters[0]] });
        expect(personState([scoped, mixed], 'u1')).toBeNull();
        expect(togglePerson([scoped, mixed], who, 'include')).toHaveLength(3);
    });

    it('꺼 둔 필터는 없는 셈이고, 누르면 그 필터를 켠다', () => {
        const off = personFilter({ filterType: 'sleep' });
        expect(personState([off], 'u1')).toBeNull();
        expect(togglePerson([off], who, 'exclude')).toEqual([{ ...off, filterType: 'exclude' }]);
    });

    it('닉네임으로만 넣은 필터나 다른 플랫폼은 건드리지 않는다', () => {
        const byName: CompositeFilterElement = { ...personFilter(), id: 'n', filters: [{ id: 'c', category: 'name', type: 'include', value: '고양이' }] };
        const twitch = personFilter({ id: 't', platform: 'twitch' });
        expect(togglePerson([byName, twitch], who, 'include')).toHaveLength(3);
    });
});
