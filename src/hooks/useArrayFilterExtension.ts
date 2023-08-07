import React, { useEffect, useRef } from "react";
import { useArrayFilter } from "twitch-badge-collector-cc";
import browser from 'webextension-polyfill';
/**
 * 
 * @param env 
 * @param readOnly 변경된 globalSetting 값을 확장 프로그램 storage 에 저장할지 여부를 설정합니다. 
 *                  true 로 설정하면 Extension 의 storage 에 새로운 값을 저장하지 않습니다.
 *                  만약 storage.onChanged Event 의 callback 함수 내에서 값을 업데이트 해야 하는 경우 true 로 설정하세요.
 *                  @default true
 * @returns 
 */
export default function useArrayFilterExtension(extStorageReadOnly: boolean = true) {
    const { arrayFilter, arrayFilterRef, setArrayFilter, addArrayFilter, checkFilter } = useArrayFilter()
    const isFilterInitialized = useRef(false);


    React.useEffect(() => {
        if (isFilterInitialized.current && !extStorageReadOnly) {
            browser.storage.local.set({ filter: arrayFilter });
        }

        arrayFilterRef.current = arrayFilter;
    }, [arrayFilter]);

    useEffect(() => {
        browser.storage.local.get("filter").then((res) => {
            setArrayFilter(res.filter);
            isFilterInitialized.current = true;
        });
    }, []);

    return { arrayFilter, arrayFilterRef, setArrayFilter, addArrayFilter, checkFilter };
}