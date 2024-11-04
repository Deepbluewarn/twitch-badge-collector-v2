import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import browser from "webextension-polyfill";
import { useTranslation } from "react-i18next";
import { ThemeProvider } from "@mui/material/styles";
import globalStyles from "@style/global";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import useExtensionGlobalSetting from "@hooks/useGlobalSettingExtension";
import { useCustomTheme } from "@hooks/useCustomTheme";
import { GlobalSettingContext } from "../context/GlobalSetting";
import '../../src/translate/i18n';
import DonationAlert from "@components/DonationAlert";
import { ExtensionTitle } from "@components/ExtensionTitle";

function App() {
    const { globalSetting, dispatchGlobalSetting } = useExtensionGlobalSetting();
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
        <ThemeProvider theme={useCustomTheme(globalSetting.darkTheme === 'on')}>
            <GlobalSettingContext.Provider
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
                            </Box>

                            <DonationAlert />
                        </Paper>
                    </Stack>
                </Box>
            </GlobalSettingContext.Provider>
        </ThemeProvider>
    );
}

ReactDOM.createRoot(document.getElementById("root") as Element).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
