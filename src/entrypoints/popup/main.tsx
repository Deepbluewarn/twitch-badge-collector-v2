import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import CustomTextField from "@/components/CustomTextField";
import Selector from "@/components/Selector";
import SocialFooter from "@/components/SocialFooter";
import TranslationNotice from "@/components/TranslationNotice";
import { GlobalSettingContext, useGlobalSettingContext } from "@/context/GlobalSetting";
import { addStorageUpdateListener } from "@/utils/utils-browser";
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
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
import { setChatPersistence, setChatTime, setCollectedChatMarker, setDarkTheme, setDisplayMode, setFloatingBgColor, setJumpToBottomButton, setMaximumNumberChats, setPosition, setChzzkChatSide, setChzzkCustomTemplate } from "@/reducer/setting";
import { SettingInterface } from "@/interfaces/setting";
import { getPlatformConfig, manifestReady } from "@/platform/host-selectors";
import { ensureRolloutBucket, isSocketRenderEnabled } from "@/content-scripts/chzzk/socket-mode";
import { useDocumentTheme } from "@/ui/useDocumentTheme";

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
          {browser.i18n.getMessage('auto' as any)}
        </Button>
      )}
    </Stack>
  );
}

function PopupSetting() {
  const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();
  const t = (k: string) => browser.i18n.getMessage(k as any);
  // "모아보기 채팅 모양"(커스텀 템플릿)은 소켓 렌더 모드에서만 동작한다. 이 사용자에게 아직 켜지지
  // 않았으면(비율 배포·비상 끄기) 골라도 아무 변화가 없으니 항목 자체를 숨긴다.
  const [socketRenderEnabled, setSocketRenderEnabled] = React.useState(false);
  useEffect(() => {
    Promise.all([manifestReady, ensureRolloutBucket()]).then(([, bucket]) =>
      setSocketRenderEnabled(isSocketRenderEnabled(getPlatformConfig('chzzk').constants, null, bucket)));
  }, []);
  const [otaInfo, setOtaInfo] = React.useState<{ rev: number | null; fetchedAt: number | null }>({ rev: null, fetchedAt: null });
  useEffect(() => {
    browser.storage.local.get(['tbcv2-selectors-manifest', 'tbcv2-selectors-fetched-at']).then((r) => {
      const m = r['tbcv2-selectors-manifest'] as { rev?: number } | undefined;
      const fa = r['tbcv2-selectors-fetched-at'] as number | undefined;
      setOtaInfo({ rev: m?.rev ?? null, fetchedAt: fa ?? null });
    });
    // 제보 cooldown 초기 조회 — popup 열 때마다 남은 시간 표시.
    import('@/platform/report').then(m => m.getReportCooldownRemainingMs()).then(ms => {
      if (ms > 0) setCooldownMin(Math.ceil(ms / 60000));
    });
  }, []);

  // 진단: active tab의 content-script에 TBC_DIAGNOSE 보냄 → selector 매칭 카운트 +
  // 샘플 chat extract 결과 리포트 받음. popup 좁으니 리포트 자체는 안 그리고, 요약
  // 한 줄 + "복사"/"제보" 버튼.
  type DiagState =
    | { kind: 'idle' }
    | { kind: 'running' }
    | { kind: 'error'; message: string }
    | { kind: 'done'; report: import('@/platform/diagnose').DiagnoseReport; passCount: number; failCount: number };
  const [diag, setDiag] = React.useState<DiagState>({ kind: 'idle' });
  const [copyState, setCopyState] = React.useState<'idle' | 'copied'>('idle');
  const [submitState, setSubmitState] = React.useState<'idle' | 'submitting' | 'submitted' | 'failed'>('idle');
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [consentDialog, setConsentDialog] = React.useState<{ open: boolean; preview: string }>({ open: false, preview: '' });
  const [cooldownMin, setCooldownMin] = React.useState<number>(0);

  const runDiagnose = async () => {
    setDiag({ kind: 'running' });
    setCopyState('idle');
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const id = tabs[0]?.id;
      if (id == null) { setDiag({ kind: 'error', message: t('diagNoActiveTab') }); return; }
      const res = await browser.tabs.sendMessage(id, { type: 'tbc-diagnose' }) as
        { ok: true; report: import('@/platform/diagnose').DiagnoseReport } | { ok: false; error: string } | undefined;
      if (!res || !res.ok) {
        setDiag({ kind: 'error', message: res && !res.ok ? res.error : t('diagNoResponse') });
        return;
      }
      // required=true인 selector 중 count=0만 진짜 실패로 카운트.
      // 나머지(도네/인증/풀스크린 등)는 지금 조건에 없어서 0인 게 정상.
      const required = res.report.selectorResults.filter(r => r.required);
      const failCount = required.filter(r => r.count === 0).length;
      const passCount = required.length - failCount;
      setDiag({ kind: 'done', report: res.report, passCount, failCount });
    } catch {
      setDiag({ kind: 'error', message: t('onlyOnHostPage') });
    }
  };

  const copyReport = async () => {
    if (diag.kind !== 'done') return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(diag.report, null, 2));
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch { /* 클립보드 실패 — silent */ }
  };

  const doSubmit = async () => {
    if (diag.kind !== 'done') return;
    const { submitReport } = await import('@/platform/report');
    setSubmitState('submitting');
    setSubmitError(null);
    try {
      await submitReport(diag.report);
      setSubmitState('submitted');
      setTimeout(() => setSubmitState('idle'), 3000);
      setCooldownMin(60);
    } catch (e) {
      setSubmitState('failed');
      setSubmitError(String(e).replace('Error: ', ''));
      setTimeout(() => setSubmitState('idle'), 4000);
    }
  };

  const onSubmitClick = async () => {
    if (diag.kind !== 'done') return;
    const { REPORT_CONSENT_STORAGE_KEY, sanitizeReport, getReportCooldownRemainingMs } = await import('@/platform/report');
    const cooldown = await getReportCooldownRemainingMs();
    if (cooldown > 0) {
      setCooldownMin(Math.ceil(cooldown / 60000));
      return;
    }
    const r = await browser.storage.local.get(REPORT_CONSENT_STORAGE_KEY);
    if (r[REPORT_CONSENT_STORAGE_KEY]) {
      // 동의 이미 있음 — 바로 전송
      doSubmit();
      return;
    }
    // 첫 사용 — 미리보기 다이얼로그
    const preview = JSON.stringify(sanitizeReport(diag.report), null, 2);
    setConsentDialog({ open: true, preview });
  };

  const onConsentAccept = async () => {
    const { REPORT_CONSENT_STORAGE_KEY } = await import('@/platform/report');
    await browser.storage.local.set({ [REPORT_CONSENT_STORAGE_KEY]: true });
    setConsentDialog({ open: false, preview: '' });
    doSubmit();
  };

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
      <SettingRow label={t('theme')}>
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
            {t('themeSystem')}
          </ToggleButton>
          <ToggleButton value='light'>
            <LightModeIcon sx={{ fontSize: 16 }} />
            {t('themeLight')}
          </ToggleButton>
          <ToggleButton value='dark'>
            <DarkModeIcon sx={{ fontSize: 16 }} />
            {t('themeDark')}
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

      {/* 채팅창 좌/우 — 치지직 전용. 호스트 사이드바(원본 채팅 + 모아보기)를 통째로 옮긴다. */}
      <SettingRow label={t('chzzkChatSide')} hint={t('chzzkChatSideHint')}>
        <ToggleButtonGroup
          value={globalSetting.chzzkChatSide}
          exclusive
          size='small'
          onChange={(_e, v: SettingInterface['chzzkChatSide'] | null) => {
            if (v) dispatchGlobalSetting(setChzzkChatSide(v));
          }}
          sx={{ '& .MuiToggleButton-root': { px: 1.5, py: 0.25, textTransform: 'none' } }}
        >
          <ToggleButton value='left'>{t('chatSideLeft')}</ToggleButton>
          <ToggleButton value='right'>{t('chatSideRight')}</ToggleButton>
        </ToggleButtonGroup>
      </SettingRow>

      {/* 모아보기 채팅 모양 — 치지직 전용. 기본(치지직 원본 복제) / 커스텀(사용자 템플릿).
          설명은 두지 않는다 — 비개발자에게 내부 동작(원본 대기·속도)을 풀어 쓰면 오히려 헷갈린다
          (prototype/chat-render-setting 브랜치의 시안 비교 결과). 커스텀을 고르면 템플릿 설정으로 가는 버튼. */}
      {socketRenderEnabled && <SettingRow label={t('chzzkChatRender')}>
        <ToggleButtonGroup
          value={globalSetting.chzzkCustomTemplate === 'on' ? 'on' : 'off'}
          exclusive
          size='small'
          onChange={(_e, v: SettingInterface['chzzkCustomTemplate'] | null) => {
            if (v) dispatchGlobalSetting(setChzzkCustomTemplate(v));
          }}
          sx={{ '& .MuiToggleButton-root': { px: 1.5, py: 0.25, textTransform: 'none' } }}
        >
          <ToggleButton value='off'>{t('chatRenderNative')}</ToggleButton>
          <ToggleButton value='on'>{t('chatRenderTemplate')}</ToggleButton>
        </ToggleButtonGroup>
      </SettingRow>}
      {socketRenderEnabled && globalSetting.chzzkCustomTemplate === 'on' && (
        <Button
          size='small'
          variant='outlined'
          onClick={() => browser.tabs.create({ url: browser.runtime.getURL('/setting.html?initialPath=template') })}
          sx={{ alignSelf: 'flex-end', mt: -0.5, py: 0.25, textTransform: 'none' }}
        >
          {t('templateSettingButton')}
        </Button>
      )}

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

      {/* OTA selector 버전 + 진단 — 하단 caption row. 문제 보고 시 참고용. */}
      <Stack direction='row' alignItems='center' justifyContent='space-between' spacing={1} sx={{ mt: 0.5 }}>
        <Typography
          variant='caption'
          color='text.secondary'
          sx={{ flex: 1, fontSize: '0.65rem', lineHeight: 1.2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {otaInfo.rev !== null
            ? `OTA selectors rev ${otaInfo.rev}${otaInfo.fetchedAt ? ` (${new Date(otaInfo.fetchedAt).toLocaleString()})` : ''}`
            : t('otaBundled')}
        </Typography>
        <Stack direction='row' spacing={0.5} alignItems='center'>
          {diag.kind === 'done' && (
            <Typography variant='caption' color={diag.failCount > 0 ? 'error' : 'success.main'} sx={{ fontSize: '0.65rem' }}>
              {diag.failCount > 0 ? browser.i18n.getMessage('diagFailCount' as any, [String(diag.failCount), String(diag.passCount + diag.failCount)]) : `OK ${diag.passCount}`}
            </Typography>
          )}
          {diag.kind === 'error' && (
            <Typography variant='caption' color='error' sx={{ fontSize: '0.65rem' }}>{diag.message}</Typography>
          )}
          <Button
            size='small'
            variant='text'
            onClick={runDiagnose}
            disabled={diag.kind === 'running'}
            sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: '0.65rem', lineHeight: 1.4 }}
          >
            {diag.kind === 'running' ? t('diagRunning') : t('diagRun')}
          </Button>
          {diag.kind === 'done' && (
            <Button
              size='small'
              variant='text'
              onClick={copyReport}
              sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: '0.65rem', lineHeight: 1.4 }}
            >
              {copyState === 'copied' ? t('copied') : t('copy')}
            </Button>
          )}
          {diag.kind === 'done' && (() => {
            // Discord webhook 미설정 시 렌더 자체 X.
            const url: string | undefined = (import.meta as unknown as { env?: Record<string, string> }).env?.WXT_PUBLIC_REPORT_WEBHOOK_URL;
            if (!url) return null;
            const disabled = submitState === 'submitting' || cooldownMin > 0;
            const label =
              submitState === 'submitted' ? t('reportSubmitted') :
              submitState === 'submitting' ? t('reportSubmitting') :
              submitState === 'failed' ? t('reportFailed') :
              cooldownMin > 0 ? `${cooldownMin}m` :
              t('report');
            return (
              <Button
                size='small'
                variant='text'
                onClick={onSubmitClick}
                disabled={disabled}
                sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: '0.65rem', lineHeight: 1.4 }}
              >
                {label}
              </Button>
            );
          })()}
        </Stack>
      </Stack>
      {submitError && (
        <Typography variant='caption' color='error' sx={{ fontSize: '0.65rem', textAlign: 'right' }}>
          {submitError}
        </Typography>
      )}
      {/* 첫 제보 시 동의 다이얼로그 — sanitize된 실 payload 미리보기 후 승인. */}
      <Dialog
        open={consentDialog.open}
        onClose={() => setConsentDialog({ open: false, preview: '' })}
        maxWidth='sm'
        fullWidth
        PaperProps={{ sx: { m: 1, maxHeight: 'calc(100% - 16px)' } }}
      >
        <DialogTitle sx={{ fontSize: '0.9rem', py: 1 }}>{t('reportConsentTitle')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 2, gap: 1 }}>
          <Typography variant='caption' color='text.secondary'>
            {t('reportConsentBody')}
          </Typography>
          <Box
            component='pre'
            sx={{
              flex: 1,
              minHeight: 0,
              fontSize: '0.6rem',
              overflow: 'auto',
              bgcolor: 'action.hover',
              p: 1,
              borderRadius: 1,
              m: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {consentDialog.preview}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button size='small' onClick={() => setConsentDialog({ open: false, preview: '' })}>{t('cancel')}</Button>
          <Button size='small' variant='contained' onClick={onConsentAccept}>{t('reportConsentAccept')}</Button>
        </DialogActions>
      </Dialog>
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
      alert(browser.i18n.getMessage('onlyOnHostPage' as any));
    }
  }

  useEffect(() => {
    addStorageUpdateListener((key, newValue, oldValue) => {
      // 위/아래를 뒤집었으면 비율도 같이 뒤집어야 화면상 경계가 그대로 유지된다.
      //
      // oldValue === undefined는 "사용자가 토글했다"가 아니라 "position 키가 방금
      // 처음 생겼다" — background ensureDefaultSettings의 backfill이다. 이걸
      // 토글로 오해하면 self-heal 되는 순간 사용자가 맞춰둔 비율이 한 번 뒤집힌다.
      if (key === "position" && oldValue !== undefined) {
        browser.storage.local.get("containerRatio").then((res) => {
          // 미초기화 storage면 100 - undefined = NaN이 저장돼 이후 비율이 영구히 깨진다.
          const current = typeof res.containerRatio === 'number' ? res.containerRatio : 30;
          browser.storage.local.set({ containerRatio: 100 - current });
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

      <TranslationNotice
        language={browser.i18n.getUILanguage()}
        message={browser.i18n.getMessage('translationNotice' as any)}
        dismissLabel={browser.i18n.getMessage('dismiss' as any)}
      />

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
  useDocumentTheme(isDark);

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
