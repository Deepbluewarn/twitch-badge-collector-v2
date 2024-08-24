import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import browser from "webextension-polyfill";
import GlobalStyles from "@mui/material/GlobalStyles";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { styled, ThemeProvider } from "@mui/material/styles";
import Selector from "@components/Selector";
import {
  SettingInterface,
  Context as TBCContext,
  useCustomTheme,
  SocialFooter,
} from 'twitch-badge-collector-cc';
import CustomTextField from "@components/CustomTextField";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import { isFirefoxAddon } from "@utils/utils-browser";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAngleLeft } from "@fortawesome/free-solid-svg-icons";
import Divider from "@mui/material/Divider";
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

const PopupGlobalStyle = (
  <GlobalStyles
    styles={() => ({
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
        maxHeight: "21rem",
        overflow: "auto",
        userSelect: "none",
      },
    })}
  ></GlobalStyles>
);

// const ButtonLink = styled(Button)({
//   width: "100%",
//   fontSize: "0.8rem",
// });

const Icon = styled('img')({
  width: '1rem',
  height: '1rem'
})

const CustomAnchor = styled('a')({
  display: 'flex',
  width: '100%'
});

const routes = [
  {
    path: "/",
    element: <Popup />
  },
  {
    path: "/setting",
    element: <PopupSetting />
  }
];

const router = createMemoryRouter(routes, {
  initialEntries: ["/"],
  initialIndex: 1,
});

function PopupSetting() {
  return (
    <Stack spacing={1} sx={{ padding: '8px' }}>
      <Stack direction='row' alignItems='center' gap={2}>
        <Box onClick={() => {router.navigate('/')}} sx={{cursor: 'pointer'}}>
          <FontAwesomeIcon icon={faAngleLeft} size='xl' />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>{browser.i18n.getMessage("generalSetting")}</Typography>
      </Stack>

      <Stack sx={{ margin: '8px 0 8px 0' }}>
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
      </Stack>
    </Stack>
  )
}
function Popup() {
  const [rateLink, setRateLink] = useState('');

  useEffect(() => {
    isFirefoxAddon().then(isf => {
      setRateLink((isf ? import.meta.env.VITE_FIREFOX_RATE_EXT_LINK : import.meta.env.VITE_CHROMIUM_RATE_EXT_LINK) || '');
    });
  }, [])

  const onPageButtonClicked = (path: string) => {
    browser.tabs.create({
      url: browser.runtime.getURL(`src/setting/setting.html?initialPath=${path}`),
    });
  };

  useEffect(() => {
    browser.storage.onChanged.addListener((changed, areaName) => {
      if (areaName !== "local") return;

      for (const key in changed) {
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
    <Stack sx={{ margin: '8px' }} gap={1}>
      <Stack direction='row' spacing={4} justifyContent='space-between'>
        <Stack direction='row' alignItems='center' spacing={1}>
          <Icon src={browser.runtime.getURL('src/assets/icon.png')} alt="" />
          <Typography variant="body2" sx={{ fontWeight: '600' }}>Twitch Badge Collector V2</Typography>
        </Stack>
        <Typography variant="body2" sx={{ fontWeight: '600', color: '#A7A7A7' }}>{browser.runtime.getManifest().version}</Typography>
      </Stack>

      <Stack>
        <Link href={import.meta.env.VITE_DOCUMENTATION} underline="none" target='_blank'>
          <Button variant="outlined" sx={{ width: '100%' }}>
            {browser.i18n.getMessage('documentation')}
          </Button>
        </Link>
      </Stack>

      <Stack direction='row' sx={{ width: '100%', 'gap': '8px' }}>

        <Button
          variant="outlined"
          sx={{ 'width': '100%' }}
          onClick={() => {
            router.navigate("/setting");
          }}
        >
          {browser.i18n.getMessage("generalSetting")}
        </Button>

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

      <Link href={rateLink} underline="none" target='_blank'>
        <Button variant="outlined" sx={{ width: '100%' }}>
          {browser.i18n.getMessage('review')}
        </Button>
      </Link>
      <Stack direction='row'>
        <CustomAnchor href={import.meta.env.VITE_DONATE_LINK} target='_blank'>
          <Box
            component='img'
            sx={{ width: 'inherit', borderRadius: '8px' }}
            src={`https://cdn.jsdelivr.net/npm/twitch-badge-collector-cc@0.0.70/dist/donation/toonation_b14.gif`}
          />
        </CustomAnchor>
        <Divider sx={{m: 1}} orientation="vertical" flexItem />
        <CustomAnchor href="https://www.buymeacoffee.com/bluewarndev" target="_blank">
          <Box
            component='img'
            sx={{ width: 'inherit', borderRadius: '8px' }}
            src={browser.runtime.getURL('src/assets/bmc-button.svg')}
          />
        </CustomAnchor>
      </Stack>
      <Stack
        direction='row'
        alignItems='center'
        justifyContent='center'
        spacing={1}
      >
        <Box sx={{ color: '#2196f3' }}>
          <SocialFooter />
        </Box>
      </Stack>
    </Stack>
  );
}

const ContextRouter = () => {
  const { globalSetting, dispatchGlobalSetting } = useExtensionGlobalSetting(false);

  return (
    <ThemeProvider theme={useCustomTheme('off')}>
      <TBCContext.GlobalSettingContext.Provider
        value={{ globalSetting, dispatchGlobalSetting }}
      >
        <RouterProvider router={router} />
      </TBCContext.GlobalSettingContext.Provider>
    </ThemeProvider>
  )
}

ReactDOM.createRoot(document.getElementById("root") as Element).render(
  <React.StrictMode>
    {PopupGlobalStyle}
    <ContextRouter />
  </React.StrictMode>
);
