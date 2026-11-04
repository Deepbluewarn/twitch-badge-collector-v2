import { nanoid } from 'nanoid';
import type { CompositeFilterElement, FilterGroup } from '@/interfaces/filter';

/**
 * 사람 하나를 수집하거나 제외하는 필터 — 치지직 채팅의 프로필 창에서 바로 넣고 뺀다.
 *
 * 그 사람의 필터로 보는 것: 치지직, 채널 지정 없음, 조건이 ID로 고른 닉네임 하나뿐(맞음).
 * 다른 조건이 섞였거나 채널을 지정한 필터는 사용자가 따로 만든 것이라 건드리지 않는다.
 */
export interface Person { userId: string; nickname: string; image?: string }
export type PersonState = 'include' | 'exclude' | null;

const isPersonFilter = (f: CompositeFilterElement, userId: string) =>
    f.platform === 'chzzk' && !f.filterChannelId && f.filters.length === 1
    && f.filters[0].category === 'name' && f.filters[0].type === 'include' && f.filters[0].userId === userId;

/** 지금 그 사람을 수집 중인지, 제외 중인지. 꺼 둔 필터는 없는 셈. */
export function personState(group: FilterGroup, userId: string): PersonState {
    const f = group.find(f => isPersonFilter(f, userId) && f.filterType !== 'sleep');
    return f ? f.filterType as PersonState : null;
}

/**
 * 수집(include)이나 제외(exclude)를 켜고 끈다. 이미 그 상태면 그 사람의 필터를 지우고(해제), 반대 상태면 바꾼다.
 * 바꿀 땐 첫 필터의 자리와 메모를 지키고, 같은 사람 필터가 더 있으면 지운다.
 */
export function togglePerson(group: FilterGroup, person: Person, type: 'include' | 'exclude'): FilterGroup {
    const mine = group.filter(f => isPersonFilter(f, person.userId));
    const rest = group.filter(f => !isPersonFilter(f, person.userId));
    if (personState(group, person.userId) === type) return rest;
    if (mine.length > 0) {
        const keep = mine[0];
        return group.flatMap(f => f === keep ? [{ ...f, filterType: type }] : mine.includes(f) ? [] : [f]);
    }
    return [...group, {
        filterType: type,
        id: nanoid(),
        filterNote: '',
        platform: 'chzzk',
        filters: [{
            category: 'name', id: nanoid(), type: 'include',
            value: person.nickname || person.userId, userId: person.userId,
            ...(person.image ? { userImage: person.image } : {}),
        }],
    }];
}
