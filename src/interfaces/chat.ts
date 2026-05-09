import { FilterType } from "./filter";
import { Version } from "./api/twitchAPI";

export interface ChatInfoContextInterface {
    globalBadges: Map<string, Version>,
    channelBadges: Map<string, Version>,
    cheerMotes: Map<string, any>,
    emoteSets: Map<string, any>
}
export interface ChatInfo {
    badges: string[];
    textContents: string[];
    loginName: string;
    nickName: string;
    channelLogin?: string;
    channelId?: string;
}
export interface ChatExtractor {
    extract(node: Node): ChatInfo | undefined;
}
export interface BorderColors {
    [index : string] : string,
    PRIMARY: string,
    BLUE: string,
    GREEN: string,
    ORANGE: string,
    PURPLE: string,
}
export interface BadgeInterface {
    id: string;
    badgeImage: BadgeUrls;
    channel: string;
    note: string;
    badgeName: string;
    filterType: FilterType;
    badgeSetId: string; // for Twitch
    channelLogin?: string;
    channelId?: string;
}
export interface BadgeUrls {
    badge_img_url_1x: string;
    badge_img_url_2x: string;
    badge_img_url_4x: string;
}