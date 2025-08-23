import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAlertContext } from "../context/Alert";
import { ChatInfo } from "../interfaces/chat";
import { ChatInfoObjects } from "../interfaces/chatInfoObjects";
import { ArrayFilterListInterface } from "../interfaces/filter";
import { arrayFiltersEqual } from "@utils/utils-common";

/**
 * 
 * @param env 
 * @param readOnly 변경된 globalSetting 값을 확장 프로그램 storage 에 저장할지 여부를 설정합니다. 
 *                  true 로 설정하면 Extension 의 storage 에 새로운 값을 저장하지 않습니다.
 *                  만약 storage.onChanged Event 의 callback 함수 내에서 값을 업데이트 해야 하는 경우 true 로 설정하세요.
 *                  @default true
 * @returns 
 */
export default function useArrayFilter() {
    const [ arrayFilter, setArrayFilter ] = React.useState<ArrayFilterListInterface[]>([]);
    const arrayFilterRef = React.useRef<ArrayFilterListInterface[]>([]);
    const { addAlert } = useAlertContext();
    const { t } = useTranslation();

    useEffect(() => {
        arrayFilterRef.current = arrayFilter;
    }, [arrayFilter]);

    const addArrayFilter = (newFilters: ArrayFilterListInterface[]) => {
        for(let newFilter of newFilters){
            const empty = newFilter.filters.some(row => row.value === '');

            if(empty) {
                addAlert({
                    message: t('alert.no_value_filter'),
                    serverity: 'warning'
                });
                return false;
            }
    
            setArrayFilter(afLists => {
                for (let af of afLists) {
                    if(
                        arrayFiltersEqual(af.filters, newFilter.filters) && 
                        af.platform === newFilter.platform &&
                        af.filterChannelId === newFilter.filterChannelId
                    ){
                        addAlert({
                            message: t('alert.filter_already_exist'),
                            serverity: 'warning'
                        });
                        return afLists;
                    }
                }
    
                return [...afLists, newFilter];
            });
        }
        return true;
    }

    /**
     * 
     * @param chat 채팅 정보 객체
     * @param chatInfoObject (트위치 전용) 채팅 배지, 이모티콘 정보
     * @param channelId (치지직 전용, 트위치는 예정) 현재 채널 ID
     * @returns 
     */
    const checkFilter = (chat: ChatInfo, chatInfoObject?: ChatInfoObjects | null, channelId?: string | null) => {
        if (typeof arrayFilterRef.current === 'undefined' || arrayFilterRef.current.length === 0) return false;

        let res = false; // true 이면 해당 chat 을 포함, false 이면 제외.

        for(let arrayFilter of arrayFilterRef.current){
            if (arrayFilter.filterChannelId && arrayFilter.filterChannelId !== channelId) {
                // 채널 전용 필터는 채널 ID 값이 일치해야 함.
                continue;
            }
            const filterMatched = arrayFilter.filters.every((filter) => {
                let filterMatchedRes = false;

                if(filter.type === 'sleep'){
                    return filterMatchedRes;
                }

                if (filter.category === "badge") {
                    if(typeof chatInfoObject === 'undefined' || !chatInfoObject){
                        const channelMisMatch = 
                            (chat.channelLogin && filter.channelLogin) && 
                            (chat.channelLogin !== filter.channelLogin);
                        const channelIdMisMatch = 
                            (chat.channelId && filter.channelId) &&
                            (chat.channelId !== filter.channelId);
                        
                        if (channelMisMatch || channelIdMisMatch) {
                            // 트위치 전용. 구독이나 비트 뱃지가 해당 채널에서만 동작하도록..
                            filterMatchedRes = false
                        } else {
                            filterMatchedRes = chat.badges.some(badge => {
                                return badge === filter.value || badge === filter.badgeSetId;
                            });
                        }
                    }else{
                        filterMatchedRes = chat.badges.some(badge_str => {
                            const badge = chatInfoObject.channelBadges.get(badge_str) || chatInfoObject.globalBadges.get(badge_str);
                            
                            if (!badge) return false;
    
                            const badge_uuid = new URL(badge.image_url_1x).pathname.split('/')[3];
    
                            return badge_uuid === filter.value;
                        });
                    }
                    
                } else if (filter.category === "name") {
                    filterMatchedRes = chat.loginName.toLowerCase() === filter.value.toLowerCase() ||
                        chat.nickName.toLowerCase() === filter.value.toLowerCase();
                } else if (filter.category === "keyword") {
                    filterMatchedRes = chat.textContents.some(text => text !== null ? text.includes(filter.value) : false);
                }

                if(filter.type === 'exclude'){
                    filterMatchedRes = !filterMatchedRes;
                }

                return filterMatchedRes;
            });

            if(filterMatched){
                if(arrayFilter.filterType === 'include'){
                    // arrayFilter 가 include 이면 exclude 로 설정된 
                    // 다른 ArrayFilter 가 있는지 찾아야 하므로 계속 진행.
                    res = true; 
                }else if(arrayFilter.filterType === 'exclude'){
                    // arrayFilter 가 exclude 이면 다른 ArrayFilter 를 확인하지 않고 종료.
                    res = false; 
                    break;
                }else if(arrayFilter.filterType === 'sleep'){
                    // arrayFilter 가 sleep 이면 다른 ArrayFilter 를 확인하기 위해 계속 진행.
                    // sleep 으로 설정된 필터일때는 res 의 값을 바꾸지 않음.
                }
            }
        }

        return res;
    };

    return { arrayFilter, arrayFilterRef, setArrayFilter, addArrayFilter, checkFilter };
}