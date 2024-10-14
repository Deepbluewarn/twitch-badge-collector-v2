import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import browser from "webextension-polyfill";
import GlobalStyles from "@mui/material/GlobalStyles";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { styled, ThemeProvider } from "@mui/material/styles";
import Selector from "@components/Selector";
import CustomTextField from "@components/CustomTextField";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import { isFirefoxAddon } from "@utils/utils-browser";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAngleLeft } from "@fortawesome/free-solid-svg-icons";
import Divider from "@mui/material/Divider";
import useExtensionGlobalSetting from "@hooks/useGlobalSettingExtension";
import { GlobalSettingContext, useGlobalSettingContext } from "../context/GlobalSetting";
import { useCustomTheme } from "@hooks/useCustomTheme";
import { MenuItem } from "@mui/material";
import SocialFooter from "@components/SocialFooter";

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
  const { globalSetting } = useGlobalSettingContext();
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
          value={globalSetting.position}
          action="SET_POSITION"
        >
          <MenuItem value={'up'} key={'up'}>{browser.i18n.getMessage('up')}</MenuItem>
          <MenuItem value={'down'} key={'down'}>{browser.i18n.getMessage('down')}</MenuItem>
        </Selector>

        <CustomTextField
          title={`${browser.i18n.getMessage('maximumNumberChats')} (${browser.i18n.getMessage('needRefresh')})`}
          id='maximumNumberChats'
          action='SET_MAXIMUM_NUMBER_CHATS'
        />
        <Selector
          title={browser.i18n.getMessage("pointBoxAutoClick")}
          value={globalSetting.pointBoxAuto}
          action="SET_POINT_BOX_AUTO"
        >
          <MenuItem value={'on'} key={'true'}>{browser.i18n.getMessage('on')}</MenuItem>
          <MenuItem value={'off'} key={'false'}>{browser.i18n.getMessage('off')}</MenuItem>
        </Selector>

        <Selector
          title={browser.i18n.getMessage("chatTime")}
          value={globalSetting.chatTime}
          action="SET_CHAT_TIME"
        >
          <MenuItem value={'on'} key={'true'}>{browser.i18n.getMessage('on')}</MenuItem>
          <MenuItem value={'off'} key={'false'}>{browser.i18n.getMessage('off')}</MenuItem>
        </Selector>
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

  const onRatioResetButtonClicked = () => {
    browser.storage.local.set({containerRatio: 30});
  }

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

      <Stack sx={{ 'gap': '8px' }}>
        <Link href={import.meta.env.VITE_DOCUMENTATION} underline="none" target='_blank'>
          <Button variant="outlined" sx={{ width: '100%' }}>
            {browser.i18n.getMessage('documentation')}
          </Button>
        </Link>
        <Button variant='contained' sx={{ width: '100%' }} onClick={() => onRatioResetButtonClicked()}>
            {browser.i18n.getMessage('reset_chat_ratio')}
        </Button>
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
  const { globalSetting, dispatchGlobalSetting } = useExtensionGlobalSetting();

  return (
    <ThemeProvider theme={useCustomTheme(false)}>
      <GlobalSettingContext.Provider
        value={{ globalSetting, dispatchGlobalSetting }}
      >
        <RouterProvider router={router} />
      </GlobalSettingContext.Provider>
    </ThemeProvider>
  )
}

ReactDOM.createRoot(document.getElementById("root") as Element).render(
  <React.StrictMode>
    {PopupGlobalStyle}
    <ContextRouter />
  </React.StrictMode>
);
