import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { useTranslation } from "react-i18next";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import { getQueryParams } from "./utils";
import globalStyles from "./style/global";
import i18n, { 
  Context as TBCContext,
  useCustomTheme,
  useArrayFilter,
  useGlobalSetting,
  useAlert,
  useTwitchAPI,
  Filter, 
  ChatSaver,
  DrawerTemplate,
  SettingPageDrawer,
} from 'twitch-badge-collector-cc';

function App() {
  const { globalSetting, dispatchGlobalSetting } = useGlobalSetting('Extension');
  const { alerts, setAlerts, addAlert } = useAlert();
  process.env.BASE_URL
  const twitchAPI = useTwitchAPI(process.env.BUILD_ENV === 'DEV');
  const { t, i18n } = useTranslation();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        refetchOnMount: false,
      },
    },
    queryCache: new QueryCache({
      onError: (error) =>
        addAlert({ serverity: "error", message: t("alert.network_error") }),
    }),
  });

  const getClientLocale = () => {
    if (typeof Intl !== "undefined") {
      try {
        return Intl.NumberFormat().resolvedOptions().locale;
      } catch (err) {
        console.error("Cannot get locale from Intl");

        return window.navigator.languages
          ? window.navigator.languages[0]
          : window.navigator.language;
      }
    }
  };

  useEffect(() => {
    i18n.changeLanguage(getClientLocale());
  }, []);

  return (
    <ThemeProvider theme={useCustomTheme(globalSetting.darkTheme)}>
      <TBCContext.GlobalSettingContext.Provider
        value={{ globalSetting, dispatchGlobalSetting }}
      >
        <TBCContext.AlertContext.Provider value={{ alerts, setAlerts, addAlert }}>
          <QueryClientProvider client={queryClient}>
            <TBCContext.TwitchAPIContext.Provider value={twitchAPI}>
              {globalStyles}
              <Router />
            </TBCContext.TwitchAPIContext.Provider>
          </QueryClientProvider>
        </TBCContext.AlertContext.Provider>
      </TBCContext.GlobalSettingContext.Provider>
    </ThemeProvider>
  );
}

function Router() {
  const { t, i18n } = useTranslation();
  const { arrayFilter, setArrayFilter, addArrayFilter, checkFilter } =
    useArrayFilter('Extension');

  return (
    <TBCContext.ArrayFilterContext.Provider
      value={{ arrayFilter, setArrayFilter, addArrayFilter, checkFilter }}
    >
      <MemoryRouter initialEntries={[`/${getQueryParams("initialPath")}`]}>
        <Routes>
          <Route
            path="/filter"
            element={
              <DrawerTemplate
                title={t("setting.filter_setting")}
                name="filter"
                drawer={<SettingPageDrawer env="Extension"/>}
              >
                <Filter />
              </DrawerTemplate>
            }
          />
          <Route
            path="/chatsaver"
            element={
              <DrawerTemplate
                title={t("setting.save_chat")}
                name="chatsaver"
                drawer={<SettingPageDrawer env="Extension" />}
              >
                <ChatSaver env="Extension"/>
              </DrawerTemplate>
            }
          />
        </Routes>
      </MemoryRouter>
    </TBCContext.ArrayFilterContext.Provider>
  );
}
ReactDOM.createRoot(document.getElementById("root") as Element).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
