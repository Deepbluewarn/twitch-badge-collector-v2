import React, { useEffect } from 'react';
import { useGlobalSettingContext } from '@/context/GlobalSetting';
import { setChatPersistence, setChatTime, setCollectedChatMarker, setDarkTheme, setDisplayMode, setFloatingBgColor, setJumpToBottomButton, setMaximumNumberChats, setPosition, setChzzkChatSide } from '@/reducer/setting';
import { SettingInterface } from '@/interfaces/setting';
import { useTranslation } from 'react-i18next';
import { Button, Segmented, Stack, Switch, Tag, TextInput } from '@/ui';
import { CHANNEL_OFF_KEY, getOffChannels, parseChannelKey, setChannelOff, type OffChannels } from '@/utils/channel-off';
import { ChannelAvatar } from './filter/ChannelSearch';
import { SectionTitle, SettingRow, SettingsCard } from './settings/SettingsUI';

/**
 * 일반 설정 — 예전엔 팝업 안에서 열렸다. 설정 페이지의 한 화면으로 옮겼다.
 * 문구는 팝업과 같은 _locales(browser.i18n)를 쓴다(묶음 제목만 react-i18next). 진단(지금 방송 탭 대상)은 팝업에 남아 있다.
 * 항목은 generalGroups 한 곳에 두고, 설정 페이지 맨 위 검색도 같은 줄을 그린다.
 */

const metaButtonStyle: React.CSSProperties = { height: 24, fontSize: 12, fontWeight: 700 };

/**
 * 색상 swatch + native picker. change 이벤트만 청취해 드래그 중 storage 폭주 방지.
 * 빈 값은 "자동" 의미 — reset 버튼으로 비울 수 있음.
 */
export function BgColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
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

/** 일반 설정의 꺼진 채널 목록 — 그 방송에 다시 들어가지 않고도 켤 수 있게. 꺼진 채널이 없으면 그리지 않는다. */
export function OffChannelList() {
  const t = (k: string) => browser.i18n.getMessage(k as any);
  const [map, setMap] = React.useState<OffChannels>({});
  useEffect(() => {
    getOffChannels().then(setMap);
    const onChange = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && CHANNEL_OFF_KEY in changes) getOffChannels().then(setMap);
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, []);
  const [q, setQ] = React.useState('');
  const all = Object.entries(map).sort((a, b) => b[1].at - a[1].at);
  if (!all.length) return null;
  // 많아지면(필터 목록의 채널 목록과 같은 기준) 이름·ID로 찾는다
  const query = q.trim().toLowerCase();
  const entries = query ? all.filter(([key, v]) => (v.name ?? '').toLowerCase().includes(query) || parseChannelKey(key).id.toLowerCase().includes(query)) : all;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {all.length > 8 && (
        <TextInput size='sm' lead='search' value={q} onChange={e => setQ(e.target.value)} aria-label={t('offChannels')} />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto', padding: 4, borderRadius: 10, background: 'var(--ui-tint)' }}>
        {entries.map(([key, v]) => {
          const { platform, id } = parseChannelKey(key);
          return (
            <Stack key={key} dir='row' align='center' gap={8} style={{ padding: '4px 6px' }}>
              <ChannelAvatar src={v.image} size={20} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700 }}>
                {v.name || id}
              </span>
              <Tag>{platform === 'chzzk' ? 'CHZZK' : 'Twitch'}</Tag>
              <Button size='sm' variant='text' style={metaButtonStyle} onClick={() => setChannelOff(platform, id, false)}>
                {t('turnOn')}
              </Button>
            </Stack>
          );
        })}
      </div>
    </div>
  );
}

/** 꺼진 채널이 하나라도 있는지 — 없으면 묶음째 숨긴다 */
function useHasOffChannels() {
  const [has, setHas] = React.useState(false);
  useEffect(() => {
    const check = () => getOffChannels().then(m => setHas(Object.keys(m).length > 0));
    check();
    const onChange = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && CHANNEL_OFF_KEY in changes) check();
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, []);
  return has;
}

type Dispatch = ReturnType<typeof useGlobalSettingContext>['dispatchGlobalSetting'];
const msg = (k: string) => browser.i18n.getMessage(k as any);
const onOff = (v: unknown) => v !== 'off';

/** 일반 설정 한 줄. 검색 결과에서도 같은 줄을 그린다. */
export interface GeneralItem {
  key: string;
  label: string;
  hint?: string;
  platform?: 'chzzk' | 'twitch';
  /** 다른 값에 따라 보일 때만 */
  when?: (s: SettingInterface) => boolean;
  render: (s: SettingInterface, dispatch: Dispatch) => React.ReactNode;
}

export interface GeneralGroup { id: 'look' | 'layout' | 'chat'; items: GeneralItem[] }

function sw(get: (s: SettingInterface) => boolean, set: (on: boolean) => Parameters<Dispatch>[0]): GeneralItem['render'] {
  return (s, dispatch) => <Switch checked={get(s)} onChange={on => dispatch(set(on))} />;
}

export function generalGroups(): GeneralGroup[] {
  return [
    {
      id: 'look', items: [
        {
          key: 'theme', label: msg('theme'),
          render: (s, dispatch) => (
            <Segmented<SettingInterface['darkTheme']> size='sm' label={msg('theme')} value={s.darkTheme}
              onChange={v => dispatch(setDarkTheme(v))}
              options={[
                { value: 'system', icon: 'settings_brightness', label: msg('themeSystem') },
                { value: 'light', icon: 'light_mode', label: msg('themeLight') },
                { value: 'dark', icon: 'dark_mode', label: msg('themeDark') },
              ]} />
          ),
        },
        {
          key: 'displayMode', label: msg('displayMode'), hint: msg('needRefresh'),
          render: (s, dispatch) => (
            <Segmented<NonNullable<SettingInterface['displayMode']>> size='sm' label={msg('displayMode')} value={s.displayMode ?? 'inline'}
              onChange={v => dispatch(setDisplayMode(v))}
              options={[{ value: 'inline', label: msg('displayModeInline') }, { value: 'floating', label: msg('displayModeFloating') }]} />
          ),
        },
        {
          // 떠 있는 창 배경색 — 비어 있으면 자동 감지
          key: 'floatingBgColor', label: msg('floatingBgColor'), hint: msg('needRefresh'), when: s => s.displayMode === 'floating',
          render: (s, dispatch) => <BgColorPicker value={s.floatingBgColor || ''} onChange={c => dispatch(setFloatingBgColor(c))} />,
        },
      ],
    },
    {
      id: 'layout', items: [
        {
          key: 'position', label: msg('chatPosition'),
          render: (s, dispatch) => (
            <Segmented<SettingInterface['position']> size='sm' label={msg('chatPosition')} value={s.position}
              onChange={v => dispatch(setPosition(v))}
              options={[{ value: 'up', label: msg('up') }, { value: 'down', label: msg('down') }]} />
          ),
        },
        {
          // 호스트 사이드바(원본 채팅 + 모아보기)를 통째로 옮긴다
          key: 'chzzkChatSide', label: msg('chatSide'), hint: msg('chzzkChatSideHint'), platform: 'chzzk',
          render: (s, dispatch) => (
            <Segmented<SettingInterface['chzzkChatSide']> size='sm' label={msg('chatSide')} value={s.chzzkChatSide}
              onChange={v => dispatch(setChzzkChatSide(v))}
              options={[{ value: 'left', label: msg('chatSideLeft') }, { value: 'right', label: msg('chatSideRight') }]} />
          ),
        },
      ],
    },
    {
      id: 'chat', items: [
        {
          key: 'maximumNumberChats', label: msg('maximumNumberChats'), hint: msg('needRefresh'),
          render: (s, dispatch) => (
            <TextInput type='number' size='sm' min={1} aria-label={msg('maximumNumberChats')} value={s.maximumNumberChats}
              onChange={e => dispatch(setMaximumNumberChats(Number(e.target.value)))} style={{ width: 96 }} />
          ),
        },
        { key: 'chatTime', label: msg('chatTime'), render: sw(s => s.chatTime === 'on', on => setChatTime(on ? 'on' : 'off')) },
        { key: 'collectedChatMarker', label: msg('collectedChatMarker'), render: sw(s => onOff(s.collectedChatMarker), on => setCollectedChatMarker(on ? 'on' : 'off')) },
        { key: 'jumpToBottomButton', label: msg('jumpToBottomButton'), render: sw(s => onOff(s.jumpToBottomButton), on => setJumpToBottomButton(on ? 'on' : 'off')) },
        { key: 'chatPersistence', label: msg('chatPersistence'), render: sw(s => onOff(s.chatPersistence), on => setChatPersistence(on ? 'on' : 'off')) },
      ],
    },
  ];
}

export function GeneralRow({ item }: { item: GeneralItem }) {
  const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();
  return (
    <SettingRow label={item.label} hint={item.hint} platform={item.platform}>
      {item.render(globalSetting, dispatchGlobalSetting)}
    </SettingRow>
  );
}

/** 검색 — 이름·힌트·묶음 이름에 들어 있으면 */
export function searchGeneral(q: string, groupTitle: (id: GeneralGroup['id']) => string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return generalGroups().flatMap(g => g.items
    .filter(i => `${i.label} ${i.hint ?? ''} ${groupTitle(g.id)}`.toLowerCase().includes(needle))
    .map(item => ({ group: g, item })));
}

export default function GeneralSetting() {
  const { t } = useTranslation();
  const { globalSetting } = useGlobalSettingContext();
  const hasOff = useHasOffChannels();
  useEffect(() => { document.title = `${msg('generalSetting')} - TBC`; }, []);

  return (
    <>
      {generalGroups().map(g => (
        <section key={g.id}>
          <SectionTitle>{t(`general.group_${g.id}`)}</SectionTitle>
          <SettingsCard>
            {g.items.filter(i => !i.when || i.when(globalSetting)).map(i => <GeneralRow key={i.key} item={i} />)}
          </SettingsCard>
        </section>
      ))}
      {hasOff && (
        <section>
          <SectionTitle>{msg('offChannels')}</SectionTitle>
          <SettingsCard style={{ padding: '12px 16px' }}><OffChannelList /></SettingsCard>
        </section>
      )}
    </>
  );
}
