import React, { useContext } from "react";
import Setting, { ReducerAction } from "../interfaces/setting";

export const GlobalSettingContext = React.createContext<
  | {
      globalSetting: Setting;
      dispatchGlobalSetting: React.Dispatch<ReducerAction>;
    }
  | undefined
>(undefined);

export function useGlobalSettingContext() {
  const context = useContext(GlobalSettingContext);

  if (typeof context === "undefined") {
    throw new Error(
      "GlobalSettingContext must be within GlobalSettingProvider"
    );
  }

  return context;
}
