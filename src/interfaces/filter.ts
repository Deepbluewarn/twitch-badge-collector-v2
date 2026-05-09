import { SettingInterface } from "./setting";

export const TypeArr = ["include", "exclude", "sleep"] as const;
export type FilterType = typeof TypeArr[number];

export const ArrayFilterCategoryArr = ["badge", "name", "keyword"] as const;
export type ArrayFilterCategory = typeof ArrayFilterCategoryArr[number];

export interface ArrayFilterInterface {
    [index : string] : string | undefined,
    category: ArrayFilterCategory;
    id: string;
    type: FilterType;
    value: string;
    badgeName?: string;
    badgeSetId?: string; // for Twitch
    channelLogin?: string; // 일단은 트위치 전용 (채널 배지 구분용)
    channelId?: string; // 트위치 다시보기에서는 채널 login이 없고 id만 있더라
}

export interface ArrayFilterListInterface {
    filterType: FilterType;
    id: string;
    filterNote: string;
    filterChannelId?: string; // 채널별 필터 적용 기능
    filterChannelName?: string;
    filters: ArrayFilterInterface[];
    platform: SettingInterface['platform'];
}

export interface ArrayFilterMessageInterface {
    from: string;
    filter: ArrayFilterListInterface[];
    msgId: string;
}
