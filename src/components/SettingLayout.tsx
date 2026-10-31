import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon, TextInput } from '@/ui';
import { getPlatformConfig, manifestReady } from '@/platform/host-selectors';
import { ensureRolloutBucket, isSocketRenderEnabled } from '@/content-scripts/chzzk/socket-mode';
import { GeneralRow, searchGeneral } from './GeneralSetting';
import { PlatformChip, SettingsCard } from './settings/SettingsUI';
import { siteUrl } from '@/utils/site-link';
import SocialFooter from './SocialFooter';
import s from './SettingLayout.module.css';

/**
 * 설정 페이지 틀 (Chrome 설정형) — 위쪽 검색 막대, 왼쪽 메뉴(필터 설정·일반 설정·채팅 모양·채팅 보관함),
 * 가운데 열에 화면 제목 + 화면. 팝업에는 '필터 설정'과 '일반 설정' 두 진입점만 둔다.
 * 좁은 창에서는 메뉴가 위쪽 탭 줄이 된다.
 */
const ITEMS = [
    { path: '/filter', icon: 'filter_alt', label: 'nav.filter' },
    { path: '/general', icon: 'settings', label: 'nav.general' },
    { path: '/template', icon: 'palette', label: 'nav.template', platform: 'chzzk', socketOnly: true },
    { path: '/archive', icon: 'inventory_2', label: 'nav.archive' },
] as const;

export default function SettingLayout() {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const [q, setQ] = useState('');
    // 채팅 모양(템플릿)은 치지직 소켓 모드에서만 동작한다 — 꺼진 사용자에게는 숨긴다
    const [socketRender, setSocketRender] = useState(false);
    useEffect(() => {
        Promise.all([manifestReady, ensureRolloutBucket()]).then(([, bucket]) =>
            setSocketRender(isSocketRenderEnabled(getPlatformConfig('chzzk').constants, null, bucket)));
    }, []);

    // 새로고침해도 보던 화면으로 — 주소의 initialPath를 지금 화면으로 맞춘다
    useEffect(() => {
        const u = new URL(window.location.href);
        u.searchParams.set('initialPath', location.pathname.replace(/^\//, ''));
        history.replaceState(history.state, '', u);
    }, [location.pathname]);

    const items = ITEMS.filter(i => !('socketOnly' in i) || socketRender);
    const current = items.find(i => location.pathname.startsWith(i.path));
    // 검색하면 화면과 상관없이 찾은 것만 — 메뉴 이름과 일반 설정 줄. 줄에는 어느 묶음인지 붙인다
    const query = q.trim();
    const navHits = query ? items.filter(i => t(i.label).toLowerCase().includes(query.toLowerCase())) : [];
    const hits = searchGeneral(query, id => t(`general.group_${id}`));

    return (
        <div className={s.layout}>
            <header className={s.bar}>
                <a className={s.brand} href={siteUrl('/', 'settings_brand')} target="_blank" rel="noreferrer">
                    <img src={browser.runtime.getURL('/assets/icon.png' as any)} alt="" />
                    <span>{t('nav.title')}</span>
                </a>
                <div className={s.search}>
                    <TextInput lead="search" value={q} placeholder={t('nav.search')} aria-label={t('nav.search')} onChange={e => setQ(e.target.value)} />
                </div>
            </header>
            <div className={s.body}>
                <nav className={s.nav} aria-label={t('nav.label')}>
                    {items.map(i => (
                        <NavLink key={i.path} to={i.path} onClick={() => setQ('')}
                            className={({ isActive }) => `${s.item} ${isActive && !query ? s.active : ''}`}>
                            <Icon name={i.icon} />
                            <span>{t(i.label)}</span>
                            {'platform' in i && <PlatformChip platform={i.platform} />}
                        </NavLink>
                    ))}
                    <a className={s.item} href={siteUrl('/', 'settings_nav')} target="_blank" rel="noreferrer">
                        <Icon name="public" />
                        <span>badgecollector.dev</span>
                        <Icon name="open_in_new" />
                    </a>
                </nav>
                <main className={s.main}>
                    {query ? (
                        <>
                            <h1 className={s.title}>{t('nav.search_results', { q: query })}</h1>
                            {navHits.map(i => (
                                <button key={i.path} type="button" className={s.hit} onClick={() => { setQ(''); navigate(i.path); }}>
                                    <Icon name={i.icon} /><b>{t(i.label)}</b><Icon name="chevron_right" />
                                </button>
                            ))}
                            {hits.length > 0 && (
                                <SettingsCard>
                                    {hits.map(({ group, item }) => (
                                        <div key={item.key}>
                                            <div className={s.where}>{t('nav.general')} › {t(`general.group_${group.id}`)}</div>
                                            <GeneralRow item={item} />
                                        </div>
                                    ))}
                                </SettingsCard>
                            )}
                            {!hits.length && !navHits.length && <p className={s.empty}>{t('nav.no_results')}</p>}
                        </>
                    ) : (
                        <>
                            {current && <h1 className={s.title}>{t(current.label)}</h1>}
                            <Outlet />
                        </>
                    )}
                    <div className={s.footer}><SocialFooter /></div>
                </main>
            </div>
        </div>
    );
}
