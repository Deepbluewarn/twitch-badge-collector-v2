import type { AtomicFilterElement, CompositeFilterElement } from '@/interfaces/filter';
import { LEGACY_VERIFIED_MARK_NAME, VERIFIED_MARK_GROUP, VERIFIED_MARK_NAME, VERIFIED_MARK_URL } from '@/platform/chzzk-verified';

/**
 * 종류가 나뉘기 전의 "인증 마크" 배지 조건인가. 이름으로 찾는다 — URL(공식 마크)은 나뉜 뒤에도 공식 마크가
 * 그대로 쓰므로 URL만으로는 옛 조건인지 알 수 없다. 이름이 없는 아주 오래된 조건은 URL로 본다.
 */
function isLegacyVerified(f: AtomicFilterElement): boolean {
    if (f.category !== 'badge') return false;
    if (f.badgeName) {
        const sep = f.badgeName.indexOf(':');
        const name = (sep >= 0 ? f.badgeName.slice(sep + 1) : f.badgeName).trim();
        return name === LEGACY_VERIFIED_MARK_NAME;
    }
    return f.value === VERIFIED_MARK_URL.OFFICIAL;
}

function asPartner(f: AtomicFilterElement): AtomicFilterElement {
    const sep = f.badgeName?.indexOf(':') ?? -1;
    const group = sep > 0 ? f.badgeName!.slice(0, sep).trim() : VERIFIED_MARK_GROUP;
    return { ...f, value: VERIFIED_MARK_URL.PARTNER, badgeName: `${group}: ${VERIFIED_MARK_NAME.PARTNER}` };
}

/**
 * 예전 "인증 마크" 조건을 "파트너 마크"로 바꾼다. 종류가 나뉘기 전의 인증 마크(초록)가 지금의 파트너 마크다 —
 * 챌린저는 새로 생겼고 공식 마크는 따로였다. 조건 자리에서 값과 이름만 바꾸고(있음, 없음 그대로) 필터는
 * 나누지 않는다. 치지직 필터만 본다. 바꾼 뒤엔 이름이 달라 다시 돌려도 그대로다.
 */
export function migrateVerifiedMarkFilters(list: CompositeFilterElement[]): { list: CompositeFilterElement[]; changed: boolean } {
    let changed = false;
    const out = list.map(composite => {
        if (composite.platform !== 'chzzk' || !composite.filters.some(isLegacyVerified)) return composite;
        changed = true;
        return { ...composite, filters: composite.filters.map(f => isLegacyVerified(f) ? asPartner(f) : f) };
    });
    return { list: out, changed };
}
