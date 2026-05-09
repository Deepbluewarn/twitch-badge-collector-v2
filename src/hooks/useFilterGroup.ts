import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAlertContext } from "../context/Alert";
import { ChatInfo } from "../interfaces/chat";
import { CompositeFilterElement } from "../interfaces/filter";
import { SettingInterface } from "@/interfaces/setting";
import { atomicFiltersEqual } from "@/utils/utils-common";
import { evaluateFilterGroup } from "@/filter/evaluate";
import { validateFilterList } from "@/filter/validate";

/**
 * 사용자의 Filter Group 상태를 관리한다.
 *
 * - 마운트 시 `browser.storage.local`의 `filter` 키에서 필터를 로드
 * - filterGroup이 바뀌면 (extStorageReadOnly=false인 경우) storage에 다시 저장
 * - `filterGroupRef`는 *현재 platform*으로 필터링된 부분집합만 보유.
 *   `evaluateFilterGroup`이 React 외부의 MutationObserver 콜백에서 호출되어
 *   render 사이의 closure가 stale state를 잡지 않도록 하기 위함.
 *
 * @param platform 현재 Host page의 platform. ref에 담길 필터를 이 platform으로 한정.
 * @param extStorageReadOnly true면 mutation을 storage에 다시 쓰지 않음.
 *   `storage.onChanged` 콜백 안에서 호출할 때 무한 루프 방지용. 기본 true.
 */
export default function useFilterGroup(
    platform: SettingInterface['platform'],
    extStorageReadOnly: boolean = true,
) {
    const [filterGroup, setFilterGroup] = React.useState<CompositeFilterElement[]>([]);
    const filterGroupRef = useRef<CompositeFilterElement[]>([]);
    const isFilterInitialized = useRef(false);
    // 자기 storage write가 일으킨 echo로 listener가 다시 setState하는 무한 루프 방지용.
    // write 시작 전에 true로 set, write 완료 후 false. listener는 true면 skip.
    const writingRef = useRef(false);
    const { addAlert } = useAlertContext();
    const { t } = useTranslation();

    // 마운트 시 storage에서 초기 로드 + 외부 변경 구독.
    // 다른 entrypoint(예: setting 페이지)가 'filter'를 수정하면 자동 반영.
    useEffect(() => {
        browser.storage.local.get("filter").then((res) => {
            setFilterGroup(res.filter);
            isFilterInitialized.current = true;
        });

        const listener = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => {
            if (!('filter' in changes)) return;
            if (writingRef.current) return; // 자기 write의 echo는 무시
            const next = changes.filter.newValue as CompositeFilterElement[] | undefined;
            if (!next) return;
            setFilterGroup(next);
        };
        browser.storage.local.onChanged.addListener(listener);
        return () => browser.storage.local.onChanged.removeListener(listener);
    }, []);

    // filterGroup 변경 시: (쓰기 모드면) storage 저장 + ref를 현재 platform으로 한정해 동기화
    useEffect(() => {
        filterGroupRef.current = filterGroup.filter(af => af.platform === platform);
        if (!isFilterInitialized.current || extStorageReadOnly) return;
        writingRef.current = true;
        browser.storage.local.set({ filter: filterGroup }).then(() => {
            writingRef.current = false;
        });
    }, [filterGroup, platform, extStorageReadOnly]);

    const addCompositeFilters = (newFilters: CompositeFilterElement[]) => {
        for (let newFilter of newFilters) {
            const empty = newFilter.filters.some(row => row.value === '');

            if (empty) {
                addAlert({
                    message: t('alert.no_value_filter'),
                    serverity: 'warning'
                });
                return false;
            }

            setFilterGroup(afLists => {
                for (let af of afLists) {
                    if (
                        atomicFiltersEqual(af.filters, newFilter.filters) &&
                        af.platform === newFilter.platform &&
                        (af.filterChannelId ?? "") === (newFilter.filterChannelId ?? "")
                    ) {
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
                message: t(`alert.filter_validation.${result.error}`),
                serverity: 'warning'
            });
            return false;
        }
        setFilterGroup(afLists => {
            const exists = afLists.some(af => af.id === newFilter.id);
            if (exists) {
                return afLists.map(af => af.id === newFilter.id ? newFilter : af);
            } else {
                return [...afLists, newFilter];
            }
        });

        return true;
    }

    /** CompositeFilterElement의 특정 하위 필터(id) 삭제 */
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
