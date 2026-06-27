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
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import DeleteSweepOutlinedIcon from "@mui/icons-material/DeleteSweepOutlined";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import SettingsBrightnessIcon from "@mui/icons-material/SettingsBrightness";
import { setChatPersistence, setChatTime, setCollectedChatMarker, setDarkTheme, setDisplayMode, setFloatingBgColor, setJumpToBottomButton, setMaximumNumberChats, setPosition } from "@/reducer/setting";
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

/**
 * 색상 swatch + native picker. change 이벤트만 청취해 드래그 중 storage 폭주 방지.
 * 빈 값은 "자동" 의미 — reset 버튼으로 비울 수 있음.
 */
function BgColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const handler = (e: Event) => onChange((e.target as HTMLInputElement).value);
    el.addEventListener('change', handler);
    return () => el.removeEventListener('change', handler);
  }, [onChange]);
  return (
    <Stack direction='row' spacing={0.5} alignItems='center'>
      <Box
        onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
        sx={{
          width: 24, height: 24, borderRadius: '50%',
          // 빈 값(자동)일 땐 체커보드 패턴으로 "색 미지정" 시각화 — 팝업 배경과 동화 방지.
          backgroundColor: value || undefined,
          backgroundImage: value ? 'none' : 'conic-gradient(rgba(255,255,255,0.15) 0deg 90deg, rgba(255,255,255,0.3) 90deg 180deg, rgba(255,255,255,0.15) 180deg 270deg, rgba(255,255,255,0.3) 270deg 360deg)',
          border: `1px solid ${value ? 'rgba(128,128,128,0.4)' : 'rgba(128,128,128,0.6)'}`,
          cursor: 'pointer',
        }}
      >
        <input
          ref={inputRef}
          type='color'
          defaultValue={value || '#2a2a30'}
          style={{ position: 'absolute', visibility: 'hidden', width: 0, height: 0 }}
        />
      </Box>
      {value && (
        <Button size='small' variant='text' onClick={() => onChange('')} sx={{ minWidth: 0, p: 0.25, fontSize: '0.7rem' }}>
          자동
        </Button>
      )}
    </Stack>
  );
}

function PopupSetting() {
  const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();
  const t = (k: string) => browser.i18n.getMessage(k as any);
  const [otaInfo, setOtaInfo] = React.useState<{ rev: number | null; fetchedAt: number | null }>({ rev: null, fetchedAt: null });
  useEffect(() => {
    browser.storage.local.get(['tbcv2-selectors-manifest', 'tbcv2-selectors-fetched-at']).then((r) => {
      const m = r['tbcv2-selectors-manifest'] as { rev?: number } | undefined;
      const fa = r['tbcv2-selectors-fetched-at'] as number | undefined;
      setOtaInfo({ rev: m?.rev ?? null, fetchedAt: fa ?? null });
    });
  }, []);

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

      {/* 수집된 채팅 마커 표시 — 호스트 채팅창 좌측 띠 */}
      <SettingRow label={t('collectedChatMarker')}>
        <Switch
          checked={globalSetting.collectedChatMarker !== 'off'}
          onChange={(e) => dispatchGlobalSetting(setCollectedChatMarker(e.target.checked ? 'on' : 'off'))}
        />
      </SettingRow>

      {/* 맨 아래로 버튼 표시 */}
      <SettingRow label={t('jumpToBottomButton' as any)}>
        <Switch
          checked={globalSetting.jumpToBottomButton !== 'off'}
          onChange={(e) => dispatchGlobalSetting(setJumpToBottomButton(e.target.checked ? 'on' : 'off'))}
        />
      </SettingRow>

      {/* 새로고침/탭전환 후 수집된 채팅 유지 */}
      <SettingRow label={t('chatPersistence' as any)}>
        <Switch
          checked={globalSetting.chatPersistence !== 'off'}
          onChange={(e) => dispatchGlobalSetting(setChatPersistence(e.target.checked ? 'on' : 'off'))}
        />
      </SettingRow>

      {/* 표시 방식 — inline(합치기) / floating(아이콘+팝오버). 새로고침 필요. */}
      <SettingRow label={t('displayMode' as any)} hint={t('needRefresh')}>
        <ToggleButtonGroup
          value={globalSetting.displayMode ?? 'inline'}
          exclusive
          size='small'
          onChange={(_e, v: SettingInterface['displayMode'] | null) => {
            if (v) dispatchGlobalSetting(setDisplayMode(v));
          }}
          sx={{ '& .MuiToggleButton-root': { px: 1, py: 0.25, textTransform: 'none' } }}
        >
          <ToggleButton value='inline'>{t('displayModeInline' as any)}</ToggleButton>
          <ToggleButton value='floating'>{t('displayModeFloating' as any)}</ToggleButton>
        </ToggleButtonGroup>
      </SettingRow>

      {/* floating 팝오버 배경색 — 비어 있으면 자동 감지. 사용자가 chzzk 톤에 맞게 직접 지정 가능. */}
      {globalSetting.displayMode === 'floating' && (
        <SettingRow label={t('floatingBgColor' as any)} hint={t('needRefresh')}>
          <BgColorPicker
            value={globalSetting.floatingBgColor || ''}
            onChange={(c) => dispatchGlobalSetting(setFloatingBgColor(c))}
          />
        </SettingRow>
      )}

      {/* OTA selector 버전 — 작은 caption으로 하단 표시. 문제 보고 시 참고용. */}
      <Typography
        variant='caption'
        color='text.secondary'
        sx={{ display: 'block', textAlign: 'right', mt: 0.5, fontSize: '0.65rem', lineHeight: 1.2 }}
      >
        {otaInfo.rev !== null
          ? `OTA selectors rev ${otaInfo.rev}${otaInfo.fetchedAt ? ` (${new Date(otaInfo.fetchedAt).toLocaleString()})` : ''}`
          : 'OTA selectors: 번들 기본값'}
      </Typography>
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

  // 활성 탭의 content script로 메시지 전송. content는 chzzk/twitch 페이지에서만 mount
  // 되므로 다른 탭에선 sendMessage가 reject 됨 — 그땐 alert로 안내만 하고 silent.
  const sendToActiveContent = async (type: 'tbc-start-capture' | 'tbc-clear-chats') => {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const id = tabs[0]?.id;
      if (id == null) return;
      await browser.tabs.sendMessage(id, { type });
      window.close();
    } catch {
      // content script 미주입 탭 — 안내 후 그대로 둠.
      alert('치지직 또는 트위치 페이지에서만 동작합니다.');
    }
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

      {/* 채팅 캡쳐 시작 — 활성 탭의 content script로 메시지 */}
      <Button
        variant="outlined"
        startIcon={<PhotoCameraOutlinedIcon />}
        onClick={() => sendToActiveContent('tbc-start-capture')}
      >
        {browser.i18n.getMessage('startCapture' as any)}
      </Button>

      {/* 저장된 채팅 비우기 */}
      <Button
        variant="outlined"
        startIcon={<DeleteSweepOutlinedIcon />}
        onClick={() => sendToActiveContent('tbc-clear-chats')}
      >
        {browser.i18n.getMessage('clearCollectedChats' as any)}
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
