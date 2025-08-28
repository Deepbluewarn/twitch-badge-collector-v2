import { SettingInterface } from "@interfaces/setting";
import React, { useEffect, useRef } from "react";
import browser from 'webextension-polyfill';
import useArrayFilter from "./useArrayFilter";
/**
 * 
 * @param env 
 * @param readOnly 변경된 globalSetting 값을 확장 프로그램 storage 에 저장할지 여부를 설정합니다. 
 *                  true 로 설정하면 Extension 의 storage 에 새로운 값을 저장하지 않습니다.
 *                  만약 storage.onChanged Event 의 callback 함수 내에서 값을 업데이트 해야 하는 경우 true 로 설정하세요.
 *                  @default true
 * @returns 
 */
export default function useArrayFilterExtension(_platform: SettingInterface['platform'], extStorageReadOnly: boolean = true) {
    const _arrayFilterHooks = useArrayFilter();
    const isFilterInitialized = useRef(false);


    React.useEffect(() => {
        if (isFilterInitialized.current && !extStorageReadOnly) {
            browser.storage.local.set({ filter: _arrayFilterHooks.arrayFilter });
        }

        _arrayFilterHooks.arrayFilterRef.current = _arrayFilterHooks.arrayFilter.filter(af => af.platform === _platform);
    }, [_arrayFilterHooks.arrayFilter]);

    useEffect(() => {
        browser.storage.local.get("filter").then((res) => {
            _arrayFilterHooks.setArrayFilter(res.filter);
            isFilterInitialized.current = true;
        });
    }, []);

    return _arrayFilterHooks;
}