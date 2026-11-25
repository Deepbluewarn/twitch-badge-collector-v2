import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import SocialFooter from "@/components/SocialFooter";
import TranslationNotice from "@/components/TranslationNotice";
import { GlobalSettingContext } from "@/context/GlobalSetting";
import { addStorageUpdateListener } from "@/utils/utils-browser";
import { markUsage } from "@/telemetry/usage-mark";
import { useResolvedDarkMode } from "@/hooks/useResolvedDarkMode";
import useExtensionGlobalSetting from "@/hooks/useGlobalSettingExtension";
import { useDocumentTheme } from "@/ui/useDocumentTheme";
import { Button, LinkButton, Stack, Switch, Tag } from "@/ui";
import { CHANNEL_INFO_MESSAGE, setChannelOff, type ChannelInfo } from "@/utils/channel-off";
import { fetchChzzkChannel } from "@/api/chzzk-channel";
import { ChannelAvatar } from "@/components/filter/ChannelSearch";
import { contactUrl, featureGuideUrl, hasFeatureGuide, siteUrl } from "@/utils/site-link";
import "./popup.css";


/** 좌측 라벨(+선택 hint) + 우측 컨트롤 한 줄 레이아웃. */
function SettingRow({ label, hint, children }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }) {
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

/**
 * 방송 페이지에서 팝업을 열면 맨 위에: 지금 채널 + "이 채널에서 사용" 스위치 (src/utils/channel-off.ts).
 * 끄면 그 탭에서 새로고침 없이 모아보기 창·수집 표시가 사라지고, 확장 아이콘이 흑백이 된다.
 * 방송 페이지가 아니면(채널 ID가 없으면) 그리지 않는다.
 */
type HostInfo = ChannelInfo & { name?: string; image?: string };

/**
 * 지금 탭의 확장 스크립트에 채널 정보를 묻는다. 응답이 오면 방송 페이지(치지직·트위치)다 —
 * 캡쳐·초기화·진단은 이때만 누를 수 있다. 응답이 없으면 null, 묻는 중이면 undefined.
 */
function useHostTab(): [HostInfo | null | undefined, React.Dispatch<React.SetStateAction<HostInfo | null | undefined>>] {
  const [info, setInfo] = React.useState<HostInfo | null | undefined>(undefined);
  useEffect(() => {
    (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id == null) { setInfo(null); return; }
      const r = await browser.tabs.sendMessage(tab.id, { type: CHANNEL_INFO_MESSAGE }, { frameId: 0 }).catch(() => null) as ChannelInfo | null;
      if (!r) { setInfo(null); return; }
      setInfo({ ...r, name: r.platform === 'twitch' && r.channelId ? r.channelId : undefined });
      // 치지직은 이름·사진을 채널 정보로 (지금 탭이 치지직이라 권한 없이 그 탭을 거친다)
      if (r.platform === 'chzzk' && r.channelId) {
        fetchChzzkChannel(r.channelId).then(c => setInfo(i => i && { ...i, name: c.name, image: c.imageUrl })).catch(() => {});
      }
    })();
  }, []);
  return [info, setInfo];
}

function ChannelPower({ info, setInfo }: { info: HostInfo | null | undefined; setInfo: React.Dispatch<React.SetStateAction<HostInfo | null | undefined>> }) {
  const t = (k: string) => browser.i18n.getMessage(k as any);
  if (!info?.channelId) return null;
  const channelId = info.channelId;
  const toggle = (on: boolean) => {
    setInfo({ ...info, off: !on });
    setChannelOff(info.platform, channelId, !on, info.name, info.image);
  };
  return (
    // 회색 바탕 위 흰 카드 — 설정 페이지 카드와 같은 모양
    <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--ui-hair)', background: 'var(--ui-paper)' }}>
      <SettingRow
        label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <ChannelAvatar src={info.image} size={20} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.name ?? ''}</span>
        </span>}
        hint={t('channelEnabled')}>
        <Switch checked={!info.off} onChange={toggle} />
      </SettingRow>
    </div>
  );
}

function Popup() {
  const onPageButtonClicked = (path: string) => {
    browser.tabs.create({
      url: browser.runtime.getURL(`/setting.html?initialPath=${path}`)
    });
  };

  const [confirmClear, setConfirmClear] = React.useState(false);
  const [host, setHost] = useHostTab();
  // 캡쳐·초기화는 방송 페이지에서, 이 채널을 켜 둔 동안만 동작한다 — 아니면 잠근다
  const hostReady = !!host && !host.off;

  const onRatioResetButtonClicked = () => {
    markUsage('ratioReset');
    browser.storage.local.set({containerRatio: 30});
  }

  // 활성 탭의 content script로 메시지 전송. content는 chzzk/twitch 페이지에서만 mount
  // 되므로 다른 탭에선 sendMessage가 reject 됨 — 버튼이 잠겨 있어 보통은 오지 않는다.
  const sendToActiveContent = async (type: 'tbc-start-capture' | 'tbc-clear-chats') => {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const id = tabs[0]?.id;
      if (id == null) return;
      await browser.tabs.sendMessage(id, { type });
      window.close();
    } catch {
      // 버튼은 방송 페이지에서만 열려 있다 — 그새 탭이 닫혔거나 확장과 끊긴 경우. 확인 줄만 접는다.
      setConfirmClear(false);
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
        <a href={siteUrl('/', 'popup')} target='_blank' rel='noreferrer' className='tbc-brand-link'
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: 1, fontSize: 14, fontWeight: 800, color: 'inherit', textDecoration: 'none' }}>
          <img src={browser.runtime.getURL('/assets/icon.png')} alt="" style={{ width: '1rem', height: '1rem' }} />
          <span>{browser.i18n.getMessage('ExtensionName')}</span>
        </a>
        <Tag tone='off'>{`v${browser.runtime.getManifest().version}`}</Tag>
      </Stack>

      <ChannelPower info={host} setInfo={setHost} />

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
        className='tbc-popup-btn'
        onClick={() => onPageButtonClicked("filter")}
        style={{ marginTop: 4 }}
      >
        {browser.i18n.getMessage("p_filter_btn")}
      </Button>

      {/* secondary: 설정 페이지를 연다. 필터 말고도 일반 설정, 채팅 모양, 채팅 보관함이 있어 '일반 설정'이 아니라 '설정' */}
      <Button
        icon='settings'
        block
        className='tbc-popup-btn'
        onClick={() => onPageButtonClicked("general")}
      >
        {browser.i18n.getMessage("settings" as any)}
      </Button>

      {/* 채팅 캡쳐 시작 — 활성 탭의 content script로 메시지 */}
      <Button
        icon='photo_camera'
        block
        className='tbc-popup-btn'
        disabled={!hostReady}
        onClick={() => sendToActiveContent('tbc-start-capture')}
      >
        {browser.i18n.getMessage('startCapture' as any)}
      </Button>

      {/* 저장된 채팅 비우기 — 실수로 누르면 "채팅이 사라졌다"가 된다. 그 자리에서 한 번 묻는다
          (브라우저 confirm은 좁은 팝업 안에서 잘려 보인다). */}
      {confirmClear ? (
        <div className='tbc-popup-confirm' role='alertdialog' aria-label={browser.i18n.getMessage('clearCollectedChatsConfirm' as any)}>
          <span>{browser.i18n.getMessage('clearCollectedChatsConfirm' as any)}</span>
          <Stack dir='row' gap={6} justify='end'>
            <Button size='sm' onClick={() => setConfirmClear(false)}>{browser.i18n.getMessage('cancel' as any)}</Button>
            <Button size='sm' variant='primary' icon='delete_sweep' onClick={() => { markUsage('clearChats'); sendToActiveContent('tbc-clear-chats'); }}>
              {browser.i18n.getMessage('clearCollectedChatsDo' as any)}
            </Button>
          </Stack>
        </div>
      ) : (
        <Button icon='delete_sweep' block className='tbc-popup-btn' disabled={!hostReady} onClick={() => setConfirmClear(true)}>
          {browser.i18n.getMessage('clearCollectedChats' as any)}
        </Button>
      )}


      {/* 하단 한 줄: 비율 초기화(어디서나) + 사용 설명서, 문의(한국어 브라우저만, 페이지가 한국어뿐).
          문의 페이지에 Discord, GitHub, 메일 경로가 같이 있다. 그 밖의 언어는 설명서, 문의 대신 socials 아이콘 */}
      <Stack dir='row' align='center' justify='space-between' style={{ marginTop: 4, borderTop: '1px solid var(--ui-hair)', paddingTop: 8 }}>
        {/* 한국어는 설명서, 문의와 한 줄에 들어가게 짧은 이름 */}
        <Button variant='text' size='sm' icon='restart_alt' onClick={onRatioResetButtonClicked} style={{ color: 'var(--ui-muted)' }}>
          {browser.i18n.getMessage(hasFeatureGuide() ? 'resetRatioShort' as any : 'reset_chat_ratio')}
        </Button>
        {hasFeatureGuide() ? (
          <Stack dir='row' align='center'>
            <LinkButton variant='text' size='sm' icon='menu_book' href={featureGuideUrl('popup_guide')} target='_blank' rel='noreferrer'
              onClick={() => markUsage('guideOpen')} style={{ color: 'var(--ui-muted)' }}>
              {browser.i18n.getMessage('featureGuideShort' as any)}
            </LinkButton>
            <LinkButton variant='text' size='sm' icon='mail' href={contactUrl()} target='_blank' rel='noreferrer' style={{ color: 'var(--ui-muted)' }}>
              {browser.i18n.getMessage('contact' as any)}
            </LinkButton>
          </Stack>
        ) : (
          <div><SocialFooter showExtensionInfo={false} /></div>
        )}
      </Stack>
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
      <Popup />
    </GlobalSettingContext.Provider>
  )
}

markUsage('popupOpen');

ReactDOM.createRoot(document.getElementById("root") as Element).render(
  <React.StrictMode>
    <ContextRouter />
  </React.StrictMode>
);
