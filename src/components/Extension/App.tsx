import useAlert from "@/hooks/useAlert";
import useExtensionGlobalSetting from "@/hooks/useGlobalSettingExtension";
import { SettingInterface } from "@/interfaces/setting";
import { addStorageUpdateListener } from "@/utils/utils-browser";
import { useEffect } from "react";
import { BaseContainer } from "@/content-scripts/base/container";
import { Handle } from "@/content-scripts/base/handler";
import { GlobalSettingContext } from "@/context/GlobalSetting";
import { AlertContext } from "@/context/Alert";
import Local from "./Local";
import { ChatExtractor } from "@/content-scripts/base/chatExtractor";

export default function App({
    type,
    videoSelector,
    extractor,
} : {
    type: SettingInterface['platform'],
    videoSelector?: string;
    extractor: ChatExtractor,
}) {
    const { globalSetting, dispatchGlobalSetting } = useExtensionGlobalSetting();
    const { alerts, setAlerts, addAlert } = useAlert();

    useEffect(() => {
        addStorageUpdateListener((key, newValue) => {
            switch (key) {
                case 'position':
                    BaseContainer.updatePosition(type, newValue)
                    break;
                case 'containerRatio':
                    Handle.updateContainerRatio(type, newValue, Handle.getPosition(type))
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
                    extractor={extractor}
                />
            </AlertContext.Provider>
        </GlobalSettingContext.Provider>
    );
}