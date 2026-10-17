/**
 * PROTOTYPE — 팝업 디자인 시안 3개. 배지 사이트(badgecollector.dev)의 디자인 언어에 맞추고 UX도 함께 바꿔 본다.
 * "세 가지 팝업 시안을 `?variant=` 로 전환. '0'은 지금 배포 중인 팝업." 개발 빌드에서만 보인다.
 *
 * 설정 토글은 진짜 설정에 쓴다(개발 프로필이라 무해). 캡처·비우기도 진짜로 보낸다.
 */
import React, { useEffect, useState } from 'react';
import { useGlobalSettingContext } from '@/context/GlobalSetting';
import {
    setChatPersistence, setChatTime, setCollectedChatMarker, setDarkTheme, setDisplayMode, setJumpToBottomButton,
    setMaximumNumberChats, setPosition, setChzzkChatSide, setChzzkCustomTemplate,
} from '@/reducer/setting';
import { getAdapter } from '@/platform';
import { ProtoDarkOverride, useProtoThemeClass } from '@/components/prototype/PrototypeSwitcher';
import type { CompositeFilterElement } from '@/interfaces/filter';
import type { SettingInterface } from '@/interfaces/setting';

const t = (k: string) => browser.i18n.getMessage(k as any) || k;

// ── 공통 데이터 ─────────────────────────────────────────────

export type TabContext = { platform: 'chzzk' | 'twitch' | null; label: string };

/** 미리보기 페이지에서 "지금 탭"을 흉내 낸다. 진짜 팝업에선 null → 활성 탭을 본다. */
export const TabContextOverride = React.createContext<TabContext | null>(null);

function useTabContext(): TabContext {
    const override = React.useContext(TabContextOverride);
    const [ctx, setCtx] = useState<TabContext>({ platform: null, label: '' });
    useEffect(() => {
        if (override) return;
        browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
            const url = tab?.url ?? '';
            if (/chzzk\.naver\.com\/live\//.test(url)) setCtx({ platform: 'chzzk', label: '치지직 라이브' });
            else if (/chzzk\.naver\.com\/video\//.test(url)) setCtx({ platform: 'chzzk', label: '치지직 다시보기' });
            else if (/chzzk\.naver\.com/.test(url)) setCtx({ platform: 'chzzk', label: '치지직' });
            else if (/twitch\.tv\/videos\//.test(url)) setCtx({ platform: 'twitch', label: '트위치 다시보기' });
            else if (/twitch\.tv/.test(url)) setCtx({ platform: 'twitch', label: '트위치' });
            else setCtx({ platform: null, label: '지원하지 않는 페이지' });
        }).catch(() => setCtx({ platform: null, label: '지원하지 않는 페이지' }));
    }, [override]);
    return override ?? ctx;
}

function useFilters(): CompositeFilterElement[] {
    const [filters, setFilters] = useState<CompositeFilterElement[]>([]);
    useEffect(() => { browser.storage.local.get('filter').then(r => setFilters((r.filter as CompositeFilterElement[]) ?? [])); }, []);
    return filters;
}

async function sendToActive(type: 'tbc-start-capture' | 'tbc-clear-chats') {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) return;
    await browser.tabs.sendMessage(tab.id, { type }).catch(() => undefined);
    window.close();
}
const openPage = (path: string) => browser.tabs.create({ url: browser.runtime.getURL(`/setting.html?initialPath=${path}`) });
const resetRatio = () => browser.storage.local.set({ containerRatio: 30 });
const version = () => browser.runtime.getManifest().version;

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
    return (
        <div className="pt-seg">
            {options.map(([v, label]) => (
                <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{label}</button>
            ))}
        </div>
    );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
    return <button className="pt-switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="pt-row">
            <div className="pt-row-label">{label}{hint && <small>{hint}</small>}</div>
            {children}
        </div>
    );
}

function Logo() {
    return <img src={browser.runtime.getURL('/assets/icon.png')} alt="" width={22} height={22} />;
}

/** 설정 항목들. 시안마다 묶는 방식만 다르고 각 컨트롤은 같다. */
function useSettingControls() {
    const { globalSetting: s, dispatchGlobalSetting: d } = useGlobalSettingContext();
    const onOff = (v: boolean) => (v ? 'on' : 'off') as 'on' | 'off';
    return {
        s,
        theme: <Seg value={s.darkTheme} options={[['system', t('themeSystem')], ['light', t('themeLight')], ['dark', t('themeDark')]]} onChange={v => d(setDarkTheme(v))} />,
        position: <Seg value={s.position} options={[['up', t('up')], ['down', t('down')]]} onChange={v => d(setPosition(v))} />,
        side: <Seg value={s.chzzkChatSide} options={[['left', t('chatSideLeft')], ['right', t('chatSideRight')]]} onChange={v => d(setChzzkChatSide(v))} />,
        display: <Seg value={s.displayMode ?? 'inline'} options={[['inline', t('displayModeInline')], ['floating', t('displayModeFloating')]]} onChange={v => d(setDisplayMode(v as SettingInterface['displayMode']))} />,
        render: <Seg value={s.chzzkCustomTemplate} options={[['off', t('chatRenderNative')], ['on', t('chatRenderTemplate')]]} onChange={v => d(setChzzkCustomTemplate(v))} />,
        max: <input className="pt-input" type="number" min={1} style={{ width: 84 }} value={s.maximumNumberChats} onChange={e => d(setMaximumNumberChats(Number(e.target.value)))} />,
        time: <Toggle label={t('chatTime')} on={s.chatTime === 'on'} onChange={v => d(setChatTime(onOff(v)))} />,
        marker: <Toggle label={t('collectedChatMarker')} on={s.collectedChatMarker !== 'off'} onChange={v => d(setCollectedChatMarker(onOff(v)))} />,
        jump: <Toggle label={t('jumpToBottomButton')} on={s.jumpToBottomButton !== 'off'} onChange={v => d(setJumpToBottomButton(onOff(v)))} />,
        persist: <Toggle label={t('chatPersistence')} on={s.chatPersistence !== 'off'} onChange={v => d(setChatPersistence(onOff(v)))} />,
    };
}

function Shell({ children }: { children: React.ReactNode }) {
    const themeClass = useProtoThemeClass();
    // 지금 팝업은 #root를 24rem(384px)으로 막고 안에서 스크롤한다. 브라우저 팝업 한도(600px)까지 쓴다.
    useEffect(() => {
        const root = document.getElementById('root');
        if (!root || !location.pathname.endsWith('popup.html')) return;
        root.style.maxHeight = '600px';
        return () => { root.style.maxHeight = ''; };
    }, []);
    return <div className={themeClass} style={{ width: '100%', minHeight: 200, paddingBottom: 48 }}>{children}</div>;
}

function Header({ right }: { right?: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '2px solid var(--rule)' }}>
            <Logo />
            <b style={{ fontWeight: 900, fontSize: 16, letterSpacing: '-0.03em', flex: 1 }}>Badge Collector</b>
            {right ?? <span className="pt-tag">v{version()}</span>}
        </div>
    );
}

/** 지금 탭이 지원 페이지인지. 아니면 캡처·비우기를 미리 막는다 (지금은 누른 뒤 alert). */
function TabLine({ ctx }: { ctx: TabContext }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: ctx.platform ? '#2bd36b' : 'var(--hair)', border: '1.5px solid var(--line)' }} />
            <span>{ctx.label || '…'}</span>
        </div>
    );
}

// ── A: 한 장 ─────────────────────────────────────────────
// 하위 페이지(일반 설정)를 없애고 한 화면에 다 둔다. 자주 쓰는 순서대로 위에서 아래로.

export function VariantA() {
    const ctx = useTabContext();
    const c = useSettingControls();
    return (
        <Shell>
            <Header />
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <TabLine ctx={ctx} />
                <button className="pt-btn primary block" style={{ height: 46, fontSize: 15 }} onClick={() => openPage('filter')}>
                    {t('p_filter_btn')}
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button className="pt-btn small" disabled={!ctx.platform} onClick={() => sendToActive('tbc-start-capture')}>채팅 캡처</button>
                    <button className="pt-btn small" disabled={!ctx.platform} onClick={() => sendToActive('tbc-clear-chats')}>모은 채팅 비우기</button>
                </div>
                {!ctx.platform && <small className="pt-muted" style={{ marginTop: -4 }}>{t('onlyOnHostPage')}</small>}
            </div>

            <div style={{ padding: '4px 14px 0' }}>
                <div className="pt-section-head"><h2>모아보기</h2></div>
                <Row label={t('chatPosition')}>{c.position}</Row>
                <Row label={t('displayMode')} hint={t('needRefresh')}>{c.display}</Row>
                <Row label={t('maximumNumberChats')} hint={t('needRefresh')}>{c.max}</Row>
                <Row label={t('chatTime')}>{c.time}</Row>
                <Row label={t('jumpToBottomButton')}>{c.jump}</Row>
                <Row label={t('chatPersistence')}>{c.persist}</Row>
                <Row label={t('collectedChatMarker')}>{c.marker}</Row>

                <div className="pt-section-head" style={{ marginTop: 12 }}><h2>치지직</h2></div>
                <Row label="채팅창 위치">{c.side}</Row>
                <Row label="모아보기 채팅 모양">{c.render}</Row>
                {c.s.chzzkCustomTemplate === 'on' && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 0 8px' }}>
                        <button className="pt-link" onClick={() => openPage('template')}>{t('templateSettingButton')} →</button>
                    </div>
                )}

                <div className="pt-section-head" style={{ marginTop: 12 }}><h2>화면</h2></div>
                <Row label={t('theme')}>{c.theme}</Row>

            </div>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '14px', marginTop: 8, borderTop: '1px solid var(--hair)', fontSize: 12 }}>
                <button className="pt-link" onClick={resetRatio}>{t('reset_chat_ratio')}</button>
                <button className="pt-link">{t('diagRun')}</button>
                <span style={{ flex: 1 }} />
                <a className="pt-link" href="https://badgecollector.dev" target="_blank" rel="noreferrer">badgecollector.dev</a>
            </div>
        </Shell>
    );
}

// ── B: 탭 ─────────────────────────────────────────────
// 수집 / 설정 / 도움 세 탭. 첫 화면은 "지금 이 탭에서 뭘 하나"에 집중하고, 진단·제보는 도움 탭으로 올린다.

export function VariantB() {
    const ctx = useTabContext();
    const filters = useFilters();
    const c = useSettingControls();
    const [tab, setTab] = useState<'collect' | 'setting' | 'help'>('collect');
    const platform = ctx.platform ?? c.s.platform;
    const mine = filters.filter(f => f.platform === platform);
    const active = mine.filter(f => f.filterType !== 'sleep');

    return (
        <Shell>
            <Header />
            <div className="pt-tabs" style={{ padding: '0 14px' }} role="tablist">
                {([['collect', '수집'], ['setting', '설정'], ['help', '도움']] as const).map(([k, label]) => (
                    <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>
                ))}
            </div>

            {tab === 'collect' && (
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ border: '2px solid var(--line)', borderRadius: 12, padding: 14, background: ctx.platform ? 'var(--yellow)' : 'var(--tint)', color: ctx.platform ? 'var(--on-yellow)' : 'var(--ink)' }}>
                        <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.7 }}>지금 탭</div>
                        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em' }}>{ctx.label || '…'}</div>
                        <div style={{ marginTop: 6, fontWeight: 700 }}>
                            {ctx.platform ? <>필터 {active.length}개로 모으는 중</> : t('onlyOnHostPage')}
                        </div>
                    </div>
                    <button className="pt-btn primary block" style={{ height: 44 }} onClick={() => openPage('filter')}>{t('p_filter_btn')}</button>
                    <div>
                        {[
                            ['채팅 캡처', () => sendToActive('tbc-start-capture'), !ctx.platform],
                            ['모은 채팅 비우기', () => sendToActive('tbc-clear-chats'), !ctx.platform],
                            [t('reset_chat_ratio'), resetRatio, false],
                        ].map(([label, fn, disabled]) => (
                            <button key={label as string} disabled={disabled as boolean} onClick={fn as () => void}
                                style={{ display: 'flex', width: '100%', justifyContent: 'space-between', padding: '12px 2px', border: 0, borderBottom: '1px solid var(--hair)', background: 'none', fontWeight: 700, cursor: 'pointer', opacity: disabled ? 0.4 : 1 }}>
                                <span>{label as string}</span><span className="pt-muted">→</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {tab === 'setting' && (
                <div style={{ padding: '6px 14px 0' }}>
                    <Row label={t('theme')}>{c.theme}</Row>
                    <Row label={t('chatPosition')}>{c.position}</Row>
                    <Row label={t('displayMode')} hint={t('needRefresh')}>{c.display}</Row>
                    <Row label={t('maximumNumberChats')} hint={t('needRefresh')}>{c.max}</Row>
                    <Row label={t('chatTime')}>{c.time}</Row>
                    <Row label={t('jumpToBottomButton')}>{c.jump}</Row>
                    <Row label={t('chatPersistence')}>{c.persist}</Row>
                    <Row label={t('collectedChatMarker')}>{c.marker}</Row>
                    <div className="pt-section-head" style={{ marginTop: 10 }}><h2>치지직</h2></div>
                    <Row label="채팅창 위치">{c.side}</Row>
                    <Row label="모아보기 채팅 모양">{c.render}</Row>
                    {c.s.chzzkCustomTemplate === 'on' && (
                        <div style={{ textAlign: 'right', paddingBottom: 8 }}><button className="pt-link" onClick={() => openPage('template')}>{t('templateSettingButton')} →</button></div>
                    )}
                </div>
            )}

            {tab === 'help' && (
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <div className="pt-section-head"><h2>채팅이 안 모일 때</h2></div>
                        <p style={{ margin: '6px 0 10px' }} className="pt-muted">치지직이나 트위치 화면이 바뀌면 수집이 멈출 수 있습니다. 진단을 돌려 결과를 보내 주세요.</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="pt-btn small" disabled={!ctx.platform}>진단 실행</button>
                            <button className="pt-btn small" disabled>결과 보내기</button>
                        </div>
                    </div>
                    <div>
                        <div className="pt-section-head"><h2>링크</h2></div>
                        {[['배지 사이트', 'https://badgecollector.dev'], ['디스코드', '#'], ['GitHub', 'https://github.com/Deepbluewarn/twitch-badge-collector-v2'], ['메일', '#']].map(([label, href]) => (
                            <a key={label} href={href} target="_blank" rel="noreferrer" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 2px', borderBottom: '1px solid var(--hair)', textDecoration: 'none', fontWeight: 700 }}>
                                <span>{label}</span><span className="pt-muted">↗</span>
                            </a>
                        ))}
                    </div>
                    <small className="pt-muted">v{version()} · selector rev 19</small>
                </div>
            )}
        </Shell>
    );
}

// ── C: 지금 모으는 것 ─────────────────────────────────────────────
// 맨 위 노란 시트에 "무엇을 모으는지"(켜진 배지 필터)를 그림으로 보여 준다. 자주 바꾸는 설정은
// 큰 타일로, 나머지는 접어 둔다.

export function VariantC() {
    const ctx = useTabContext();
    const filters = useFilters();
    const c = useSettingControls();
    const [more, setMore] = useState(false);
    const platform = ctx.platform ?? c.s.platform;
    const adapter = getAdapter(platform);
    const active = filters.filter(f => f.platform === platform && f.filterType === 'include');
    const atoms = active.flatMap(f => f.filters.filter(a => a.type === 'include'));
    const badges = atoms.filter(a => a.category === 'badge');
    const words = atoms.filter(a => a.category !== 'badge');
    const excluded = filters.filter(f => f.platform === platform && f.filterType === 'exclude').length;
    const { dispatchGlobalSetting: d } = useGlobalSettingContext();

    const tiles: [string, boolean, (v: boolean) => void][] = [
        ['시간 표시', c.s.chatTime === 'on', v => d(setChatTime(v ? 'on' : 'off'))],
        ['수집 표시', c.s.collectedChatMarker !== 'off', v => d(setCollectedChatMarker(v ? 'on' : 'off'))],
        ['새로고침 후 유지', c.s.chatPersistence !== 'off', v => d(setChatPersistence(v ? 'on' : 'off'))],
        ['맨 아래로 버튼', c.s.jumpToBottomButton !== 'off', v => d(setJumpToBottomButton(v ? 'on' : 'off'))],
    ];

    return (
        <Shell>
            <Header right={<TabLine ctx={ctx} />} />
            <div style={{ padding: 14 }}>
                <button onClick={() => openPage('filter')} style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', padding: 14, borderRadius: 14, border: '2px solid var(--line)', background: 'var(--yellow)', color: 'var(--on-yellow)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <b style={{ fontSize: 16, fontWeight: 900 }}>{platform === 'chzzk' ? '치지직' : '트위치'}에서 모으는 채팅</b>
                        <span style={{ fontWeight: 800, fontSize: 13 }}>편집 →</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                        {badges.map(b => (
                            <span key={b.id} title={b.badgeName} style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 10, background: '#fff' }}>
                                <img src={adapter.getBadgeImageUrl(b.value, '2x')} alt={b.badgeName} width={26} height={26} />
                            </span>
                        ))}
                        {words.map(w => (
                            <span key={w.id} style={{ display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 10px', borderRadius: 10, background: '#fff', fontWeight: 800, fontSize: 13 }}>
                                {w.category === 'name' ? '@' : '“'}{w.value}{w.category === 'keyword' ? '”' : ''}
                            </span>
                        ))}
                        {badges.length + words.length === 0 && <span style={{ fontWeight: 700 }}>아직 없음 — 눌러서 추가</span>}
                    </div>
                    {excluded > 0 && <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700 }}>제외 규칙 {excluded}개</div>}
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                    {tiles.map(([label, on, set]) => (
                        <button key={label} onClick={() => set(!on)} aria-pressed={on}
                            style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', border: '2px solid var(--line)', background: on ? 'var(--yellow)' : 'var(--paper)', color: on ? 'var(--on-yellow)' : 'var(--ink)' }}>
                            <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.7 }}>{on ? '켜짐' : '꺼짐'}</div>
                            <div style={{ fontWeight: 800 }}>{label}</div>
                        </button>
                    ))}
                </div>

                <button onClick={() => setMore(m => !m)} aria-expanded={more}
                    style={{ display: 'flex', width: '100%', justifyContent: 'space-between', marginTop: 14, padding: '10px 0', border: 0, borderTop: '2px solid var(--rule)', background: 'none', fontWeight: 900, cursor: 'pointer' }}>
                    <span>모든 설정</span><span>{more ? '−' : '+'}</span>
                </button>
                {more && (
                    <div>
                            <Row label={t('chatPosition')}>{c.position}</Row>
                        <Row label={t('displayMode')} hint={t('needRefresh')}>{c.display}</Row>
                        <Row label={t('maximumNumberChats')} hint={t('needRefresh')}>{c.max}</Row>
                        <Row label="채팅창 위치 (치지직)">{c.side}</Row>
                        <Row label="채팅 모양 (치지직)">{c.render}</Row>
                    </div>
                )}
            </div>
            <div style={{ display: 'flex', borderTop: '2px solid var(--rule)' }}>
                {[
                    ['캡처', () => sendToActive('tbc-start-capture'), !ctx.platform],
                    ['비우기', () => sendToActive('tbc-clear-chats'), !ctx.platform],
                    ['비율 초기화', resetRatio, false],
                    ['진단', () => undefined, !ctx.platform],
                ].map(([label, fn, disabled], i) => (
                    <button key={label as string} disabled={disabled as boolean} onClick={fn as () => void}
                        style={{ flex: 1, padding: '12px 0', border: 0, borderLeft: i ? '1px solid var(--hair)' : 0, background: 'none', fontWeight: 800, fontSize: 12, cursor: 'pointer', opacity: disabled ? 0.35 : 1 }}>
                        {label as string}
                    </button>
                ))}
            </div>
        </Shell>
    );
}

export const POPUP_VARIANTS = { A: VariantA, B: VariantB, C: VariantC };
export const POPUP_VARIANT_NAMES: Record<string, string> = { '0': '지금 팝업', A: '한 장', B: '탭', C: '지금 모으는 것' };

/** PROTOTYPE — 팝업 시안 세 개를 일반 탭에서 실제 팝업 크기(352×600)로 나란히. 팝업은 포커스를 잃으면 닫혀서. */
export function PopupPreviewPage() {
    const presets: Record<string, TabContext> = {
        chzzk: { platform: 'chzzk', label: '치지직 라이브' },
        twitch: { platform: 'twitch', label: '트위치' },
        none: { platform: null, label: '지원하지 않는 페이지' },
    };
    const [tab, setTab] = useState<keyof typeof presets>('chzzk');
    const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>('auto');
    // 툴바 팝업 동작 — 시안이면 이 페이지를 연다, '0'이면 지금 팝업. PrototypeSwitcher와 같은 키.
    const KEY = 'tbc-proto-variant:popup';
    const [toolbar, setToolbar] = useState(() => (localStorage.getItem(KEY) === '0' ? '0' : 'preview'));
    const setToolbarMode = (v: string) => { setToolbar(v); localStorage.setItem(KEY, v === '0' ? '0' : 'A'); };
    return (
        <ProtoDarkOverride.Provider value={theme === 'auto' ? null : theme === 'dark'}>
        <PreviewFrame>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                <h1 style={{ fontSize: 28, fontWeight: 900 }}>팝업 시안</h1>
                <span className="pt-muted">지금 탭</span>
                <Seg value={tab} options={[['chzzk', '치지직 라이브'], ['twitch', '트위치'], ['none', '지원 안 함']]} onChange={setTab} />
                <span className="pt-muted">테마</span>
                <Seg value={theme} options={[['auto', '설정 따름'], ['light', '밝게'], ['dark', '어둡게']]} onChange={setTheme} />
                <span className="pt-muted">툴바 팝업</span>
                <Seg value={toolbar} options={[['preview', '이 페이지 열기'], ['0', '지금 팝업']]} onChange={setToolbarMode} />
                <span className="pt-tag yellow">프로토타입 · 설정 토글은 진짜 설정에 씀</span>
            </div>
            <TabContextOverride.Provider value={presets[tab]}>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    {(['A', 'B', 'C'] as const).map(k => {
                        const V = POPUP_VARIANTS[k];
                        return (
                            <div key={k}>
                                <div style={{ fontWeight: 900, marginBottom: 8 }}>{k} · {POPUP_VARIANT_NAMES[k]}</div>
                                <div style={{ width: 352, height: 600, overflow: 'auto', border: '2px solid var(--line)', borderRadius: 10, background: 'var(--paper)' }}>
                                    <V />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </TabContextOverride.Provider>
        </PreviewFrame>
        </ProtoDarkOverride.Provider>
    );
}

function PreviewFrame({ children }: { children: React.ReactNode }) {
    return <div className={useProtoThemeClass()} style={{ minHeight: '100vh', background: 'var(--tint)', padding: '28px 24px 60px' }}>{children}</div>;
}
