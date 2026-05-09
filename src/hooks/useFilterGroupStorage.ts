import { SettingInterface } from "@/interfaces/setting";
import React, { useEffect, useRef } from "react";
import useFilterGroup from "./useFilterGroup";
/**
 * 
 * @param env 
 * @param readOnly 변경된 globalSetting 값을 확장 프로그램 storage 에 저장할지 여부를 설정합니다. 
 *                  true 로 설정하면 Extension 의 storage 에 새로운 값을 저장하지 않습니다.
 *                  만약 storage.onChanged Event 의 callback 함수 내에서 값을 업데이트 해야 하는 경우 true 로 설정하세요.
 *                  @default true
 * @returns 
 */
export default function useFilterGroupStorage(_platform: SettingInterface['platform'], extStorageReadOnly: boolean = true) {
    const _filterGroupHooks = useFilterGroup();
    const isFilterInitialized = useRef(false);


    React.useEffect(() => {
        if (isFilterInitialized.current && !extStorageReadOnly) {
            browser.storage.local.set({ filter: _filterGroupHooks.filterGroup });
        }

        _filterGroupHooks.filterGroupRef.current = _filterGroupHooks.filterGroup.filter(af => af.platform === _platform);
    }, [_filterGroupHooks.filterGroup]);

    useEffect(() => {
        browser.storage.local.get("filter").then((res) => {
            _filterGroupHooks.setFilterGroup(res.filter);
            isFilterInitialized.current = true;
        });
    }, []);

    return _filterGroupHooks;
}