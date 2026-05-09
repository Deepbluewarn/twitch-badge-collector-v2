import { ChatInfo } from "@/interfaces/chat";
import { CompositeFilterElement } from "@/interfaces/filter";

/**
 * Filter Group이 한 채팅을 Container에 admit할지 판정한다.
 *
 * @param chat 평가 대상 채팅
 * @param filterGroup 사용자의 Filter Group
 * @param channelId 현재 Host page의 채널 ID. composite Channel Scope 게이팅에 사용
 * @returns true면 admit, false면 drop
 */
export function evaluateFilterGroup(
    chat: ChatInfo,
    filterGroup: CompositeFilterElement[],
    channelId?: string | null
): boolean {
    if (typeof filterGroup === 'undefined' || filterGroup.length === 0) return false;

    let res = false;

    for (let composite of filterGroup) {
        if (composite.filterChannelId && composite.filterChannelId !== channelId) {
            // 채널 전용 필터는 채널 ID 값이 일치해야 함.
            continue;
        }
        const filterMatched = composite.filters.every((filter) => {
            let filterMatchedRes = false;

            if (filter.type === 'sleep') {
                return filterMatchedRes;
            }

            if (filter.category === "badge") {
                const channelMisMatch =
                    (chat.channelLogin && filter.channelLogin) &&
                    (chat.channelLogin !== filter.channelLogin);
                const channelIdMisMatch =
                    (chat.channelId && filter.channelId) &&
                    (chat.channelId !== filter.channelId);

                if (channelMisMatch || channelIdMisMatch) {
                    // 트위치 전용. 구독이나 비트 뱃지가 해당 채널에서만 동작하도록..
                    filterMatchedRes = false;
                } else {
                    filterMatchedRes = chat.badges.some(badge => {
                        return badge === filter.value || badge === filter.badgeSetId;
                    });
                }
            } else if (filter.category === "name") {
                filterMatchedRes = chat.loginName.toLowerCase() === filter.value.toLowerCase() ||
                    chat.nickName.toLowerCase() === filter.value.toLowerCase();
            } else if (filter.category === "keyword") {
                filterMatchedRes = chat.textContents.some(text => text !== null ? text.includes(filter.value) : false);
            }

            if (filter.type === 'exclude') {
                filterMatchedRes = !filterMatchedRes;
            }

            return filterMatchedRes;
        });

        if (filterMatched) {
            if (composite.filterType === 'include') {
                // include면 뒤에 exclude로 뒤집힐 수 있으니 계속 평가.
                res = true;
            } else if (composite.filterType === 'exclude') {
                // exclude면 즉시 드롭하고 단락.
                res = false;
                break;
            } else if (composite.filterType === 'sleep') {
                // sleep이면 res 변경 없이 다음 composite로.
            }
        }
    }

    return res;
}
