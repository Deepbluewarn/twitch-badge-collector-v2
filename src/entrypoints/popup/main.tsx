import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import SocialFooter from "@/components/SocialFooter";
import TranslationNotice from "@/components/TranslationNotice";
import { GlobalSettingContext, useGlobalSettingContext } from "@/context/GlobalSetting";
import { addStorageUpdateListener } from "@/utils/utils-browser";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { useResolvedDarkMode } from "@/hooks/useResolvedDarkMode";
import useExtensionGlobalSetting from "@/hooks/useGlobalSettingExtension";
import { setChatPersistence, setChatTime, setCollectedChatMarker, setDarkTheme, setDisplayMode, setFloatingBgColor, setJumpToBottomButton, setMaximumNumberChats, setPosition, setChzzkChatSide, setChzzkCustomTemplate } from "@/reducer/setting";
import { SettingInterface } from "@/interfaces/setting";
import { getPlatformConfig, manifestReady } from "@/platform/host-selectors";
import { ensureRolloutBucket, isSocketRenderEnabled } from "@/content-scripts/chzzk/socket-mode";
import { useDocumentTheme } from "@/ui/useDocumentTheme";
import { Button, Dialog, IconButton, Segmented, Stack, Switch, Tag, TextInput } from "@/ui";
import "./popup.css";

/** 진단 줄의 작은 글자 버튼 — 좁은 팝업 하단 한 줄에 들어가게. */
const metaButtonStyle: React.CSSProperties = { height: 24, fontSize: 12, fontWeight: 700 };
const metaTextStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, lineHeight: 1.2 };

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
    <Stack dir='row' gap={4} align='center'>
      <div
        onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
        style={{
          width: 24, height: 24, borderRadius: '50%',
          // 빈 값(자동)일 땐 체커보드 패턴으로 "색 미지정" 시각화 — 팝업 배경과 동화 방지.
          backgroundColor: value || undefined,
          backgroundImage: value ? 'none' : 'conic-gradient(rgba(128,128,128,0.15) 0deg 90deg, rgba(128,128,128,0.4) 90deg 180deg, rgba(128,128,128,0.15) 180deg 270deg, rgba(128,128,128,0.4) 270deg 360deg)',
          border: '2px solid var(--ui-line)',
          cursor: 'pointer',
        }}
      >
        <input
          ref={inputRef}
          type='color'
          defaultValue={value || '#2a2a30'}
          style={{ position: 'absolute', visibility: 'hidden', width: 0, height: 0 }}
        />
      </div>
      {value && (
        <Button size='sm' variant='text' onClick={() => onChange('')} style={metaButtonStyle}>
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

  // Dialog의 Esc 리스너가 onClose 바뀔 때마다 다시 붙지 않게 고정.
  const closeConsentDialog = React.useCallback(() => setConsentDialog({ open: false, preview: '' }), []);

  const onConsentAccept = async () => {
    const { REPORT_CONSENT_STORAGE_KEY } = await import('@/platform/report');
    await browser.storage.local.set({ [REPORT_CONSENT_STORAGE_KEY]: true });
    setConsentDialog({ open: false, preview: '' });
    doSubmit();
  };

  return (
    <Stack gap={12} style={{ padding: 12 }}>
      {/* 헤더 */}
      <Stack dir='row' align='center' gap={8}>
        <IconButton icon='arrow_back' label={t('back')} size='sm' onClick={() => router.navigate('/')} />
        <span style={{ fontSize: 16, fontWeight: 900 }}>
          {t('generalSetting')}
        </span>
      </Stack>

      {/* 테마 — 시스템 / 라이트 / 다크 */}
      <SettingRow label={t('theme')}>
        <Segmented<SettingInterface['darkTheme']>
          size='sm'
          label={t('theme')}
          value={globalSetting.darkTheme}
          onChange={(v) => dispatchGlobalSetting(setDarkTheme(v))}
          options={[
            { value: 'system', icon: 'settings_brightness', label: t('themeSystem') },
            { value: 'light', icon: 'light_mode', label: t('themeLight') },
            { value: 'dark', icon: 'dark_mode', label: t('themeDark') },
          ]}
        />
      </SettingRow>

      {/* 채팅 위치 — 위/아래 토글 */}
      <SettingRow label={t('chatPosition')}>
        <Segmented<SettingInterface['position']>
          size='sm'
          label={t('chatPosition')}
          value={globalSetting.position}
          onChange={(v) => dispatchGlobalSetting(setPosition(v))}
          options={[
            { value: 'up', label: t('up') },
            { value: 'down', label: t('down') },
          ]}
        />
      </SettingRow>

      {/* 채팅창 좌/우 — 치지직 전용. 호스트 사이드바(원본 채팅 + 모아보기)를 통째로 옮긴다. */}
      <SettingRow label={t('chzzkChatSide')} hint={t('chzzkChatSideHint')}>
        <Segmented<SettingInterface['chzzkChatSide']>
          size='sm'
          label={t('chzzkChatSide')}
          value={globalSetting.chzzkChatSide}
          onChange={(v) => dispatchGlobalSetting(setChzzkChatSide(v))}
          options={[
            { value: 'left', label: t('chatSideLeft') },
            { value: 'right', label: t('chatSideRight') },
          ]}
        />
      </SettingRow>

      {/* 모아보기 채팅 모양 — 치지직 전용. 기본(치지직 원본 복제) / 커스텀(사용자 템플릿).
          설명은 두지 않는다 — 비개발자에게 내부 동작(원본 대기·속도)을 풀어 쓰면 오히려 헷갈린다
          (prototype/chat-render-setting 브랜치의 시안 비교 결과). 커스텀을 고르면 이름 아래에 템플릿 설정으로 가는 링크. */}
      {socketRenderEnabled && <SettingRow
        label={t('chzzkChatRender')}
        hint={globalSetting.chzzkCustomTemplate === 'on' && (
          <button
            type='button'
            onClick={() => browser.tabs.create({ url: browser.runtime.getURL('/setting.html?initialPath=template') })}
            style={{
              border: 0, background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--ui-ink)',
              textDecoration: 'underline', textDecorationColor: 'var(--ui-yellow)', textDecorationThickness: 3, textUnderlineOffset: 3,
            }}
          >
            {t('templateSettingButton')} →
          </button>
        )}
      >
        <Segmented<SettingInterface['chzzkCustomTemplate']>
          size='sm'
          label={t('chzzkChatRender')}
          value={globalSetting.chzzkCustomTemplate === 'on' ? 'on' : 'off'}
          onChange={(v) => dispatchGlobalSetting(setChzzkCustomTemplate(v))}
          options={[
            { value: 'off', label: t('chatRenderNative') },
            { value: 'on', label: t('chatRenderTemplate') },
          ]}
        />
      </SettingRow>}

      {/* 채팅 최대 개수 */}
      <SettingRow
        label={t('maximumNumberChats')}
        hint={t('needRefresh')}
      >
        <TextInput
          type='number'
          size='sm'
          min={1}
          aria-label={t('maximumNumberChats')}
          value={globalSetting.maximumNumberChats}
          onChange={(e) => dispatchGlobalSetting(setMaximumNumberChats(Number(e.target.value)))}
          style={{ width: 100 }}
        />
      </SettingRow>

      {/* 채팅 시간 표시 — 스위치 */}
      <SettingRow label={t('chatTime')}>
        <Switch
          checked={globalSetting.chatTime === 'on'}
          onChange={(checked) => dispatchGlobalSetting(setChatTime(checked ? 'on' : 'off'))}
        />
      </SettingRow>

      {/* 수집된 채팅 마커 표시 — 호스트 채팅창 좌측 띠 */}
      <SettingRow label={t('collectedChatMarker')}>
        <Switch
          checked={globalSetting.collectedChatMarker !== 'off'}
          onChange={(checked) => dispatchGlobalSetting(setCollectedChatMarker(checked ? 'on' : 'off'))}
        />
      </SettingRow>

      {/* 맨 아래로 버튼 표시 */}
      <SettingRow label={t('jumpToBottomButton' as any)}>
        <Switch
          checked={globalSetting.jumpToBottomButton !== 'off'}
          onChange={(checked) => dispatchGlobalSetting(setJumpToBottomButton(checked ? 'on' : 'off'))}
        />
      </SettingRow>

      {/* 새로고침/탭전환 후 수집된 채팅 유지 */}
      <SettingRow label={t('chatPersistence' as any)}>
        <Switch
          checked={globalSetting.chatPersistence !== 'off'}
          onChange={(checked) => dispatchGlobalSetting(setChatPersistence(checked ? 'on' : 'off'))}
        />
      </SettingRow>

      {/* 표시 방식 — inline(합치기) / floating(아이콘+팝오버). 새로고침 필요. */}
      <SettingRow label={t('displayMode' as any)} hint={t('needRefresh')}>
        <Segmented<NonNullable<SettingInterface['displayMode']>>
          size='sm'
          label={t('displayMode' as any)}
          value={globalSetting.displayMode ?? 'inline'}
          onChange={(v) => dispatchGlobalSetting(setDisplayMode(v))}
          options={[
            { value: 'inline', label: t('displayModeInline' as any) },
            { value: 'floating', label: t('displayModeFloating' as any) },
          ]}
        />
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
      <Stack dir='row' align='center' justify='space-between' gap={8} style={{ marginTop: 4 }}>
        <span
          style={{ ...metaTextStyle, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--ui-muted)' }}
        >
          {otaInfo.rev !== null
            ? `OTA selectors rev ${otaInfo.rev}${otaInfo.fetchedAt ? ` (${new Date(otaInfo.fetchedAt).toLocaleString()})` : ''}`
            : t('otaBundled')}
        </span>
        <Stack dir='row' gap={2} align='center'>
          {diag.kind === 'done' && (
            <span style={{ ...metaTextStyle, color: diag.failCount > 0 ? 'var(--ui-bad-fg)' : 'var(--ui-ok-fg)' }}>
              {diag.failCount > 0 ? browser.i18n.getMessage('diagFailCount' as any, [String(diag.failCount), String(diag.passCount + diag.failCount)]) : `OK ${diag.passCount}`}
            </span>
          )}
          {diag.kind === 'error' && (
            <span style={{ ...metaTextStyle, color: 'var(--ui-bad-fg)' }}>{diag.message}</span>
          )}
          <Button
            size='sm'
            variant='text'
            onClick={runDiagnose}
            disabled={diag.kind === 'running'}
            style={metaButtonStyle}
          >
            {diag.kind === 'running' ? t('diagRunning') : t('diagRun')}
          </Button>
          {diag.kind === 'done' && (
            <Button
              size='sm'
              variant='text'
              onClick={copyReport}
              style={metaButtonStyle}
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
                size='sm'
                variant='text'
                onClick={onSubmitClick}
                disabled={disabled}
                style={metaButtonStyle}
              >
                {label}
              </Button>
            );
          })()}
        </Stack>
      </Stack>
      {submitError && (
        <span style={{ ...metaTextStyle, color: 'var(--ui-bad-fg)', textAlign: 'right' }}>
          {submitError}
        </span>
      )}
      {/* 첫 제보 시 동의 다이얼로그 — sanitize된 실 payload 미리보기 후 승인. */}
      <Dialog
        open={consentDialog.open}
        onClose={closeConsentDialog}
        width='sm'
        title={t('reportConsentTitle')}
        actions={<>
          <Button size='sm' onClick={closeConsentDialog}>{t('cancel')}</Button>
          <Button size='sm' variant='primary' onClick={onConsentAccept}>{t('reportConsentAccept')}</Button>
        </>}
      >
        <Stack gap={8}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ui-muted)' }}>
            {t('reportConsentBody')}
          </span>
          <pre
            style={{
              fontSize: 10,
              margin: 0,
              padding: 8,
              borderRadius: 8,
              background: 'var(--ui-tint)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              userSelect: 'text',
            }}
          >
            {consentDialog.preview}
          </pre>
        </Stack>
      </Dialog>
    </Stack>
  );
}

/** 좌측 라벨(+선택 hint) + 우측 컨트롤 한 줄 레이아웃. 컴팩트한 설정 행 패턴. */
function SettingRow({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Stack dir='row' align='center' justify='space-between' gap={8}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{label}</div>
        {hint && (
          <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2, color: 'var(--ui-muted)' }}>
            {hint}
          </div>
        )}
      </div>
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
    <Stack gap={8} style={{ padding: 12 }}>
      {/* 헤더: 로고 + 이름 + 버전 chip */}
      <Stack dir='row' align='center' gap={8}>
        {/* 로고 + 이름 = badgecollector.dev 링크 (사이트 로고가 확장 아이콘과 같다) */}
        <a href='https://badgecollector.dev' target='_blank' rel='noreferrer' className='tbc-brand-link'
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: 1, fontSize: 14, fontWeight: 800, color: 'inherit', textDecoration: 'none' }}>
          <img src={browser.runtime.getURL('/assets/icon.png')} alt="" style={{ width: '1rem', height: '1rem' }} />
          <span>{browser.i18n.getMessage('ExtensionName')}</span>
        </a>
        <Tag>{`v${browser.runtime.getManifest().version}`}</Tag>
      </Stack>

      <TranslationNotice
        language={browser.i18n.getUILanguage()}
        message={browser.i18n.getMessage('translationNotice' as any)}
        dismissLabel={browser.i18n.getMessage('dismiss' as any)}
      />

      {/* primary CTA: 필터 설정 (가장 자주 쓰는 액션) */}
      <Button
        variant='primary'
        icon='filter_alt'
        block
        onClick={() => onPageButtonClicked("filter")}
        style={{ marginTop: 4 }}
      >
        {browser.i18n.getMessage("p_filter_btn")}
      </Button>

      {/* secondary: 일반 설정 */}
      <Button
        icon='settings'
        block
        onClick={() => router.navigate("/setting")}
      >
        {browser.i18n.getMessage("generalSetting")}
      </Button>

      {/* 채팅 캡쳐 시작 — 활성 탭의 content script로 메시지 */}
      <Button
        icon='photo_camera'
        block
        onClick={() => sendToActiveContent('tbc-start-capture')}
      >
        {browser.i18n.getMessage('startCapture' as any)}
      </Button>

      {/* 저장된 채팅 비우기 */}
      <Button
        icon='delete_sweep'
        block
        onClick={() => sendToActiveContent('tbc-clear-chats')}
      >
        {browser.i18n.getMessage('clearCollectedChats' as any)}
      </Button>

      {/* tertiary: 비율 초기화 — 가끔 쓰는 액션은 text variant로 demote */}
      <Button
        variant='text'
        size='sm'
        icon='restart_alt'
        onClick={onRatioResetButtonClicked}
        style={{ alignSelf: 'flex-start', color: 'var(--ui-muted)' }}
      >
        {browser.i18n.getMessage('reset_chat_ratio')}
      </Button>

      {/* 푸터: socials only */}
      <div style={{ marginTop: 4, borderTop: '1px solid var(--ui-hair)', paddingTop: 8 }}>
        <SocialFooter showExtensionInfo={false} />
      </div>
    </Stack>
  );
}

const ContextRouter = () => {
  const { globalSetting, dispatchGlobalSetting } = useExtensionGlobalSetting();
  // 사용자 설정(system/light/dark)을 boolean으로 해석.
  const isDark = useResolvedDarkMode(globalSetting.darkTheme);
  useDocumentTheme(isDark);

  return (
    <GlobalSettingContext.Provider
      value={{ globalSetting, dispatchGlobalSetting }}
    >
      <RouterProvider router={router} />
    </GlobalSettingContext.Provider>
  )
}

ReactDOM.createRoot(document.getElementById("root") as Element).render(
  <React.StrictMode>
    <ContextRouter />
  </React.StrictMode>
);
