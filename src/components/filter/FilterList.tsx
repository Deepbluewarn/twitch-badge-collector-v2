import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { PlatformAdapter } from '@/platform';
import type { AtomicFilterElement, CompositeFilterElement, FilterType } from '@/interfaces/filter';
import type { RowTest } from './FilterTester';
import { ChannelAvatar } from './ChannelSearch';
import { Icon } from '@/ui';
import { isBroadFilter } from '@/filter/broad';
import s from './FilterList.module.css';

/**
 * 필터 목록 (표 F) — 한 줄 = 필터 하나. docs/design-system.md "필터 목록".
 *
 * 그리기만 한다. 고치는 동작(대화상자 열기·저장)은 actions로 받는다 — FilterGroupList가 필터 그룹과
 * FilterDialog를 쥐고 있다. 선택·페이지·페이지당 개수만 여기서 들고 있다.
 */

type Row = CompositeFilterElement;

export interface FilterListActions {
    editAtom: (row: Row, atomId: string) => void;
    addAtom: (row: Row) => void;
    removeAtom: (row: Row, atomId: string) => void;
    editChannel: (row: Row) => void;
    removeChannel: (row: Row) => void;
    editNote: (row: Row) => void;
    removeNote: (row: Row) => void;
    rotateType: (row: Row) => void;
    setColor: (row: Row, color: string) => void;
    deleteMany: (ids: Set<string>) => void;
    /** '범위 넓음' 표시를 눌렀을 때 */
    explainBroad?: (row: Row) => void;
}

const PAGE_SIZES = [10, 20, 50, 100] as const;
const PAGE_SIZE_KEY = 'filterListPageSize';
export const DEFAULT_MARKER_COLOR = '#FFC107';
const SWATCHES = ['#FFC107', '#FF7A45', '#FF5C8A', '#B46BFF', '#4C8DFF', '#20B2AA', '#3DD6A3', '#8BC34A', '#9E9E9E'];
const TONE: Record<FilterType, string> = { include: s.ok, exclude: s.bad, sleep: s.off };

/** 페이지당 개수 — 기본 10, 고른 값은 storage.local에 둔다. */
function usePageSize(): [number, (n: number) => void] {
    const [size, setSize] = useState<number>(PAGE_SIZES[0]);
    useEffect(() => {
        browser.storage.local.get(PAGE_SIZE_KEY).then(r => {
            const v = r[PAGE_SIZE_KEY];
            if ((PAGE_SIZES as readonly unknown[]).includes(v)) setSize(v as number);
        }).catch(() => { /* 기본값 */ });
    }, []);
    const set = (n: number) => {
        setSize(n);
        browser.storage.local.set({ [PAGE_SIZE_KEY]: n }).catch(() => { /* 다음에 기본값 */ });
    };
    return [size, set];
}

export function FilterList({ rows, adapter, actions, toolbarExtra, test }: {
    rows: Row[];
    adapter: PlatformAdapter;
    actions: FilterListActions;
    /** 선택이 없을 때 머리 줄 오른쪽 */
    toolbarExtra?: React.ReactNode;
    /** 필터 시험이 열려 있으면 줄마다 결과 — 걸린 줄을 칠하고 조건마다 맞음/안 맞음을 붙인다 */
    test?: Map<string, RowTest>;
}) {
    const { t } = useTranslation();
    const [size, setSize] = usePageSize();
    const [page, setPage] = useState(0);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const pages = Math.max(1, Math.ceil(rows.length / size));
    const start = page * size;
    const pageRows = rows.slice(start, start + size);

    // 지워진 필터는 선택에서 빼고, 줄어든 목록에 맞춰 페이지를 당긴다.
    useEffect(() => {
        const ids = new Set(rows.map(r => r.id));
        setSelected(prev => {
            const next = new Set([...prev].filter(id => ids.has(id)));
            return next.size === prev.size ? prev : next;
        });
        if (page > pages - 1) setPage(pages - 1);
    }, [rows, pages, page]);

    const allOnPage = pageRows.length > 0 && pageRows.every(r => selected.has(r.id));
    const someOnPage = pageRows.some(r => selected.has(r.id));
    const toggle = (id: string) => setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const togglePage = () => setSelected(prev => {
        const next = new Set(prev);
        pageRows.forEach(r => (allOnPage ? next.delete(r.id) : next.add(r.id)));
        return next;
    });

    return (
        <div className={s.root}>
            <div className={s.toolbar}>
                <MasterCheck checked={allOnPage} indeterminate={!allOnPage && someOnPage} disabled={!pageRows.length} onChange={togglePage} label={t('filter_list.select_all')} />
                {selected.size > 0 ? (
                    <>
                        <span className={s.strong}>{t('filter_list.selected', { count: selected.size })}</span>
                        {allOnPage && selected.size < rows.length && (
                            <button type="button" className={`${s.link} ${s.underline}`} onClick={() => setSelected(new Set(rows.map(r => r.id)))}>
                                {t('filter_list.select_every', { count: rows.length })}
                            </button>
                        )}
                        <button type="button" className={s.danger} onClick={() => actions.deleteMany(selected)}>{t('common.delete_selected')}</button>
                        <button type="button" className={`${s.link} ${s.spacer}`} onClick={() => setSelected(new Set())}>{t('filter_list.clear_selection')}</button>
                    </>
                ) : (
                    <>
                        <span className={s.muted}>{t('filter_list.total', { count: rows.length })}</span>
                        {toolbarExtra && <span className={s.spacer}>{toolbarExtra}</span>}
                    </>
                )}
            </div>

            <div className={s.table}>
                {pageRows.length === 0 && <div className={s.empty}>{t('filter_list.empty')}</div>}
                {pageRows.map(r => (
                    <FilterRow key={r.id} row={r} adapter={adapter} actions={actions} selected={selected.has(r.id)} onToggle={() => toggle(r.id)} test={test?.get(r.id)} />
                ))}
            </div>

            {rows.length > PAGE_SIZES[0] && (
                <div className={s.footer}>
                    <div className={s.sizes}>
                        <span className={s.muted} style={{ marginRight: 4 }}>{t('filter_list.per_page')}</span>
                        {PAGE_SIZES.map(n => (
                            <button key={n} type="button" aria-pressed={n === size} className={`${s.num} ${n === size ? s.current : ''}`}
                                onClick={() => { setSize(n); setPage(0); }}>{n}</button>
                        ))}
                    </div>
                    {rows.length > size && <Pager page={page} pages={pages} setPage={setPage} start={start} count={pageRows.length} total={rows.length} />}
                </div>
            )}
        </div>
    );
}

function MasterCheck({ checked, indeterminate, disabled, onChange, label }: { checked: boolean; indeterminate: boolean; disabled: boolean; onChange: () => void; label: string }) {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
    return <input ref={ref} type="checkbox" className={s.check} checked={checked} disabled={disabled} onChange={onChange} aria-label={label} />;
}

const TEST_ROW: Record<RowTest['state'], string> = { include: s.testInclude, exclude: s.testExclude, partial: s.testPartial, miss: s.testDim, inactive: s.testDim };

function FilterRow({ row, adapter, actions, selected, onToggle, test }: { row: Row; adapter: PlatformAdapter; actions: FilterListActions; selected: boolean; onToggle: () => void; test?: RowTest }) {
    const { t } = useTranslation();
    return (
        <div className={`${s.row} ${selected ? s.selected : ''} ${test ? TEST_ROW[test.state] : ''}`}>
            <input type="checkbox" className={s.check} checked={selected} onChange={onToggle} aria-label={t('filter_list.select')} />
            <MarkerColor row={row} onChange={c => actions.setColor(row, c)} />
            <div className={s.main}>
                <div className={s.atoms}>
                    {row.filters.map((a, i) => (
                        <React.Fragment key={a.id}>
                            {i > 0 && <span className={s.plus}>+</span>}
                            <AtomChip atom={a} adapter={adapter} onEdit={() => actions.editAtom(row, a.id)} onRemove={() => actions.removeAtom(row, a.id)}
                                mark={test && test.state !== 'miss' && test.state !== 'inactive' ? test.atoms.get(a.id) : undefined} />
                        </React.Fragment>
                    ))}
                    <button type="button" className={`${s.link} ${s.reveal}`} onClick={() => actions.addAtom(row)}>+ {t('filter_list.condition')}</button>
                </div>
                <div className={s.meta}>
                    <ChannelMeta row={row} onEdit={() => actions.editChannel(row)} onRemove={() => actions.removeChannel(row)} />
                    <Meta label={t('common.note')} value={row.filterNote} onEdit={() => actions.editNote(row)} onRemove={() => actions.removeNote(row)} />
                </div>
            </div>
            {isBroadFilter(row) && <button type="button" className={s.broad} onClick={() => actions.explainBroad?.(row)}><Icon name="warning" />{t('filter_list.broad')}</button>}
            <button type="button" className={`${s.tag} ${TONE[row.filterType] ?? s.ok}`} onClick={() => actions.rotateType(row)}>
                {t(`filter.category.${row.filterType}`)}
            </button>
        </div>
    );
}

/** 조건 하나. 배지는 그림 + 이름, 이름은 @, 키워드는 따옴표. 면 색이 맞음/아님/꺼짐. 핸들러가 없으면 보기 전용. */
function AtomChip({ atom, adapter, onEdit, onRemove, mark }: {
    atom: AtomicFilterElement; adapter: PlatformAdapter; onEdit?: () => void; onRemove?: () => void;
    /** 필터 시험: 이 조건이 맞았는지 (true ✓ / false ✕ / undefined 표시 안 함) */
    mark?: boolean;
}) {
    const { t } = useTranslation();
    const label = atom.category === 'badge' ? (atom.badgeName || atom.value) : atom.category === 'name' ? `@${atom.value}` : `“${atom.value}”`;
    const body = (
        <>
            {mark !== undefined && <span className={`${s.mark} ${mark ? s.markOk : s.markBad}`} aria-label={mark ? '✓' : '✕'}>{mark ? '✓' : '✕'}</span>}
            {atom.category === 'badge' && <img src={adapter.getBadgeImageUrl(atom.value, '2x')} alt="" />}
            <span className={s.chipLabel}>{label}</span>
        </>
    );
    return (
        <span className={`${s.chip} ${atom.category === 'badge' ? s.badge : ''} ${TONE[atom.type] ?? s.ok}`}>
            {onEdit
                ? <button type="button" className={s.chipBody} onClick={onEdit}>{body}</button>
                : <span className={s.chipBody} style={{ cursor: 'default' }}>{body}</span>}
            {onRemove && <button type="button" className={s.x} onClick={onRemove} aria-label={t('common.remove')}>×</button>}
        </span>
    );
}

/** 필터의 조건들을 보기 전용 칩으로 (필터 시험 결과 등). */
export function FilterChips({ row, adapter }: { row: Row; adapter: PlatformAdapter }) {
    return (
        <span className={s.root} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
            {row.filters.map((a, i) => (
                <React.Fragment key={a.id}>
                    {i > 0 && <span className={s.plus}>+</span>}
                    <AtomChip atom={a} adapter={adapter} />
                </React.Fragment>
            ))}
        </span>
    );
}

/** 채널 페이지 주소 */
function channelUrl(platform: string, id?: string) {
    if (!id) return undefined;
    if (platform === 'chzzk') return `https://chzzk.naver.com/${id}`;
    if (platform === 'twitch') return `https://www.twitch.tv/${id}`;
}

/** 채널: 프로필 사진(있으면) + 이름. 이름을 누르면 수정, ↗는 채널 페이지(새 탭). */
function ChannelMeta({ row, onEdit, onRemove }: { row: Row; onEdit: () => void; onRemove: () => void }) {
    const { t } = useTranslation();
    const name = row.filterChannelName || row.filterChannelId;
    if (!name) return <button type="button" className={`${s.link} ${s.reveal}`} onClick={onEdit}>+ {t('common.channel')}</button>;
    const url = channelUrl(row.platform, row.filterChannelId);
    return (
        <span className={s.metaItem}>
            <button type="button" className={`${s.link} ${s.channel}`} onClick={onEdit}>
                {row.filterChannelImage ? <ChannelAvatar src={row.filterChannelImage} size={18} /> : <>{t('common.channel')} </>}
                <span className={s.metaValue}>{name}</span>
            </button>
            {url && (
                <a className={s.open} href={url} target="_blank" rel="noreferrer" aria-label={t('filter_list.open_channel')}>
                    <Icon name="open_in_new" />
                </a>
            )}
            <button type="button" className={s.x} onClick={onRemove} aria-label={t('common.remove')}>×</button>
        </span>
    );
}

function Meta({ label, value, onEdit, onRemove }: { label: string; value?: string; onEdit: () => void; onRemove: () => void }) {
    const { t } = useTranslation();
    if (!value) return <button type="button" className={`${s.link} ${s.reveal}`} onClick={onEdit}>+ {label}</button>;
    return (
        <span className={s.metaItem}>
            <button type="button" className={s.link} onClick={onEdit}>{label} <span className={s.metaValue}>{value}</span></button>
            <button type="button" className={s.x} onClick={onRemove} aria-label={t('common.remove')}>×</button>
        </span>
    );
}

/**
 * 수집 표시 색 — 원본 채팅창에서 이 필터에 걸린 채팅에 붙는 띠의 색. 포함 필터에만 쓰인다.
 * 팔레트 + 직접 고르기(OS 색 고르기는 'input'이 연속으로 와서 닫힐 때 오는 'change'로 한 번만 저장).
 */
function MarkerColor({ row, onChange }: { row: Row; onChange: (c: string) => void }) {
    const { t } = useTranslation();
    // 열려 있으면 팔레트 위치(화면 기준). 표가 안에서 스크롤해서 팔레트는 body에 띄운다.
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const open = pos !== null;
    const slot = useRef<HTMLDivElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const picker = useRef<HTMLInputElement>(null);
    const setOpen = (v: boolean) => setPos(v ? place() : null);
    /** 색 칸 아래에, 화면 아래가 모자라면 위에. */
    const place = () => {
        const r = slot.current!.getBoundingClientRect();
        const PANEL_H = 140;
        const below = r.bottom + 8;
        return { top: below + PANEL_H > window.innerHeight ? r.top - 8 - PANEL_H : below, left: Math.max(8, r.left - 6) };
    };
    const color = row.markerColor || DEFAULT_MARKER_COLOR;

    useEffect(() => {
        const el = picker.current;
        if (!el) return;
        const onPick = (e: Event) => { onChange((e.target as HTMLInputElement).value); setOpen(false); };
        el.addEventListener('change', onPick);
        return () => el.removeEventListener('change', onPick);
    }, [onChange, open]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!slot.current?.contains(t) && !panel.current?.contains(t)) setPos(null);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null); };
        // 표나 페이지가 스크롤되면 위치가 어긋나므로 닫는다.
        const onScroll = (e: Event) => { if (!panel.current?.contains(e.target as Node)) setPos(null); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        window.addEventListener('scroll', onScroll, true);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', onScroll, true);
        };
    }, [open]);

    if (row.filterType !== 'include') return <div className={s.swatchSlot} />;
    const pick = (c: string) => { onChange(c); setOpen(false); };
    return (
        <div className={s.swatchSlot} ref={slot}>
            <button type="button" className={s.swatch} style={{ background: color }} onClick={() => setOpen(!open)}
                aria-label={t('filter_list.marker_color')} aria-expanded={open} />
            {pos && createPortal(
                <div ref={panel} className={`${s.root} ${s.palette}`} style={{ top: pos.top, left: pos.left }} role="dialog" aria-label={t('filter_list.marker_color')}>
                    <span className={s.paletteTitle}>{t('filter_list.marker_color')}</span>
                    <div className={s.paletteGrid}>
                        {SWATCHES.map(c => (
                            <button key={c} type="button" className={`${s.swatch} ${c.toLowerCase() === color.toLowerCase() ? s.current : ''}`}
                                style={{ background: c }} onClick={() => pick(c)} aria-label={c} />
                        ))}
                        <button type="button" className={`${s.swatch} ${s.custom}`} onClick={() => picker.current?.click()} aria-label={t('filter_list.custom_color')} />
                    </div>
                    <input ref={picker} type="color" defaultValue={color} tabIndex={-1} style={{ position: 'absolute', visibility: 'hidden', width: 0, height: 0 }} />
                </div>,
                document.body,
            )}
        </div>
    );
}

function Pager({ page, pages, setPage, start, count, total }: { page: number; pages: number; setPage: (p: number) => void; start: number; count: number; total: number }) {
    const { t } = useTranslation();
    // 1 … 5 6 [7] 8 9 … 20
    const nums = Array.from({ length: pages }, (_, i) => i).filter(i => i === 0 || i === pages - 1 || Math.abs(i - page) <= 2);
    return (
        <div className={s.pager}>
            <span className={`${s.muted} ${s.range}`}>{start + 1}–{start + count} / {total}</span>
            <button type="button" className={s.num} disabled={page === 0} onClick={() => setPage(page - 1)} aria-label={t('filter_list.prev_page')}>‹</button>
            {nums.map((n, i) => (
                <React.Fragment key={n}>
                    {i > 0 && n - nums[i - 1] > 1 && <span className={s.muted}>…</span>}
                    <button type="button" className={`${s.num} ${n === page ? s.current : ''}`} aria-current={n === page ? 'page' : undefined} onClick={() => setPage(n)}>{n + 1}</button>
                </React.Fragment>
            ))}
            <button type="button" className={s.num} disabled={page === pages - 1} onClick={() => setPage(page + 1)} aria-label={t('filter_list.next_page')}>›</button>
        </div>
    );
}
