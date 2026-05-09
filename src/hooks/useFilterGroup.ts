import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAlertContext } from "../context/Alert";
import { ChatInfo } from "../interfaces/chat";
import { CompositeFilterElement } from "../interfaces/filter";
import { atomicFiltersEqual } from "@/utils/utils-common";
import { evaluateFilterGroup } from "@/filter/evaluate";
import { FilterValidationError, validateFilterList } from "@/filter/validate";

const validationErrorMessages: Record<FilterValidationError, string> = {
    missing_filter: '필터 객체가 없습니다.',
    missing_id: '필터 id가 없습니다.',
    missing_filter_type: '필터 타입이 없습니다.',
    missing_sub_filters: '하위 필터가 없습니다.',
    empty_sub_filter_value: '하위 필터 값이 비어 있습니다.',
};

/**
 * 
 * @param env 
 * @param readOnly 변경된 globalSetting 값을 확장 프로그램 storage 에 저장할지 여부를 설정합니다. 
 *                  true 로 설정하면 Extension 의 storage 에 새로운 값을 저장하지 않습니다.
 *                  만약 storage.onChanged Event 의 callback 함수 내에서 값을 업데이트 해야 하는 경우 true 로 설정하세요.
 *                  @default true
 * @returns 
 */
export default function useFilterGroup() {
    const [ filterGroup, setFilterGroup ] = React.useState<CompositeFilterElement[]>([]);
    const filterGroupRef = React.useRef<CompositeFilterElement[]>([]);
    const { addAlert } = useAlertContext();
    const { t } = useTranslation();

    useEffect(() => {
        filterGroupRef.current = filterGroup;
    }, [filterGroup]);

    const addCompositeFilters = (newFilters: CompositeFilterElement[]) => {
        for(let newFilter of newFilters){
            const empty = newFilter.filters.some(row => row.value === '');

            if(empty) {
                addAlert({
                    message: t('alert.no_value_filter'),
                    serverity: 'warning'
                });
                return false;
            }
    
            setFilterGroup(afLists => {
                for (let af of afLists) {
                    if(
                        atomicFiltersEqual(af.filters, newFilter.filters) && 
                        af.platform === newFilter.platform &&
                        (af.filterChannelId ?? "") === (newFilter.filterChannelId ?? "")
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

    const upsertCompositeFilter = (newFilter: CompositeFilterElement) => {
        const result = validateFilterList(newFilter);

        if (!result.valid) {
            addAlert({
                message: validationErrorMessages[result.error],
                serverity: 'warning'
            });
            return false;
        }
        setFilterGroup(afLists => {
            const exists = afLists.some(af => af.id === newFilter.id);
            if (exists) {
                // id가 같은 필터가 있으면 업데이트
                return afLists.map(af => af.id === newFilter.id ? newFilter : af);
            } else {
                // 없으면 추가
                return [...afLists, newFilter];
            }
        });

        return true;
    }

    /**
     * CompositeFilterElement의 특정 하위 필터(id) 삭제
     */
    const removeSubFilter = (filterListId: string, subFilterId: string) => {
        setFilterGroup(afLists =>
            afLists.map(list =>
                list.id === filterListId
                    ? { ...list, filters: list.filters.filter(f => f.id !== subFilterId) }
                    : list
            )
        );
    };

    /**
     * CompositeFilterElement의 특정 필드 값 제거
     * @param filterListId 필터 리스트 id
     * @param fieldName 제거할 필드 이름 (예: 'filterChannelName', 'filterChannelId', 'filterNote')
     */
    const removeFilterField = (filterListId: string, fieldName: keyof CompositeFilterElement) => {
        setFilterGroup(afLists =>
            afLists.map(list =>
                list.id === filterListId
                    ? { ...list, [fieldName]: undefined }
                    : list
            )
        );
    };

    const checkFilter = (chat: ChatInfo, channelId?: string | null) =>
        evaluateFilterGroup(chat, filterGroupRef.current, channelId);

    return {
        filterGroup, filterGroupRef, setFilterGroup, addCompositeFilters,
        upsertCompositeFilter, checkFilter,
        removeSubFilter, removeFilterField,
    };
}