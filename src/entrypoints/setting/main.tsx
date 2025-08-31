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
import useArrayFilterExtension from "@/hooks/useArrayFilterExtension";
import useAlert from "@/hooks/useAlert";
import useChzzkAPI from "@/hooks/useChzzkAPI";
import { GlobalSettingContext } from "@/context/GlobalSetting";
import { AlertContext } from "@/context/Alert";
import { useCustomTheme } from "@/hooks/useCustomTheme";
import { TwitchAPIContext } from "@/context/TwitchAPIContext";
import useTwitchAPI from "@/hooks/useTwitchAPI";
import { ChzzkAPIContext } from "@/context/ChzzkAPIContext";
import AlertContainer from "@/components/AlertContainer";
import { ArrayFilterContext } from "@/context/ArrayFilter";
import '@/translate/i18n';
import { Box } from "@mui/material";
import SettingPageDrawer from "@/components/drawer/SettingPageDrawer";

function App() {
  const { globalSetting, dispatchGlobalSetting } = useExtensionGlobalSetting();
  const { alerts, setAlerts, addAlert } = useAlert();
  const twitchAPI = useTwitchAPI();
  const chzzkAPI = useChzzkAPI();
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
            <TwitchAPIContext.Provider value={twitchAPI}>
              <ChzzkAPIContext.Provider value={chzzkAPI}>
                {globalStyles}
                <AlertContainer />
                <Router />
              </ChzzkAPIContext.Provider>
            </TwitchAPIContext.Provider>
          </QueryClientProvider>
        </AlertContext.Provider>
      </GlobalSettingContext.Provider>
    </ThemeProvider>
  );
}

function Router() {
  const _arrayFilterHooks = useArrayFilterExtension('twitch', false);

  return (
    <ArrayFilterContext.Provider value={_arrayFilterHooks}>
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
    </ArrayFilterContext.Provider>
  );
}
ReactDOM.createRoot(document.getElementById("root") as Element).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
