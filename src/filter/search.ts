import type { CompositeFilterElement } from "@/interfaces/filter";

/**
 * 필터 목록 검색 — 조건 값(배지는 이름), 채널 이름·ID, 메모 중 어디에든 검색어가 들어 있으면 맞다.
 * 대소문자는 가리지 않는다. 빈 검색어는 모두 맞다.
 */
export function matchesFilterSearch(f: CompositeFilterElement, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const has = (v?: string) => !!v && v.toLowerCase().includes(q);
    return f.filters.some(a => has(a.category === 'badge' ? a.badgeName || a.value : a.value))
        || has(f.filterChannelName) || has(f.filterChannelId) || has(f.filterNote);
}
