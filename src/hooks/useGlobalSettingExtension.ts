import { useEffect, useReducer, useState } from "react";
import browser from 'webextension-polyfill';
import { initialState, settingsReducer } from "../reducer/setting";
import { SettingInterface } from "@interfaces/setting";

export default function useExtensionGlobalSetting() {
    const [globalSetting, dispatchGlobalSetting] = useReducer(settingsReducer, initialState);
    const [globalSettingUpdated, setGlobalSettingUpdated] = useState(false);

    const updateSetting = (setting: SettingInterface) => {
        dispatchGlobalSetting({
            type: 'SET_MULTIPLE',
            payload: setting
        });
    };
    
    useEffect(() => {
        browser.storage.local
            .get([
                "position",
                "pointBoxAuto",
                "darkTheme",
                "chatTime",
                'maximumNumberChats',
                'advancedFilter',
                'platform',
            ])
            .then((res: Record<keyof SettingInterface, SettingInterface[keyof SettingInterface]>) => {
                updateSetting({
                    position: res.position,
                    pointBoxAuto: res.pointBoxAuto,
                    darkTheme: res.darkTheme,
                    chatTime: res.chatTime,
                    maximumNumberChats: res.maximumNumberChats as number,
                    advancedFilter: res.advancedFilter,
                    platform: res.platform,
                } as SettingInterface);

                setGlobalSettingUpdated(true)
            });
    }, []);

    useEffect(() => {
        if (!globalSettingUpdated) return;

        browser.storage.local.set({
            position: globalSetting.position,
            pointBoxAuto: globalSetting.pointBoxAuto,
            darkTheme: globalSetting.darkTheme,
            chatTime: globalSetting.chatTime,
            maximumNumberChats: globalSetting.maximumNumberChats,
            advancedFilter: globalSetting.advancedFilter,
            platform: globalSetting.platform,
        } as SettingInterface);

    }, [globalSetting, globalSettingUpdated]);

    return { globalSetting, dispatchGlobalSetting };
}