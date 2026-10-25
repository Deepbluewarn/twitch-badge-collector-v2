import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Icon, IconButton, Select, Spinner, Switch, TextInput } from '@/ui';
import {
    ARCHIVE_DAYS, ARCHIVE_SETTING_KEY, DEFAULT_ARCHIVE_SETTING, clearArchive, csvHead, csvRow, deleteArchiveChannel, eachArchivedChat,
    archiveCap, CHAT_DISK_BYTES, expiresSoon, formatArchiveTime, listArchiveChannels, loadArchiveSetting, queryArchivedChats, sanitizeArchiveSetting, saveArchiveSetting,
    textHead, textRow, type ArchiveChannel, type ArchiveSetting, type ArchivedChat,
} from '@/archive/chat-archive';
import { fetchChzzkChannel } from '@/api/chzzk-channel';
import { ChannelAvatar } from './filter/ChannelSearch';
import { Pager } from './filter/FilterList';
import { LinkRow, PlatformChip, RowLabel, SectionTitle, SettingRow, SettingsCard, SubHeader, settingsClass as ui } from './settings/SettingsUI';
import { useConfirm } from '@/ui/useConfirm';
import { captureChats } from '@/utils/captureChat';
import { fetchBadgesCached } from '@/utils/badgeCache';
import { getAdapter } from '@/platform';
import type { CompositeFilterElement } from '@/interfaces/filter';
import s from './Archive.module.css';

/** 예전 트위치 보관분엔 이미지 주소 대신 배지 식별자가 들어 있다 — 깨진 이미지로 그리지 않는다 */
const isBadgeUrl = (b: string) => b.startsWith('https://');

type ChannelRow = ArchiveChannel & { count: number };

/** 한 페이지의 채팅 수 */
const PAGE = 100;

function useArchiveSetting(): [ArchiveSetting, (s: ArchiveSetting) => void] {
    const [setting, setSetting] = useState(DEFAULT_ARCHIVE_SETTING);
    useEffect(() => {
        loadArchiveSetting().then(setSetting);
        const listener = (changes: Record<string, { newValue?: unknown }>) => {
            if (ARCHIVE_SETTING_KEY in changes) setSetting(sanitizeArchiveSetting(changes[ARCHIVE_SETTING_KEY].newValue));
        };
        browser.storage.local.onChanged.addListener(listener);
        return () => browser.storage.local.onChanged.removeListener(listener);
    }, []);
    return [setting, next => { setSetting(next); void saveArchiveSetting(next); }];
}

/** 채널 이름·사진 저장 — 채널이 수백 개여도 보관함을 열 때마다 다시 부르지 않게. 이름이 바뀔 수 있어 오래되면 다시. */
const NAME_CACHE_KEY = 'archiveChannelNames';
const NAME_TTL = 7 * 86_400_000;
const NAME_CONCURRENCY = 3;
/** 요청 사이 간격 — 치지직 API에 몰아서 부르지 않게 */
const NAME_DELAY = 150;
type NameInfo = { name: string; image?: string; at: number };

/** 치지직 라이브 채널은 이름·사진을 불러온다. 다시보기와 트위치는 주소의 값 그대로. */
function useChannelInfo(rows: ChannelRow[]) {
    const [info, setInfo] = useState<Record<string, NameInfo>>({});
    const started = useRef(new Set<string>());
    useEffect(() => {
        if (rows.length === 0) return;
        let alive = true;
        (async () => {
            const cached = ((await browser.storage.local.get(NAME_CACHE_KEY))[NAME_CACHE_KEY] ?? {}) as Record<string, NameInfo>;
            if (!alive) return;
            setInfo(i => ({ ...cached, ...i }));
            const queue = rows
                .filter(r => r.platform === 'chzzk' && r.mode === 'live' && !started.current.has(r.channelId))
                .filter(r => !cached[r.channelId] || Date.now() - cached[r.channelId].at > NAME_TTL)
                .map(r => r.channelId);
            queue.forEach(id => started.current.add(id));
            const found: Record<string, NameInfo> = {};
            // 한꺼번에 수백 번 부르지 않게 몇 개씩
            await Promise.all(Array.from({ length: NAME_CONCURRENCY }, async () => {
                for (let id = queue.shift(); id && alive; id = queue.shift()) {
                    try {
                        const c = await fetchChzzkChannel(id);
                        found[id] = { name: c.name, image: c.imageUrl, at: Date.now() };
                        setInfo(i => ({ ...i, [id]: found[id] }));
                    } catch {
                        // 없어진 채널 등 — id로 보이고, 열 때마다 다시 부르지 않게 하루는 기억한다
                        found[id] = { name: id, at: Date.now() - NAME_TTL + 86_400_000 };
                    }
                    await new Promise(r => setTimeout(r, NAME_DELAY));
                }
            }));
            if (Object.keys(found).length) {
                const latest = ((await browser.storage.local.get(NAME_CACHE_KEY))[NAME_CACHE_KEY] ?? {}) as Record<string, NameInfo>;
                await browser.storage.local.set({ [NAME_CACHE_KEY]: { ...latest, ...found } });
            }
        })();
        return () => { alive = false; };
    }, [rows]);
    return info;
}

/** 주소 끝의 인코딩 차이(%xx)로 같은 배지를 놓치지 않게 */
const badgeKey = (url: string) => { try { return decodeURI(url); } catch { return url; } };

/**
 * 배지 주소 → 이름. 치지직 배지 목록(필터의 배지 고르기와 같은 캐시)과 사용자가 필터에 넣어 둔 배지에서 찾는다.
 * 채널 구독 배지는 목록에 없다 — 주소 모양으로 "구독 배지"까지만.
 */
function useBadgeNames(): (url: string) => string | undefined {
    const [names, setNames] = useState<Map<string, string>>(new Map());
    useEffect(() => {
        let alive = true;
        (async () => {
            const m = new Map<string, string>();
            const filter = ((await browser.storage.local.get('filter')).filter ?? []) as CompositeFilterElement[];
            for (const g of filter) for (const a of g.filters ?? []) {
                if (a.category === 'badge' && a.badgeName && a.value) m.set(badgeKey(a.value), a.badgeName);
            }
            try {
                for (const b of await fetchBadgesCached(getAdapter('chzzk'), { scope: 'global' })) {
                    for (const u of Object.values(b.badgeImage ?? {})) if (u) m.set(badgeKey(u), b.badgeName);
                }
            } catch { /* 목록을 못 받으면 필터에 있는 이름만 */ }
            if (alive) setNames(m);
        })();
        return () => { alive = false; };
    }, []);
    return url => names.get(badgeKey(url));
}

const isSubscriptionBadge = (url: string) => url.includes('/subscription/');

const CAPTURE_KEY_ATTR = 'data-archive-id';
/** 배지 고르기에 보이는 최대 개수 — 많이 쓰인 순 */
const BADGE_LIMIT = 100;
/** 접힌 상태에서 보이는 배지 수(대략 한 줄) */
const BADGE_COLLAPSED = 10;

/** 대략 크기 — 1MB 밑은 KB, 1000MB부터 GB */
function formatBytes(n: number): string {
    if (n < 1e6) return `${Math.max(1, Math.round(n / 1e3))}KB`;
    if (n < 1e9) return `${Math.round(n / 1e6)}MB`;
    return `${(n / 1e9).toFixed(1)}GB`;
}

function ChatRow({ chat, mode, hiddenLabel, selected, onClick, expiring }: {
    chat: ArchivedChat; mode: ArchiveChannel['mode']; hiddenLabel: string; selected?: boolean; onClick?: (e: React.MouseEvent) => void;
    /** 곧 지워질 채팅 — 흐리게, 시각 옆에 모래시계 */
    expiring?: boolean;
}) {
    const { t } = useTranslation();
    // 끊김 구간 — 이 사이 채팅이 빠졌을 수 있다. 눌러 고르는 채팅이 아니다
    if (chat.kind === 'gap') return (
        <li {...{ [CAPTURE_KEY_ATTR]: chat.id }} className={s.chat}>
            <span className={s.time}>{formatArchiveTime(chat, mode)} ~ {formatArchiveTime({ time: chat.until ?? chat.time }, mode)}</span>
            <span className={s.hidden}>{t('archive.gap')}</span>
        </li>
    );
    return (
        <li
            {...{ [CAPTURE_KEY_ATTR]: chat.id }}
            className={`${s.chat} ${onClick ? s.selectable : ''} ${selected ? s.selected : ''} ${expiring ? s.expiring : ''}`}
            style={chat.marker ? { boxShadow: `inset 3px 0 0 ${chat.marker}` } : undefined}
            onClick={onClick}
            aria-selected={onClick ? !!selected : undefined}
        >
            <span className={s.time}>{formatArchiveTime(chat, mode)}{expiring && <Icon name="hourglass_bottom" className={s.expiringIcon} />}</span>
            {chat.badges.filter(isBadgeUrl).slice(0, 3).map(b => <img key={b} className={s.badge} src={b} alt="" loading="lazy" />)}
            <span className={s.nick}>{chat.nickname}</span>
            {chat.amount ? <span className={s.amount}>{chat.amount.toLocaleString()}</span> : null}
            <span className={chat.hidden ? s.hidden : undefined}>{chat.hidden ? hiddenLabel : chat.text}</span>
        </li>
    );
}

function download(name: string, lines: string[], sep: string, type: string) {
    // 엑셀이 UTF-8로 읽게 BOM을 붙인다. 줄 배열을 그대로 넘겨 큰 채널도 문자열 하나로 합치지 않는다
    const url = URL.createObjectURL(new Blob(['\uFEFF', ...lines.map((l, k) => k ? sep + l : l)], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 검색어 입력이 멈춘 뒤에 찾는다 — 거를 때는 채널을 훑는다 */
const SEARCH_DELAY = 250;

export default function Archive() {
    const { t } = useTranslation();
    const [setting, setSetting] = useArchiveSetting();
    const [rows, setRows] = useState<ChannelRow[] | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [items, setItems] = useState<ArchivedChat[]>([]);
    const [total, setTotal] = useState(0);
    const [badgeCounts, setBadgeCounts] = useState<[string, number][]>([]);
    const [query, setQuery] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [channelQuery, setChannelQuery] = useState('');
    const [badgeFilter, setBadgeFilter] = useState<Set<string>>(new Set());
    const [badgesOpen, setBadgesOpen] = useState(false);
    const [selectMode, setSelectMode] = useState(false);
    /** 고른 채팅 — 여러 페이지에 걸쳐 고를 수 있어 값까지 들고 있는다 */
    const [picked, setPicked] = useState<Map<string, ArchivedChat>>(new Map());
    const [capturing, setCapturing] = useState<ArchivedChat[] | null>(null);
    /** 페이지를 읽는 중 — 큰 채널은 세고 훑는 데 몇 초 걸린다 */
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    /** 새로고침 — 보는 채널·검색·거르기·페이지는 그대로 두고 다시 읽는다 */
    const [tick, setTick] = useState(0);
    const refresh = async () => { await reload(); setTick(n => n + 1); };
    const lastPickRef = useRef<string | null>(null);
    const captureRef = useRef<HTMLOListElement>(null);
    const listRef = useRef<HTMLOListElement>(null);
    const info = useChannelInfo(rows ?? []);
    const badgeName = useBadgeNames();
    const badgeLabel = (url: string) => badgeName(url) ?? (isSubscriptionBadge(url) ? t('archive.badge_subscription') : t('archive.badge_unknown'));
    const [confirm, confirmDialog] = useConfirm();
    // 배지 툴팁 — 칩 상자가 스크롤 상자라 CSS로 띄우면 잘린다. 화면에 고정해 칩 아래에 띄운다
    const [tip, setTip] = useState<{ text: string; left: number; top: number } | null>(null);
    const showTip = (el: HTMLElement, text: string) => {
        const r = el.getBoundingClientRect();
        setTip({ text, left: r.left + r.width / 2, top: r.bottom + 6 });
    };

    useEffect(() => { document.title = `${t('archive.title')} - TBC`; }, []);

    const reload = async () => {
        const list = await listArchiveChannels();
        setRows(list);
        // 목록 화면에서 시작한다(채널을 누르면 하위 페이지). 보던 채널이 사라졌으면 목록으로
        setSelected(sel => sel && list.some(r => r.channel === sel) ? sel : null);
    };
    useEffect(() => { void reload(); }, []);

    const row = rows?.find(r => r.channel === selected) ?? null;
    const cap = archiveCap(setting.days);
    const usedChats = rows?.reduce((n, r) => n + r.count, 0) ?? 0;
    const nameOf = (r: ChannelRow) => r.mode === 'vod'
        ? t('archive.vod', { id: r.channelId })
        : info[r.channelId]?.name ?? r.channelId;

    const visibleRows = useMemo(() => {
        const q = channelQuery.trim().toLowerCase();
        if (!rows || !q) return rows ?? [];
        return rows.filter(r => nameOf(r).toLowerCase().includes(q) || r.channelId.toLowerCase().includes(q));
    }, [rows, channelQuery, info]);

    function endSelect() { setSelectMode(false); setPicked(new Map()); lastPickRef.current = null; }

    // 채널을 바꾸면 처음부터. 배지 목록은 채널을 한 번 훑어 센다(그동안도 화면은 쓸 수 있다)
    useEffect(() => {
        setQuery('');
        setSearch('');
        setPage(0);
        setBadgeFilter(new Set());
        setBadgeCounts([]);
        setBadgesOpen(false);
        endSelect();
    }, [selected]);
    useEffect(() => {
        if (!selected) return;
        let alive = true;
        const m = new Map<string, number>();
        // 첫 페이지가 먼저 뜨게 조금 뒤에 센다
        const timer = setTimeout(() => {
            eachArchivedChat(selected, c => { for (const b of new Set(c.badges.filter(isBadgeUrl))) m.set(b, (m.get(b) ?? 0) + 1); })
                .then(() => { if (alive) setBadgeCounts([...m].sort((a, b) => b[1] - a[1]).slice(0, BADGE_LIMIT)); });
        }, 300);
        return () => { alive = false; clearTimeout(timer); };
    }, [selected, tick]);

    useEffect(() => {
        const timer = setTimeout(() => { setSearch(query.trim().toLowerCase()); setPage(0); }, SEARCH_DELAY);
        return () => clearTimeout(timer);
    }, [query]);

    // 지금 페이지만 DB에서 읽는다. 검색·배지로 거르면 채널을 훑으며 맞는 것만 센다
    useEffect(() => {
        if (!selected) { setItems([]); setTotal(0); return; }
        let alive = true;
        setLoading(true);
        const match = search || badgeFilter.size
            ? (c: ArchivedChat) => (!search || c.nickname.toLowerCase().includes(search) || c.text.toLowerCase().includes(search))
                && (badgeFilter.size === 0 || c.badges.some(b => badgeFilter.has(b)))
            : undefined;
        queryArchivedChats(selected, { offset: page * PAGE, limit: PAGE, match }).then(r => {
            if (!alive) return;
            setItems(r.items);
            setTotal(r.total);
        }).finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [selected, search, badgeFilter, page, tick]);

    const pages = Math.max(1, Math.ceil(total / PAGE));
    // 지워져 줄면 범위 안으로
    useEffect(() => { if (page > pages - 1) setPage(pages - 1); }, [page, pages]);

    const toggleBadge = (b: string) => {
        setBadgeFilter(prev => {
            const next = new Set(prev);
            if (next.has(b)) next.delete(b); else next.add(b);
            return next;
        });
        setPage(0);
    };

    // 캡쳐: 고르기 — 누르면 넣고 빼기, Shift는 이 페이지에서 직전에 누른 줄부터 범위로
    const pick = (chat: ArchivedChat, e: React.MouseEvent) => {
        // 직전에 누른 줄은 지금 읽는다 — setPicked의 갱신 함수는 나중에 돌아서 그땐 이미 이번 줄이다
        const from = lastPickRef.current ? items.findIndex(c => c.id === lastPickRef.current) : -1;
        const to = items.findIndex(c => c.id === chat.id);
        setPicked(prev => {
            const next = new Map(prev);
            if (e.shiftKey && from >= 0 && to >= 0) {
                for (let i = Math.min(from, to); i <= Math.max(from, to); i++) next.set(items[i].id, items[i]);
            } else if (next.has(chat.id)) {
                next.delete(chat.id);
            } else {
                next.set(chat.id, chat);
            }
            return next;
        });
        lastPickRef.current = chat.id;
    };

    // 고른 채팅을 시간 순서로 화면 밖 목록에 그린 뒤 이미지로
    const startCapture = () => setCapturing([...picked.values()].sort((a, b) => a.time - b.time));
    useEffect(() => {
        if (!capturing || !captureRef.current || !row) return;
        const el = captureRef.current;
        (async () => {
            try {
                await captureChats({
                    container: el,
                    selectedKeys: new Set(capturing.map(c => c.id)),
                    keyAttr: CAPTURE_KEY_ATTR,
                    filename: `tbcv2-archive-${Date.now()}.png`,
                    backgroundColor: getComputedStyle(el).backgroundColor,
                });
                endSelect();
            } finally {
                setCapturing(null);
            }
        })();
    }, [capturing]);

    // 내보내기도 한 줄씩 읽어 쓴다 — 채널 전체를 한꺼번에 메모리에 올리지 않는다
    const exportAs = async (kind: 'txt' | 'csv') => {
        if (!row) return;
        const base = `${nameOf(row)}-${new Date().toISOString().slice(0, 10)}`.replace(/[\\/:*?"<>|]/g, '_');
        const notice = t('archive.disclaimer');
        const hidden = t('archive.hidden');
        const gap = t('archive.gap');
        const lines = kind === 'csv' ? csvHead(notice) : textHead(notice);
        setExporting(true);
        try {
            await eachArchivedChat(row.channel, c => { lines.push(kind === 'csv' ? csvRow(c, row.mode) : textRow(c, row.mode, hidden, gap)); });
        } finally {
            setExporting(false);
        }
        if (kind === 'csv') download(`${base}.csv`, lines, '\r\n', 'text/csv');
        else download(`${base}.txt`, lines, '\n', 'text/plain');
    };

    const removeChannel = async () => {
        if (!row) return;
        if (!await confirm({ title: t('archive.confirm_delete_channel', { name: nameOf(row) }), confirmLabel: t('common.remove'), cancelLabel: t('common.cancel') })) return;
        await deleteArchiveChannel(row.channel);
        await reload();
    };

    const removeAll = async () => {
        if (!await confirm({ title: t('archive.confirm_delete_all'), confirmLabel: t('common.remove'), cancelLabel: t('common.cancel') })) return;
        await clearArchive();
        await reload();
    };

    // 보관 설정 + 채널 줄 목록. 채널을 누르면 하위 페이지
    return (
        <>
            {!row ? (
                <>
                    <p className={s.intro}>{t('archive.intro', { days: setting.days, cap: cap.label })} {t('archive.responsibility')}</p>
                    <SectionTitle>{t('archive.section_setting')}</SectionTitle>
                    <SettingsCard>
                        <SettingRow label={t('archive.enabled')}>
                            <Switch checked={setting.enabled} onChange={enabled => setSetting({ ...setting, enabled })} />
                        </SettingRow>
                        <SettingRow label={t('archive.usage')}>
                            <span className={s.usage}>
                                {formatBytes(usedChats * CHAT_DISK_BYTES)} / {cap.label}
                                <i className={s.usageBar}><i style={{ width: `${Math.min(100, usedChats / cap.chats * 100)}%` }} /></i>
                            </span>
                        </SettingRow>
                        <SettingRow label={t('archive.days')}>
                            <Select size="sm" value={String(setting.days)} className={s.days} aria-label={t('archive.days')}
                                onChange={v => setSetting({ ...setting, days: Number(v) })}
                                options={ARCHIVE_DAYS.map(d => ({ value: String(d), label: t('archive.days_option', { count: d }) }))} />
                        </SettingRow>
                    </SettingsCard>

                    <SectionTitle actions={<IconButton icon="refresh" size="sm" label={t('archive.refresh')} disabled={loading} onClick={() => void refresh()} />}>
                        {t('archive.section_chats')}
                    </SectionTitle>
                    <SettingsCard>
                        {rows && rows.length > 8 && (
                            <SettingRow>
                                <TextInput size="sm" lead="search" value={channelQuery} placeholder={t('archive.search_channel')}
                                    aria-label={t('archive.search_channel')} onChange={e => setChannelQuery(e.target.value)} style={{ flex: 1 }} />
                            </SettingRow>
                        )}
                        {!rows && <SettingRow className={s.center}><Spinner label={t('archive.loading')} /></SettingRow>}
                        {rows && rows.length === 0 && <SettingRow className={ui.muted}>{t('archive.empty')}</SettingRow>}
                        {visibleRows.map(r => (
                            <LinkRow key={r.channel} onClick={() => setSelected(r.channel)}>
                                <ChannelAvatar src={r.mode === 'live' ? info[r.channelId]?.image : undefined} size={32} />
                                <RowLabel label={nameOf(r)} platform={r.platform} hint={t('archive.count', { count: r.count })} />
                            </LinkRow>
                        ))}
                    </SettingsCard>
                    {rows && rows.length > 0 && (
                        <SettingsCard style={{ marginTop: 16 }}>
                            <LinkRow danger trailing="delete" onClick={removeAll}>
                                <RowLabel label={t('archive.delete_all')} />
                            </LinkRow>
                        </SettingsCard>
                    )}
                </>
            ) : (
                <>
                    <SubHeader title={<span className={s.subTitle}>
                        <ChannelAvatar src={row.mode === 'live' ? info[row.channelId]?.image : undefined} size={28} />{nameOf(row)}<PlatformChip platform={row.platform} />
                    </span>} backLabel={t('common.close')} onBack={() => setSelected(null)}>
                        <span className={ui.muted} style={{ fontSize: 13 }}>{t('archive.count', { count: row.count })}</span>
                        <IconButton icon="refresh" size="sm" label={t('archive.refresh')} disabled={loading} onClick={() => void refresh()} />
                    </SubHeader>
                    <SettingsCard className={s.chatsCard}>
                                <SettingRow className={s.tools}>
                                    <TextInput size="sm" lead="search" value={query} placeholder={t('archive.search')} aria-label={t('archive.search')}
                                        onChange={e => setQuery(e.target.value)} />
                                    <Button size="sm" icon="download" disabled={exporting} onClick={() => void exportAs('txt')}>TXT</Button>
                                    <Button size="sm" icon="download" disabled={exporting} onClick={() => void exportAs('csv')}>CSV</Button>
                                    {exporting && <Spinner label={t('archive.loading')} />}
                                    <Button size="sm" icon="photo_camera" onClick={() => selectMode ? endSelect() : setSelectMode(true)} aria-pressed={selectMode}>
                                        {t('archive.capture')}
                                    </Button>
                                    <Button size="sm" variant="text" onClick={removeChannel}>{t('archive.delete_channel')}</Button>
                                </SettingRow>
                                {badgeCounts.length > 0 && (
                                    <div className={s.badges} role="group" aria-label={t('archive.badges')}>
                                        {/* 접혀 있으면 많이 쓰인 몇 개만 — 고른 배지는 순위 밖이어도 늘 보인다 */}
                                        {(badgesOpen ? badgeCounts : badgeCounts.filter(([b], i) => i < BADGE_COLLAPSED || badgeFilter.has(b))).map(([b, n]) => (
                                            <button key={b} type="button" className={s.badgeChip} aria-pressed={badgeFilter.has(b)} onClick={() => toggleBadge(b)} aria-label={badgeLabel(b)}
                                                onMouseEnter={e => showTip(e.currentTarget, t('archive.badge_tooltip', { name: badgeLabel(b), count: n }))}
                                                onFocus={e => showTip(e.currentTarget, t('archive.badge_tooltip', { name: badgeLabel(b), count: n }))}
                                                onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)}>
                                                <img src={b} alt="" loading="lazy" />
                                                <span>{n}</span>
                                            </button>
                                        ))}
                                        {badgeCounts.length > BADGE_COLLAPSED && (
                                            <button type="button" className={s.badgeMore} aria-expanded={badgesOpen} onClick={() => setBadgesOpen(o => !o)}>
                                                {badgesOpen ? t('archive.badges_less') : t('archive.badges_more')}
                                            </button>
                                        )}
                                    </div>
                                )}
                                {selectMode && (
                                    <div className={s.captureBar}>
                                        <span className={s.meta}>{t('common.selected_count', { count: picked.size })}</span>
                                        <Button size="sm" onClick={endSelect}>{t('common.cancel')}</Button>
                                        <Button size="sm" variant="primary" icon="photo_camera" disabled={picked.size === 0 || !!capturing} onClick={startCapture}>
                                            {t('archive.capture_save')}
                                        </Button>
                                    </div>
                                )}
                                <div className={s.listWrap} aria-busy={loading}>
                                {loading && <div className={s.listLoading}><Spinner label={t('archive.loading')} /></div>}
                                <ol className={s.list} ref={listRef}>
                                    {items.map(c => (
                                        <ChatRow key={c.id} chat={c} mode={row.mode} hiddenLabel={t('archive.hidden')}
                                            selected={picked.has(c.id)} onClick={selectMode ? e => pick(c, e) : undefined}
                                            expiring={c.kind !== 'gap' && expiresSoon(c.savedAt, setting.days)} />
                                    ))}
                                </ol>
                                </div>
                                {total > PAGE && (
                                    <div className={s.pager}>
                                        <Pager page={page} pages={pages} start={page * PAGE} count={items.length} total={total}
                                            setPage={p => { setPage(p); listRef.current?.scrollTo({ top: 0 }); }} />
                                    </div>
                                )}
                    </SettingsCard>
                </>
            )}
            {capturing && row && (
                // 화면 밖 자리는 바깥 상자가 잡는다 — 캡쳐는 요소의 계산된 스타일을 복사해서, 목록 자체를 옮기면 이미지 안에서도 밀려난다
                <div className={s.captureStage} aria-hidden="true">
                    <ol ref={captureRef} className={`${s.list} ${s.captureList}`}>
                        {capturing.map(c => <ChatRow key={c.id} chat={c} mode={row.mode} hiddenLabel={t('archive.hidden')} />)}
                    </ol>
                </div>
            )}
            {tip && <div className={s.tooltip} role="tooltip" style={{ left: tip.left, top: tip.top }}>{tip.text}</div>}
            {confirmDialog}
        </>
    );


}
