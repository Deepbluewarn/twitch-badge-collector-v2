import { describe, it, expect } from 'vitest';
import type { CompositeFilterElement } from '@/interfaces/filter';
import { matchesFilterSearch } from './search';

const f: CompositeFilterElement = {
    id: 'f', platform: 'chzzk', filterType: 'include', filterNote: '이벤트 기간',
    filterChannelId: 'abc123', filterChannelName: '나나양',
    filters: [
        { id: 'a', category: 'badge', type: 'include', value: 'https://img/manager.png', badgeName: '채널 관리자' },
        { id: 'b', category: 'keyword', type: 'include', value: '공지' },
        { id: 'c', category: 'name', type: 'exclude', value: 'NightBot' },
    ],
};

describe('matchesFilterSearch', () => {
    it('빈 검색어는 모두 맞다', () => expect(matchesFilterSearch(f, '  ')).toBe(true));
    it('키워드·닉네임(대소문자 무시)', () => {
        expect(matchesFilterSearch(f, '공지')).toBe(true);
        expect(matchesFilterSearch(f, 'nightbot')).toBe(true);
    });
    it('배지는 주소가 아니라 이름으로', () => {
        expect(matchesFilterSearch(f, '관리자')).toBe(true);
        expect(matchesFilterSearch(f, 'manager.png')).toBe(false);
    });
    it('채널 이름·ID, 메모', () => {
        expect(matchesFilterSearch(f, '나나')).toBe(true);
        expect(matchesFilterSearch(f, 'abc1')).toBe(true);
        expect(matchesFilterSearch(f, '이벤트')).toBe(true);
    });
    it('어디에도 없으면 안 맞다', () => expect(matchesFilterSearch(f, '광고')).toBe(false));
});
