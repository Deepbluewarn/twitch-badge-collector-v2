import { FilterType } from "./filter";
import { Version } from "./api/twitchAPI";

export interface ChatInfoContextInterface {
    globalBadges: Map<string, Version>,
    channelBadges: Map<string, Version>,
    cheerMotes: Map<string, any>,
    emoteSets: Map<string, any>
}
/**
 * ChatInfo에서 host DOM으로부터 값을 *확정하지 못한* 필드. Filter Category와 1:1 대응.
 *
 * "빈 값"과 "모르는 값"을 구별하기 위한 3번째 상태. 예: chzzk가 닉네임 selector를
 * 깨뜨리면 nickName은 빈 문자열이 되는데, 그걸 "닉네임이 ''인 사용자"로 취급하면
 * `name` + `exclude` atomic이 부정 연산으로 true가 되어 "이 사람 제외" 필터가
 * 전원 매칭으로 뒤집힌다. evaluateFilterGroup은 여기 실린 Category를 참조하는
 * composite을 평가에서 아예 제외한다.
 */
export type UnavailableChatField = 'name' | 'keyword' | 'badge';

export interface ChatInfo {
    badges: string[];
    textContents: string[];
    loginName: string;
    nickName: string;
    channelLogin?: string;
    channelId?: string;
    /**
     * 값을 확정하지 못한 필드 목록. 없거나 빈 배열이면 모든 필드가 신뢰 가능.
     * 영속화(chat persistence)를 타므로 optional + 순수 배열 유지 (Set 금지).
     */
    unavailable?: UnavailableChatField[];
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