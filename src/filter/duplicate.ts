import type { CompositeFilterElement } from "@/interfaces/filter";

/**
 * 같은 조건의 필터 찾기 — 플랫폼·채널이 같고 조건(종류·맞음/아님/꺼짐·값)이 순서와 상관없이 같으면 같은 필터.
 * 포함/제외/꺼짐 상태는 보지 않는다: [포함] A와 [제외] A가 같이 있으면 제외가 늘 이겨 포함은 쓸모가 없다.
 * 가져오기를 여러 번 하면 잘 생긴다(새로 추가할 땐 useFilterGroup이 막는다).
 */
export const filterSignature = (f: CompositeFilterElement) => JSON.stringify([
    f.platform,
    f.filterChannelId ?? '',
    f.filters.map(a => `${a.category}\u0001${a.type}\u0001${a.value}`).sort(),
]);

/** 다른 필터와 조건이 같은 필터들의 id (같은 묶음의 모든 필터) */
export function findDuplicateFilterIds(rows: CompositeFilterElement[]): Set<string> {
    const groups = new Map<string, string[]>();
    for (const r of rows) {
        const key = filterSignature(r);
        groups.set(key, [...(groups.get(key) ?? []), r.id]);
    }
    const ids = new Set<string>();
    for (const g of groups.values()) if (g.length > 1) g.forEach(id => ids.add(id));
    return ids;
}
