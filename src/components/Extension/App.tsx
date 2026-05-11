import useAlert from "@/hooks/useAlert";
import useExtensionGlobalSetting from "@/hooks/useGlobalSettingExtension";
import { SettingInterface } from "@/interfaces/setting";
import { addStorageUpdateListener } from "@/utils/utils-browser";
import { useEffect } from "react";
import { Handle } from "@/content-scripts/base/handler";
import { applyPosition, applyRatio } from "@/content-scripts/base/layout";
import { GlobalSettingContext } from "@/context/GlobalSetting";
import { AlertContext } from "@/context/Alert";
import Local from "./Local";
import { PlatformAdapter } from "@/platform";

export default function App({
    type,
    videoSelector,
    adapter,
} : {
    type: SettingInterface['platform'],
    videoSelector?: string;
    adapter: PlatformAdapter,
}) {
    const { globalSetting, dispatchGlobalSetting } = useExtensionGlobalSetting();
    const { alerts, setAlerts, addAlert } = useAlert();

    useEffect(() => {
        addStorageUpdateListener((key, newValue) => {
            switch (key) {
                case 'position':
                    applyPosition(type, newValue)
                    break;
                case 'containerRatio':
                    applyRatio(type, newValue, Handle.getPosition(type))
                    break;
            }
        })
    }, []);

    return (
        <GlobalSettingContext.Provider
            value={{ globalSetting, dispatchGlobalSetting }}
        >
            <AlertContext.Provider value={{ alerts, setAlerts, addAlert }}>
                <Local
                    type={type}
                    videoSelector={videoSelector}
                    adapter={adapter}
                />
            </AlertContext.Provider>
        </GlobalSettingContext.Provider>
    );
}