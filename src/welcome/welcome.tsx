import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import browser from "webextension-polyfill";
import { Trans, useTranslation } from "react-i18next";
import { ThemeProvider } from "@mui/material/styles";
import globalStyles from "@style/global";
import {
    Context as TBCContext,
    useCustomTheme,
} from 'twitch-badge-collector-cc';
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Link from "@mui/material/Link";
import Alert from "@mui/material/Alert";
import useExtensionGlobalSetting from "@hooks/useGlobalSettingExtension";

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

function DocumentLink(props: { children: React.ReactNode }) {
    return (
        <Link href={import.meta.env.VITE_DOCUMENTATION} color="inherit" target="_blank">
            {props.children}
        </Link>
    )
}
function ExtensionTitle() {
    return (
        <Stack
            direction='row'
            alignItems='center'
            gap={2}
            sx={{ marginBottom: '16px' }}
        >
            <Box
                component='img'
                sx={{
                    width: '3rem',
                    height: '3rem'
                }}
                alt={browser.runtime.getManifest().name}
                src={browser.runtime.getURL(`src/assets/icon.png`)}
            >
            </Box>
            <Typography variant="h6" sx={{ fontWeight: '500' }}>
                {browser.runtime.getManifest().name}
            </Typography>
        </Stack>
    )
}
function App() {
    const { globalSetting, dispatchGlobalSetting } = useExtensionGlobalSetting(false);
    const { t, i18n } = useTranslation();

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
        document.title = browser.runtime.getManifest().name;
        i18n.changeLanguage(getClientLocale());
    }, []);

    return (
        <ThemeProvider theme={useCustomTheme(globalSetting.darkTheme)}>
            <TBCContext.GlobalSettingContext.Provider
                value={{ globalSetting, dispatchGlobalSetting }}
            >
                {globalStyles}

                <Box sx={{ width: '100%', height: '100%', backgroundColor: 'background.default' }}>
                    <Stack
                        gap={2}
                        sx={{
                            height: '100%',
                            justifyContent: 'center',
                            alignItems: 'center',
                            margin: '16px'
                        }}
                    >
                        <Paper variant="outlined" sx={{
                            padding: '32px'
                        }}>

                            <ExtensionTitle />
                            <Box sx={{ marginBottom: '8px' }}>
                                <Typography variant="subtitle1">
                                    {t('common.welcome_1')}
                                </Typography>

                                <Typography variant="subtitle1">
                                    <Trans i18nKey='common.welcome_2'>
                                        Please read the <DocumentLink>Documentation</DocumentLink> before using the extension.
                                    </Trans>
                                </Typography>
                            </Box>

                            <Alert variant="outlined" severity="info">
                                {t('common.nofityAdsense')}
                            </Alert>
                        </Paper>
                    </Stack>
                </Box>
            </TBCContext.GlobalSettingContext.Provider>
        </ThemeProvider>
    );
}

ReactDOM.createRoot(document.getElementById("root") as Element).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
