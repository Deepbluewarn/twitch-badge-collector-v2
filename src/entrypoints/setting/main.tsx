import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import { getQueryParams } from "@/utils/utils-common";
import globalStyles from "@/style/global";
import useExtensionGlobalSetting from "@/hooks/useGlobalSettingExtension";
import useFilterGroup from "@/hooks/useFilterGroup";
import useAlert from "@/hooks/useAlert";
import { GlobalSettingContext, useGlobalSettingContext } from "@/context/GlobalSetting";
import { AlertContext } from "@/context/Alert";
import { useCustomTheme } from "@/hooks/useCustomTheme";
import { useResolvedDarkMode } from "@/hooks/useResolvedDarkMode";
import AlertContainer from "@/components/AlertContainer";
import { FilterGroupContext } from "@/context/FilterGroup";
import Filter from "@/components/Filter";
import '@/translate/i18n';

function App() {
  const { globalSetting, dispatchGlobalSetting } = useExtensionGlobalSetting();
  const { alerts, setAlerts, addAlert } = useAlert();
  // 사용자 설정(system/light/dark)을 boolean으로 해석. 'system'이면 prefers-color-scheme 따라감.
  const isDark = useResolvedDarkMode(globalSetting.darkTheme);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        refetchOnMount: false,
      },
    },
    queryCache: new QueryCache({
      onError: () =>
        addAlert({ serverity: "error", message: '요청 실패' }),
    }),
  });

  return (
    <ThemeProvider theme={useCustomTheme(isDark)}>
      <GlobalSettingContext.Provider
        value={{ globalSetting, dispatchGlobalSetting }}
      >
        <AlertContext.Provider value={{ alerts, setAlerts, addAlert }}>
          <QueryClientProvider client={queryClient}>
            {globalStyles}
            <AlertContainer />
            <Router />
          </QueryClientProvider>
        </AlertContext.Provider>
      </GlobalSettingContext.Provider>
    </ThemeProvider>
  );
}

function Router() {
  const { globalSetting } = useGlobalSettingContext();
  const _filterGroupHooks = useFilterGroup(globalSetting.platform, false);

  return (
    <FilterGroupContext.Provider value={_filterGroupHooks}>
      <MemoryRouter initialEntries={[`/${getQueryParams("initialPath")}`]}>
        <Routes>
          <Route path="/filter" element={<Filter />} />
          <Route path="*" element={<Navigate to="/filter" replace />} />
        </Routes>
      </MemoryRouter>
    </FilterGroupContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as Element).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
