import { describe, it, expect } from 'vitest';
import type { AtomicFilterElement, CompositeFilterElement } from '@/interfaces/filter';
import { VERIFIED_MARK_URL } from '@/platform/chzzk-verified';
import { migrateVerifiedMarkFilters } from './verified-migration';

const legacy = (type: AtomicFilterElement['type'] = 'include'): AtomicFilterElement => ({
    category: 'badge', id: 'a1', type, value: VERIFIED_MARK_URL.OFFICIAL, badgeName: '역할: 인증 마크',
});
const keyword: AtomicFilterElement = { category: 'keyword', id: 'k1', type: 'include', value: 'ㅋ' };
const composite = (filters: AtomicFilterElement[], over: Partial<CompositeFilterElement> = {}): CompositeFilterElement => ({
    filterType: 'include', id: 'c1', filterNote: '메모', filters, platform: 'chzzk', markerColor: '#ff0000', ...over,
});

describe('migrateVerifiedMarkFilters', () => {
    it('예전 "인증 마크" 조건을 그 자리에서 파트너 마크로 — 있음, 없음, id, 다른 조건은 그대로', () => {
        for (const type of ['include', 'exclude'] as const) {
            const { list, changed } = migrateVerifiedMarkFilters([composite([legacy(type), keyword])]);
            expect(changed).toBe(true);
            expect(list).toEqual([composite([
                { ...legacy(type), value: VERIFIED_MARK_URL.PARTNER, badgeName: '역할: 파트너 마크' },
                keyword,
            ])]);
        }
    });

    it('다른 필터, 트위치, 이미 바꾼 필터, 새 공식 마크 필터는 그대로 — 다시 돌려도 바뀌지 않는다', () => {
        const other = composite([keyword], { id: 'c2' });
        const twitch = composite([legacy()], { id: 'c3', platform: 'twitch' });
        const official = composite([{ ...legacy(), badgeName: '역할: 공식 마크' }], { id: 'c4' });
        const once = migrateVerifiedMarkFilters([other, twitch, official, composite([legacy()])]).list;
        expect(once.slice(0, 3)).toEqual([other, twitch, official]);
        const twice = migrateVerifiedMarkFilters(once);
        expect(twice.changed).toBe(false);
        expect(twice.list).toEqual(once);
    });

    it('이름 없는 아주 오래된 조건은 공식 마크 URL로 알아본다', () => {
        const { list } = migrateVerifiedMarkFilters([composite([{ ...legacy(), badgeName: undefined }])]);
        expect(list[0].filters[0]).toMatchObject({ value: VERIFIED_MARK_URL.PARTNER, badgeName: '역할: 파트너 마크' });
    });
});
