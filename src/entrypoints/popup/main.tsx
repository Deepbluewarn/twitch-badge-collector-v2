import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import CustomTextField from "@/components/CustomTextField";
import Selector from "@/components/Selector";
import SocialFooter from "@/components/SocialFooter";
import { GlobalSettingContext, useGlobalSettingContext } from "@/context/GlobalSetting";
import { addStorageUpdateListener } from "@/utils/utils-browser";
import { Box, Button, Chip, IconButton, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import GlobalStyles from "@mui/material/GlobalStyles";
import { styled, ThemeProvider } from "@mui/material/styles";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { useCustomTheme } from "@/hooks/useCustomTheme";
import { useResolvedDarkMode } from "@/hooks/useResolvedDarkMode";
import useExtensionGlobalSetting from "@/hooks/useGlobalSettingExtension";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import SettingsIcon from "@mui/icons-material/Settings";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import SettingsBrightnessIcon from "@mui/icons-material/SettingsBrightness";
import { setChatTime, setDarkTheme, setMaximumNumberChats, setPosition } from "@/reducer/setting";
import { SettingInterface } from "@/interfaces/setting";

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
        backgroundColor: theme.palette.divider,
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
        width: "22rem",
        lineHeight: "1.5",
        backgroundColor: theme.palette.background.default,
        color: theme.palette.text.primary,
      },
      "a, a:link, a:visited, a:hover, a:active": {
        color: "inherit",
        textDecoration: "inherit",
        fontWeight: "inherit",
      },
      "#root": {
        maxHeight: "24rem",
        overflow: "auto",
        userSelect: "none",
      },
    })}
  ></GlobalStyles>
);

const Icon = styled('img')({
  width: '1rem',
  height: '1rem'
})

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
  const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();
  const t = (k: string) => browser.i18n.getMessage(k as any);

  return (
    <Stack spacing={1.5} sx={{ p: 1.5 }}>
      {/* 헤더 */}
      <Stack direction='row' alignItems='center' spacing={1}>
        <IconButton onClick={() => router.navigate('/')} size='small'>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {t('generalSetting')}
        </Typography>
      </Stack>

      {/* 테마 — 시스템 / 라이트 / 다크 */}
      <SettingRow label='테마'>
        <ToggleButtonGroup
          value={globalSetting.darkTheme}
          exclusive
          size='small'
          onChange={(_e, v: SettingInterface['darkTheme'] | null) => {
            if (v) dispatchGlobalSetting(setDarkTheme(v));
          }}
          sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.25, gap: 0.5, textTransform: 'none' } }}
        >
          <ToggleButton value='system'>
            <SettingsBrightnessIcon sx={{ fontSize: 16 }} />
            시스템
          </ToggleButton>
          <ToggleButton value='light'>
            <LightModeIcon sx={{ fontSize: 16 }} />
            라이트
          </ToggleButton>
          <ToggleButton value='dark'>
            <DarkModeIcon sx={{ fontSize: 16 }} />
            다크
          </ToggleButton>
        </ToggleButtonGroup>
      </SettingRow>

      {/* 채팅 위치 — 위/아래 토글 */}
      <SettingRow label={t('chatPosition')}>
        <ToggleButtonGroup
          value={globalSetting.position}
          exclusive
          size='small'
          onChange={(_e, v: SettingInterface['position'] | null) => {
            if (v) dispatchGlobalSetting(setPosition(v));
          }}
          sx={{ '& .MuiToggleButton-root': { px: 1.5, py: 0.25, textTransform: 'none' } }}
        >
          <ToggleButton value='up'>{t('up')}</ToggleButton>
          <ToggleButton value='down'>{t('down')}</ToggleButton>
        </ToggleButtonGroup>
      </SettingRow>

      {/* 채팅 최대 개수 */}
      <SettingRow
        label={t('maximumNumberChats')}
        hint={t('needRefresh')}
      >
        <TextField
          type='number'
          size='small'
          value={globalSetting.maximumNumberChats}
          onChange={(e) => dispatchGlobalSetting(setMaximumNumberChats(Number(e.target.value)))}
          sx={{ width: 100 }}
          inputProps={{ min: 1 }}
        />
      </SettingRow>

      {/* 채팅 시간 표시 — 스위치 */}
      <SettingRow label={t('chatTime')}>
        <Switch
          checked={globalSetting.chatTime === 'on'}
          onChange={(e) => dispatchGlobalSetting(setChatTime(e.target.checked ? 'on' : 'off'))}
        />
      </SettingRow>
    </Stack>
  );
}

/** 좌측 라벨(+선택 hint) + 우측 컨트롤 한 줄 레이아웃. 컴팩트한 설정 행 패턴. */
function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <Stack direction='row' alignItems='center' justifyContent='space-between' spacing={1}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant='body2'>{label}</Typography>
        {hint && (
          <Typography variant='caption' color='text.secondary' sx={{ display: 'block', lineHeight: 1.2 }}>
            {hint}
          </Typography>
        )}
      </Box>
      {children}
    </Stack>
  );
}
function Popup() {
  const onPageButtonClicked = (path: string) => {
    browser.tabs.create({
      url: browser.runtime.getURL(`/setting.html?initialPath=${path}`)
    });
  };

  const onRatioResetButtonClicked = () => {
    browser.storage.local.set({containerRatio: 30});
  }

  useEffect(() => {
    addStorageUpdateListener((key, newValue) => {
      if (key === "position") {
        browser.storage.local.get("containerRatio").then((res) => {
          let cr = res.containerRatio;
          cr = 100 - cr;
          browser.storage.local.set({ containerRatio: cr });
        });
      }
    })
  }, []);

  return (
    <Stack sx={{ p: 1.5 }} gap={1}>
      {/* 헤더: 로고 + 이름 + 버전 chip */}
      <Stack direction='row' alignItems='center' spacing={1}>
        <Icon src={browser.runtime.getURL('/assets/icon.png')} alt="" />
        <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
          {browser.i18n.getMessage('ExtensionName')}
        </Typography>
        <Chip
          label={`v${browser.runtime.getManifest().version}`}
          size="small"
          sx={{ height: 20, fontSize: '0.7rem', fontWeight: 500 }}
        />
      </Stack>

      {/* primary CTA: 필터 설정 (가장 자주 쓰는 액션) */}
      <Button
        variant='contained'
        startIcon={<FilterAltIcon />}
        onClick={() => onPageButtonClicked("filter")}
        sx={{ mt: 0.5 }}
      >
        {browser.i18n.getMessage("p_filter_btn")}
      </Button>

      {/* secondary: 일반 설정 */}
      <Button
        variant="outlined"
        startIcon={<SettingsIcon />}
        onClick={() => router.navigate("/setting")}
      >
        {browser.i18n.getMessage("generalSetting")}
      </Button>

      {/* tertiary: 비율 초기화 — 가끔 쓰는 액션은 text variant로 demote */}
      <Button
        variant="text"
        size="small"
        startIcon={<RestartAltIcon />}
        onClick={onRatioResetButtonClicked}
        sx={{ alignSelf: 'flex-start', color: 'text.secondary' }}
      >
        {browser.i18n.getMessage('reset_chat_ratio')}
      </Button>

      {/* 푸터: socials only */}
      <Box sx={{ mt: 0.5, borderTop: 1, borderColor: 'divider', pt: 1 }}>
        <SocialFooter showExtensionInfo={false} />
      </Box>
    </Stack>
  );
}

const ContextRouter = () => {
  const { globalSetting, dispatchGlobalSetting } = useExtensionGlobalSetting();
  // 사용자 설정(system/light/dark)을 boolean으로 해석.
  const isDark = useResolvedDarkMode(globalSetting.darkTheme);

  return (
    <ThemeProvider theme={useCustomTheme(isDark)}>
      <GlobalSettingContext.Provider
        value={{ globalSetting, dispatchGlobalSetting }}
      >
        {PopupGlobalStyle}
        <RouterProvider router={router} />
      </GlobalSettingContext.Provider>
    </ThemeProvider>
  )
}

ReactDOM.createRoot(document.getElementById("root") as Element).render(
  <React.StrictMode>
    <ContextRouter />
  </React.StrictMode>
);
