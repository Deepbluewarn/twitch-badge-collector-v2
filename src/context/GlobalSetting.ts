import { SettingInterface, SettingReducerAction } from "@interfaces/setting";
import React, { useContext } from "react";

export const GlobalSettingContext = React.createContext<{globalSetting: SettingInterface, dispatchGlobalSetting: React.Dispatch<SettingReducerAction>} | undefined>(undefined);

export function useGlobalSettingContext() {
    const context = useContext(GlobalSettingContext);
    
    if (typeof context === 'undefined') {
        throw new Error("GlobalSettingContext must be within GlobalSettingProvider");
    }

    return context;
}