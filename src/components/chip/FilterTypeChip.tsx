import { FilterType, TypeArr } from "../../interfaces/filter";

/** 포함 → 제외 → 꺼짐 → 포함. 필터 목록의 상태 태그와 배지 고르기가 같이 쓴다. */
export function rotateFilterType(current: FilterType) {
    const current_index = TypeArr.indexOf(current);
    if (current_index === -1) return TypeArr[0];

    const nextIndex = (current_index + 1) % TypeArr.length;
    return TypeArr[nextIndex] as FilterType;
}

export function chipColor(type: FilterType) {
    return type === 'include' ? 'success' : type === 'exclude' ? 'error' : 'default';
}
