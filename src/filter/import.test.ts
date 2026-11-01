import { describe, it, expect } from 'vitest';
import { parseFilterImport, replacePlatformFilters } from './import';
import { CompositeFilterElement } from '@/interfaces/filter';

const composite = (id: string, value: unknown, over: Record<string, unknown> = {}) => ({
    id,
    filterType: 'include',
    filterNote: '',
    platform: 'chzzk',
    filters: [{ id: `${id}-a`, category: 'keyword', type: 'include', value }],
    ...over,
});

describe('parseFilterImport', () => {
    it('JSON이 아니거나 배열이 아니면 실패', () => {
        expect(parseFilterImport('not json')).toEqual({ ok: false });
        expect(parseFilterImport('{"a":1}')).toEqual({ ok: false });
    });
    it('형식이 틀린 항목은 버리고 센다', () => {
        const text = JSON.stringify([
            composite('ok', 'hello'),
            composite('empty', ''),
            composite('number', 123),
            composite('nofilters', 'x', { filters: undefined }),
            composite('badcat', 'x', { filters: [{ category: 'regex', type: 'include', value: 'x' }] }),
            null,
        ]);
        const r = parseFilterImport(text);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.list.map(f => f.id)).toEqual(['ok']);
        expect(r.skipped).toBe(5);
    });
    it('조건 id가 없으면 새로 만든다', () => {
        const r = parseFilterImport(JSON.stringify([composite('c', 'x', { filters: [{ category: 'name', type: 'include', value: 'x' }] })]));
        expect(r.ok && r.list[0].filters[0].id).toBeTruthy();
    });
});

describe('replacePlatformFilters', () => {
    const cur = [
        composite('t1', 'tw', { platform: 'twitch' }),
        composite('c1', 'old'),
    ] as CompositeFilterElement[];

    it('지금 플랫폼 필터만 바꾸고 다른 플랫폼은 그대로', () => {
        const next = replacePlatformFilters(cur, [composite('c2', 'new')] as CompositeFilterElement[], 'chzzk');
        expect(next.map(f => f.id)).toEqual(['t1', 'c2']);
    });
    it('가져온 것끼리 겹치면 하나만', () => {
        const dup = [composite('c2', 'same'), composite('c3', 'same')] as CompositeFilterElement[];
        dup[1].filters[0].id = dup[0].filters[0].id;
        expect(replacePlatformFilters(cur, dup, 'chzzk').map(f => f.id)).toEqual(['t1', 'c2']);
    });
});
