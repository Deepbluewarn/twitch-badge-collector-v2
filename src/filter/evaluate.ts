import { ChatInfo } from "@/interfaces/chat";
import { AtomicFilterElement, CompositeFilterElement } from "@/interfaces/filter";

/**
 * 배지 atomic Filter Element가 chat의 채널 스코프와 충돌하는지.
 *
 * filter.channelLogin/channelId가 비어있으면 (= 채널 스코프 없음) 항상 false.
 * 즉 Chzzk처럼 채널 스코프 개념이 없는 platform에서는 자동으로 통과.
 * Twitch sub/cheer 배지처럼 특정 채널 한정 배지를 위한 분기.
 */
function isBadgeChannelScopeMismatch(chat: ChatInfo, atom: AtomicFilterElement): boolean {
    const loginMismatch = !!chat.channelLogin && !!atom.channelLogin && chat.channelLogin !== atom.channelLogin;
    const idMismatch = !!chat.channelId && !!atom.channelId && chat.channelId !== atom.channelId;
    return loginMismatch || idMismatch;
}

export interface FilterEvalResult {
    pass: boolean;
    /** 최종 admit한 include 그룹의 마커 색. 없으면 undefined → 호출자에서 기본색 적용. */
    markerColor?: string;
}

/**
 * Filter Group이 한 채팅을 Container에 admit할지 판정한다.
 *
 * @param chat 평가 대상 채팅
 * @param filterGroup 사용자의 Filter Group
 * @param channelId 현재 Host page의 채널 ID. composite Channel Scope 게이팅에 사용
 * @returns pass=true면 admit. markerColor는 마지막으로 admit한 include 그룹의 마커 색.
 */
export function evaluateFilterGroup(
    chat: ChatInfo,
    filterGroup: CompositeFilterElement[],
    channelId?: string | null
): FilterEvalResult {
    if (typeof filterGroup === 'undefined' || filterGroup.length === 0) return { pass: false };

    let res = false;
    let lastIncludeColor: string | undefined;

    // host DOM에서 값을 못 뽑은 Category.
    //
    // 여기서 막아야 하는 건 하나뿐이다: **exclude atomic의 부정 연산**.
    // 값을 모르면 atomic은 false가 되는데, exclude가 그걸 뒤집어 true로 만들어서
    // "이 배지 없는 사람" 같은 조건이 전원 매칭으로 변한다.
    //
    // 반대로 include atomic은 막을 필요가 없다. 값을 모르면 매칭이 안 되고, 그건
    // "이 필터로는 아무것도 못 찾았다"는 정직한 결과다. 그런데도 composite를
    // 통째로 건너뛰면, 판정이 틀렸을 때(오탐) 멀쩡히 동작하던 include 필터까지
    // 같이 꺼진다 — 사용자에게 아무 이득 없이 기능만 잃는 실패다.
    const unavailable = chat.unavailable;

    for (let composite of filterGroup) {
        if (composite.filterChannelId && composite.filterChannelId !== channelId) {
            // 채널 전용 필터는 채널 ID 값이 일치해야 함.
            continue;
        }
        if (unavailable && unavailable.length > 0
            && composite.filters.some(f => f.type === 'exclude' && unavailable.includes(f.category))) {
            // 확정 못 한 필드에 부정 연산이 걸린 composite → verdict에 영향 없음 (sleep과 동일).
            continue;
        }
        const filterMatched = composite.filters.every((filter) => {
            let filterMatchedRes = false;

            if (filter.type === 'sleep') {
                return filterMatchedRes;
            }

            if (filter.category === "badge") {
                if (isBadgeChannelScopeMismatch(chat, filter)) {
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
                lastIncludeColor = composite.markerColor;
            } else if (composite.filterType === 'exclude') {
                // exclude면 즉시 드롭하고 단락.
                res = false;
                lastIncludeColor = undefined;
                break;
            } else if (composite.filterType === 'sleep') {
                // sleep이면 res 변경 없이 다음 composite로.
            }
        }
    }

    return { pass: res, markerColor: lastIncludeColor };
}
