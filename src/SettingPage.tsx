import { Typography } from "@mui/material";
import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import browser from "webextension-polyfill";
import { useTranslation } from "react-i18next";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ChatSaver from "./components/chatsaver/ChatSaver";
import DrawerTemplate from "./components/DrawerTemplate";
import Filter from "./components/filter/Filter";
import SettingPageDrawer from "./components/SettingPageDrawer";
import { GlobalSettingContext } from "./context/GlobalSetting";
import useGlobalSetting from "./hooks/useGlobalSetting";
import { ThemeProvider } from "@mui/material/styles";
import { getTheme } from "./style/theme";
import useArrayFilter from "./hooks/useArrayFilter";
import { ArrayFilterContext } from "./context/ArrayFilter";
import { AlertContext } from "./context/Alert";
import useAlert from "./hooks/useAlert";
import { getQueryParams } from "./utils";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { TwitchAPIContext } from "./context/TwitchAPIContext";
import useTwitchAPI from "./hooks/useTwitchAPI";
import axios from "axios";
import globalStyles from "./style/global";
import './i18n/i18n';

function App() {
  const { globalSetting, dispatchGlobalSetting } = useGlobalSetting();
  const { alerts, setAlerts, addAlert } = useAlert();
  const twitchAPI = useTwitchAPI();
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
    i18n.changeLanguage(getClientLocale())
  }, []);
  
  return (
    <ThemeProvider theme={getTheme(globalSetting.darkTheme)}>
      <GlobalSettingContext.Provider
        value={{ globalSetting, dispatchGlobalSetting }}
      >
        <AlertContext.Provider value={{ alerts, setAlerts, addAlert }}>
          <QueryClientProvider client={queryClient}>
            <TwitchAPIContext.Provider value={twitchAPI}>
              {globalStyles}
              <Router />
            </TwitchAPIContext.Provider>
          </QueryClientProvider>
        </AlertContext.Provider>
      </GlobalSettingContext.Provider>
    </ThemeProvider>
  );
}

function Router() {
  const { t, i18n } = useTranslation();
  const { arrayFilter, setArrayFilter, addArrayFilter, checkFilter } =
    useArrayFilter();

  return (
    <ArrayFilterContext.Provider
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
                drawer={<SettingPageDrawer />}
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
                drawer={<SettingPageDrawer />}
              >
                <ChatSaver />
              </DrawerTemplate>
            }
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
