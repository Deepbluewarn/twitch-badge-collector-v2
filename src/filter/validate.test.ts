import { describe, it, expect } from 'vitest';
import { validateFilterList } from './validate';
import { CompositeFilterElement, AtomicFilterElement } from '@/interfaces/filter';

const atom = (over: Partial<AtomicFilterElement> = {}): AtomicFilterElement => ({
    id: 'a',
    category: 'keyword',
    type: 'include',
    value: 'something',
    ...over,
});

const composite = (over: Partial<CompositeFilterElement> = {}): CompositeFilterElement => ({
    id: 'c',
    filterType: 'include',
    filterNote: '',
    filters: [atom()],
    platform: 'twitch',
    ...over,
});

describe('validateFilterList', () => {
    it('returns valid for a well-formed composite Filter Element', () => {
        expect(validateFilterList(composite())).toEqual({ valid: true });
    });

    it('returns missing_filter when input is null/undefined', () => {
        expect(validateFilterList(null as any)).toEqual({ valid: false, error: 'missing_filter' });
        expect(validateFilterList(undefined as any)).toEqual({ valid: false, error: 'missing_filter' });
    });

    it('returns missing_id when id is empty', () => {
        expect(validateFilterList(composite({ id: '' }))).toEqual({ valid: false, error: 'missing_id' });
    });

    it('returns missing_filter_type when filterType is falsy', () => {
        expect(validateFilterList(composite({ filterType: '' as any }))).toEqual({
            valid: false,
            error: 'missing_filter_type',
        });
    });

    it('returns missing_sub_filters when filters is empty array', () => {
        expect(validateFilterList(composite({ filters: [] }))).toEqual({
            valid: false,
            error: 'missing_sub_filters',
        });
    });

    it('returns missing_sub_filters when filters is not an array', () => {
        expect(validateFilterList(composite({ filters: undefined as any }))).toEqual({
            valid: false,
            error: 'missing_sub_filters',
        });
    });

    it('returns empty_sub_filter_value when any sub-filter has empty value', () => {
        expect(validateFilterList(composite({
            filters: [atom({ value: 'ok' }), atom({ value: '' })],
        }))).toEqual({ valid: false, error: 'empty_sub_filter_value' });
    });

    it('checks sub-filter values in order — first invalid is the one reported', () => {
        // 모든 sub-filter가 empty value여도 첫 번째에서 짧게 끝나는 것을 확인.
        expect(validateFilterList(composite({
            filters: [atom({ value: '' }), atom({ value: '' })],
        }))).toEqual({ valid: false, error: 'empty_sub_filter_value' });
    });
});
