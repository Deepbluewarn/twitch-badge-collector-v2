import { CompositeFilterElement } from "@/interfaces/filter";

export type FilterValidationError =
    | 'missing_filter'
    | 'missing_id'
    | 'missing_filter_type'
    | 'missing_sub_filters'
    | 'empty_sub_filter_value';

export type FilterValidationResult =
    | { valid: true }
    | { valid: false; error: FilterValidationError };

/**
 * Filter Element(composite)의 구조적 유효성을 검사한다.
 *
 * 필드 존재 여부와 nested Filter Elements의 빈 값 검사. React/i18n 의존성 없음.
 * 에러 코드만 반환하므로 호출자가 표시 방식(인라인 한글, t() 키, 로깅 등)을 결정한다.
 */
export function validateFilterList(filter: CompositeFilterElement): FilterValidationResult {
    if (!filter) return { valid: false, error: 'missing_filter' };
    if (!filter.id) return { valid: false, error: 'missing_id' };
    if (!filter.filterType) return { valid: false, error: 'missing_filter_type' };
    if (!Array.isArray(filter.filters) || filter.filters.length === 0) {
        return { valid: false, error: 'missing_sub_filters' };
    }
    for (const sub of filter.filters) {
        if (!sub.value || sub.value === '') {
            return { valid: false, error: 'empty_sub_filter_value' };
        }
    }
    return { valid: true };
}
