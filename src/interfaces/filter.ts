import { SettingInterface } from "./setting";

export const TypeArr = ["include", "exclude", "sleep"] as const;
export type FilterType = typeof TypeArr[number];

export const FilterCategoryArr = ["badge", "name", "keyword"] as const;
export type FilterCategory = typeof FilterCategoryArr[number];

/**
 * 원자형 Filter Element — Filter 트리의 잎. 채팅의 한 측면(category)을
 * 검사해 boolean을 만들고, type(include/exclude/sleep)으로 그 결과를 변형한다.
 */
export interface AtomicFilterElement {
    [index : string] : string | undefined,
    category: FilterCategory;
    id: string;
    type: FilterType;
    value: string;
    badgeName?: string;
    badgeSetId?: string; // for Twitch
    channelLogin?: string; // 일단은 트위치 전용 (채널 배지 구분용)
    channelId?: string; // 트위치 다시보기에서는 채널 login이 없고 id만 있더라
}

/**
 * 복합 Filter Element — Filter Group의 항목. 채널 스코프 + Filter Type을
 * 가지고, 내부에 AtomicFilterElement들로 구성된 Filter(AND 결합)를 보유한다.
 */
export interface CompositeFilterElement {
    filterType: FilterType;
    id: string;
    filterNote: string;
    filterChannelId?: string; // 채널별 필터 적용 기능
    filterChannelName?: string;
    filters: AtomicFilterElement[];
    platform: SettingInterface['platform'];
}

/** 사용자의 Filter Group — 평가 순서대로 정렬된 CompositeFilterElement 배열 */
export type FilterGroup = CompositeFilterElement[];

