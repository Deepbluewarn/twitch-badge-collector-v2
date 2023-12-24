import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { useTranslation } from "react-i18next";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import browser from "webextension-polyfill";
import { ThemeProvider } from "@mui/material/styles";
import { getQueryParams } from "../utils";
import globalStyles from "../style/global";
import { 
  Context as TBCContext,
  useCustomTheme,
  useAlert,
  useTwitchAPI,
  Filter, 
  DrawerTemplate,
  SettingPageDrawer,
  AlertContainer,
} from 'twitch-badge-collector-cc';
import ChatSaverExtension from "../components/chatsaver/ChatSaverExtension";
import useExtensionGlobalSetting from "../hooks/useGlobalSettingExtension";
import useArrayFilterExtension from "../hooks/useArrayFilterExtension";
import * as Sentry from "@sentry/browser";

Sentry.init({
  dsn: "https://af1b53df8897a90d7c27e8f9347954af@o1197585.ingest.sentry.io/4506447984852992",
  integrations: [
    new Sentry.Replay({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
  release: browser.runtime.getManifest().version,
  // Session Replay
  replaysSessionSampleRate: 0.1, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
  replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
});

function App() {
  const { globalSetting, dispatchGlobalSetting } = useExtensionGlobalSetting(false);
  const { alerts, setAlerts, addAlert } = useAlert();
  const twitchAPI = useTwitchAPI(import.meta.env.DEV);
  const { t, i18n } = useTranslation();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        refetchOnMount: false,
      },
    },
    queryCache: new QueryCache({
      onError: () =>
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
              <AlertContainer />
              <Router />
            </TBCContext.TwitchAPIContext.Provider>
          </QueryClientProvider>
        </TBCContext.AlertContext.Provider>
      </TBCContext.GlobalSettingContext.Provider>
    </ThemeProvider>
  );
}

function Router() {
  const { t } = useTranslation();
  const { arrayFilter, setArrayFilter, addArrayFilter, checkFilter } =
    useArrayFilterExtension(false);

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
                <ChatSaverExtension/>
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
