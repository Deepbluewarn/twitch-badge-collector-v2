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
import TemplateSetting from "@/components/TemplateSetting";
import "@/render/chzzk-chat.css";
import i18n from '@/translate/i18n';
import { useTranslation } from 'react-i18next';
import TranslationNotice from '@/components/TranslationNotice';
import { useDocumentTheme } from "@/ui/useDocumentTheme";

function App() {
  const { globalSetting, dispatchGlobalSetting } = useExtensionGlobalSetting();
  const { alerts, setAlerts, addAlert } = useAlert();
  // 사용자 설정(system/light/dark)을 boolean으로 해석. 'system'이면 prefers-color-scheme 따라감.
  const isDark = useResolvedDarkMode(globalSetting.darkTheme);
  useDocumentTheme(isDark);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        refetchOnMount: false,
      },
    },
    queryCache: new QueryCache({
      onError: () =>
        addAlert({ serverity: "error", message: i18n.t('alert.network_error') }),
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
            <SettingTranslationNotice />
            <Router />
          </QueryClientProvider>
        </AlertContext.Provider>
      </GlobalSettingContext.Provider>
    </ThemeProvider>
  );
}

function SettingTranslationNotice() {
  const { t, i18n } = useTranslation();
  return (
    <TranslationNotice
      language={i18n.resolvedLanguage ?? i18n.language}
      message={t('translation_notice')}
      dismissLabel={t('common.dismiss')}
      flat
    />
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
          <Route path="/template" element={<TemplateSetting />} />
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
