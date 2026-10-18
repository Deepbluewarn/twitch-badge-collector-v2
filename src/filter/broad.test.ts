import { describe, it, expect } from 'vitest';
import type { AtomicFilterElement, CompositeFilterElement, FilterType } from '@/interfaces/filter';
import { isBroadFilter } from './broad';

const atom = (category: AtomicFilterElement['category'], type: FilterType, value: string): AtomicFilterElement => ({ id: value + type, category, type, value });
const filter = (filters: AtomicFilterElement[], filterType: FilterType = 'include', filterChannelId?: string): CompositeFilterElement =>
    ({ id: 'f', platform: 'chzzk', filterType, filterNote: '', filters, filterChannelId });

describe('isBroadFilter', () => {
    it("조건이 전부 '아님'이면 넓다", () => {
        expect(isBroadFilter(filter([atom('badge', 'exclude', 'manager')]))).toBe(true);
        expect(isBroadFilter(filter([atom('name', 'exclude', 'bot'), atom('keyword', 'exclude', '광고')]))).toBe(true);
    });
    it('빈 키워드나 조건 없음도 넓다', () => {
        expect(isBroadFilter(filter([atom('keyword', 'include', '')]))).toBe(true);
        expect(isBroadFilter(filter([]))).toBe(true);
    });
    it("'맞음' 조건이 하나라도 있으면 넓지 않다", () => {
        expect(isBroadFilter(filter([atom('badge', 'include', 'sub')]))).toBe(false);
        expect(isBroadFilter(filter([atom('badge', 'include', 'sub'), atom('name', 'exclude', 'bot')]))).toBe(false);
        expect(isBroadFilter(filter([atom('keyword', 'include', '공지')]))).toBe(false);
    });
    it('제외·꺼짐 필터는 보지 않는다', () => {
        expect(isBroadFilter(filter([atom('badge', 'exclude', 'manager')], 'exclude'))).toBe(false);
        expect(isBroadFilter(filter([atom('badge', 'exclude', 'manager')], 'sleep'))).toBe(false);
    });
    it('꺼진 조건이 있으면 필터가 맞지 않으니 넓지 않다', () => {
        expect(isBroadFilter(filter([atom('badge', 'exclude', 'manager'), atom('name', 'sleep', 'x')]))).toBe(false);
    });
    it('채널을 지정해도 그 채널에선 전부 모으니 넓다', () => {
        expect(isBroadFilter(filter([atom('badge', 'exclude', 'manager')], 'include', 'ch1'))).toBe(true);
    });
});
