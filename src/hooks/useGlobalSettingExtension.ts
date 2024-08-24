import { useEffect, useReducer, useState } from "react";
import { SettingReducer, SettingInterface } from "twitch-badge-collector-cc";
import browser from 'webextension-polyfill';

export default function useExtensionGlobalSetting(extStorageReadOnly: boolean = true) {
    const [globalSetting, dispatchGlobalSetting] = useReducer(SettingReducer.settingReducer, {} as SettingInterface.Setting);
    const [globalSettingUpdated, setGlobalSettingUpdated] = useState(false);

    const updateSetting = (setting: SettingInterface.Setting) => {
        dispatchGlobalSetting({
            type: 'SET_MULTIPLE',
            value: setting
        });

        setGlobalSettingUpdated(true);
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
            .then((res) => {
                updateSetting({
                    position: res.position,
                    pointBoxAuto: res.pointBoxAuto,
                    darkTheme: res.darkTheme,
                    chatTime: res.chatTime,
                    maximumNumberChats: res.maximumNumberChats as number,
                    advancedFilter: res.advancedFilter,
                    platform: res.platform,
                } as SettingInterface.Setting);
            });
    }, []);

    useEffect(() => {
        if (extStorageReadOnly) return;

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

    }, [globalSetting]);

    return { globalSetting, dispatchGlobalSetting };
}