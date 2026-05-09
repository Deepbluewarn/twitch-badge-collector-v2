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
import AlertContainer from "@/components/AlertContainer";
import { FilterGroupContext } from "@/context/FilterGroup";
import '@/translate/i18n';
import { Box } from "@mui/material";
import SettingPageDrawer from "@/components/drawer/SettingPageDrawer";

function App() {
  const { globalSetting, dispatchGlobalSetting } = useExtensionGlobalSetting();
  const { alerts, setAlerts, addAlert } = useAlert();
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
    <ThemeProvider theme={useCustomTheme(globalSetting.darkTheme === 'on')}>
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
          <Route
            path="/filter"
            element={
              <DrawerTemplate
                title={''}
                name="filter"
                drawer={<SettingPageDrawer />}
              >
                <Filter />
              </DrawerTemplate>
            }
          />
          <Route
            path="*"
            element={<Navigate to="/filter" replace />}
          />
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
