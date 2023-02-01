import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import browser from "webextension-polyfill";
import GlobalStyles from "@mui/material/GlobalStyles";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { styled, ThemeProvider } from "@mui/material/styles";
import Selector from "./components/Selector";
import {
  useGlobalSetting,
  SettingInterface,
  Context as TBCContext,
  useCustomTheme,
  SocialFooter
} from 'twitch-badge-collector-cc';
import CustomTextField from "./components/CustomTextField";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";

const PopupGlobalStyle = (
  <GlobalStyles
    styles={(theme) => ({
      "*, *::before, *::after": {
        boxSizing: "border-box",
      },
      "*::-webkit-scrollbar": {
        width: "6px",
        backgroundColor: "rgba(255, 255, 255, 0)",
      },
      "*::-webkit-scrollbar-thumb": {
        borderRadius: "4px",
        margin: "2px",
        backgroundColor: "#d3d3d3",
      },
      body: {
        fontFamily: `
          'Pretendard Variable', 
          -apple-system, 
          BlinkMacSystemFont, 
          system-ui, 
          Roboto, 
          'Helvetica Neue', 
          'Segoe UI', 
          'Apple SD Gothic Neo', 
          'Noto Sans KR', 
          'Malgun Gothic', 
          sans-serif
        `,
        padding: "0",
        margin: "0",
        width: "20rem",
        lineHeight: "1.5",
      },
      "a, a:link, a:visited, a:hover, a:active": {
        color: "inherit",
        textDecoration: "inherit",
        fontWeight: "inherit",
      },
      "#root": {
        height: "21rem",
        overflow: "auto",
        userSelect: "none",
      },
    })}
  ></GlobalStyles>
);

const ButtonLink = styled(Button)({
  width: "100%",
  fontSize: "0.8rem",
});

const Icon = styled('img')({
  width: '1rem',
  height: '1rem'
})

const CustomAnchor = styled('a')({
  display: 'flex',
  width: '5.5rem'
});

const Popup = () => {
  const { globalSetting, dispatchGlobalSetting } = useGlobalSetting('Extension', false);
  const onPageButtonClicked = (path: string) => {
    browser.tabs.create({
      url: browser.runtime.getURL(`setting.html?initialPath=${path}`),
    });
  };

  useEffect(() => {
    console.log('process.env.RATE_EXT_LINK: ', process.env.RATE_EXT_LINK)
    browser.storage.onChanged.addListener((changed, areaName) => {
      if (areaName !== "local") return;

      for (let key in changed) {
        if (key === "position") {
          browser.storage.local.get("containerRatio").then((res) => {
            let cr = res.containerRatio;
            cr = 100 - cr;
            browser.storage.local.set({ containerRatio: cr });
          });
        }
      }
    });
  }, []);

  return (
    <ThemeProvider theme={useCustomTheme('off')}>
      <TBCContext.GlobalSettingContext.Provider
        value={{ globalSetting, dispatchGlobalSetting }}
      >
        <Stack direction='row' spacing={4} justifyContent='space-between' sx={{ margin: '8px' }}>
          <Stack direction='row' alignItems='center' spacing={1}>
            <Icon src={browser.runtime.getURL('icon.png')} alt="" />
            <Typography variant="body2" sx={{ fontWeight: '600' }}>Twitch Badge Collector V2</Typography>
          </Stack>
          <Typography variant="body2" sx={{ fontWeight: '600', color: '#A7A7A7' }}>{browser.runtime.getManifest().version}</Typography>
        </Stack>

        <Stack sx={{'padding': '8px'}}>
          <Link href={process.env.DOCUMENTATION} underline="none" target='_blank'>
            <Button variant="outlined" sx={{ width: '100%' }}>
              {browser.i18n.getMessage('documentation')}
            </Button>
          </Link>
        </Stack>

        <Stack direction='row' sx={{ width: '100%', 'gap': '8px', 'padding': '8px' }}>
          <Button
            variant="outlined"
            sx={{ 'width': '100%' }}
            onClick={() => {
              onPageButtonClicked("filter");
            }}
          >
            {browser.i18n.getMessage("p_filter_btn")}
          </Button>
          <Button
            variant="outlined"
            sx={{ 'width': '100%' }}
            onClick={() => {
              onPageButtonClicked("chatsaver");
            }}
          >
            {browser.i18n.getMessage("p_save_chat_btn")}
          </Button>
        </Stack>

        <Stack spacing={1} sx={{ padding: '8px' }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>{browser.i18n.getMessage("generalSetting")}</Typography>
          <Stack sx={{ margin: '8px 0 8px 0' }}>
            <Selector
              title={browser.i18n.getMessage("dispCopiedChatmethod")}
              values={SettingInterface.ChatDisplayMethodOptions}
              id="chatDisplayMethod"
              key='chatDisplayMethod'
            />
            <Selector
              title={browser.i18n.getMessage("chatPosition")}
              values={SettingInterface.PositionOptions}
              id="position"
              key='position'
            />
            <CustomTextField
              title={`${browser.i18n.getMessage('maximumNumberChats')} (${browser.i18n.getMessage('needRefresh')})`}
              id='maximumNumberChats'
            />
            <Selector
              title={browser.i18n.getMessage("pointBoxAutoClick")}
              values={SettingInterface.ToggleOptions}
              id="pointBoxAuto"
              key='pointBoxAuto'
            />
          </Stack>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>{browser.i18n.getMessage("chatClientSetting")}</Typography>
          <Stack sx={{ margin: '8px 0 8px 0' }}>
            <Selector
              title={browser.i18n.getMessage("language_text")}
              values={SettingInterface.LanguageOptions}
              id="miniLanguage"
              key='miniLanguage'
            />
            
            <Selector
              title={browser.i18n.getMessage("fontSize")}
              values={SettingInterface.FontSizeOptions}
              id="miniFontSize"
              key='miniFontSize'
            />

            <Selector
              title={browser.i18n.getMessage("chatTime")}
              values={SettingInterface.ToggleOptions}
              id="miniChatTime"
              key='miniChatTime'
            />
          </Stack>
          <Link href={process.env.RATE_EXT_LINK} underline="none" target='_blank'>
            <Button variant="outlined" sx={{ width: '100%' }}>
              {browser.i18n.getMessage('review')}
            </Button>
          </Link>
          <Stack
            direction='row'
            alignItems='center'
            spacing={1}
          >
            <CustomAnchor href={process.env.DONATE_LINK} target='_blank'>
              <Box
                component='img'
                sx={{ width: 'inherit', borderRadius: '8px' }}
                src={`https://cdn.jsdelivr.net/npm/twitch-badge-collector-cc@0.0.70/dist/donation/toonation_b14.gif`}
              />
            </CustomAnchor>
            <Box sx={{ color: '#2196f3'}}>
              <SocialFooter />
            </Box>
          </Stack>
        </Stack>
      </TBCContext.GlobalSettingContext.Provider>
    </ThemeProvider>
  );
};

ReactDOM.createRoot(document.getElementById("root") as Element).render(
  <React.StrictMode>
    {PopupGlobalStyle}
    <Popup />
  </React.StrictMode>
);
