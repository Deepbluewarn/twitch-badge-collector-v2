/**
 * PROTOTYPE — 필터 목록 표 시안 4개 (DataGrid 대신). 페이지 틀·기능은 그대로고 한 필터를 보여 주는 배치만 다르다.
 *
 * 칸 내용은 FilterGroupList의 열 정의(renderCell)를 부품으로 불러 쓴다 — 칩 클릭 편집·삭제·조건 추가,
 * 채널·메모 추가/수정, 조건 회전(포함→제외→꺼짐), 색 고르기가 기존 코드 그대로 동작한다.
 * 글자 단계: 버튼 14/800(테마) · 표 주변 동작·보조 글자·조건 13/700 · 상태 태그 12/800.
 * 공통: 선택(체크) + 선택 삭제, 페이지 이동(한 쪽을 넘을 때만), 필터 수만큼만 높이.
 *
 *  A 문장 목록   — 열 없이 한 줄에 칩 문장, 그 아래 채널·메모 작은 글씨. 조건은 오른쪽 알약.
 *  B 타일        — 필터 하나 = 옅은 면 타일, 2~3열 격자. 위에 조건·색, 가운데 칩, 아래 채널·메모.
 *  C 조건별 묶음 — 포함 / 제외 / 꺼짐 구획으로 나누고 구획마다 표. 조건 열이 없어진다.
 *  D 촘촘한 한 줄 — 필터 수백 개용. 한 줄 높이 고정, 채널·메모는 칩 뒤 작은 태그, 한 쪽 40개.
 *  F — D 배치에 칸 내용물만 사이트 방식으로. 조건은 테두리 없는 옅은 면 칩(상태 색은 기존 칩과 같은 뜻:
 *      맞음 초록 / 아님 빨강 / 꺼짐 회색), 점선 + 대신 줄을 볼 때만 나오는 글자 링크, 필터 상태 태그도 같은
 *      초록/빨강/회색, 표시 색은 왼쪽 작은 색 칸(누르면 팔레트). (두 줄짜리 E는 두꺼워서 뺐다.)
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { GridColDef, GridRowId } from '@mui/x-data-grid';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Popover from '@mui/material/Popover';
import { alpha, type SxProps, type Theme } from '@mui/material/styles';
import type { AtomicFilterElement, CompositeFilterElement, FilterType } from '@/interfaces/filter';
import type { PlatformAdapter } from '@/platform';

type Row = CompositeFilterElement;
type Part = (field: string, row: Row) => React.ReactNode;

// 한 쪽에 보일 필터 수 — 기본 10, 사용자가 고른 값은 storage.local에 기억한다.
const PAGE_SIZES = [10, 20, 50, 100] as const;
const PAGE_SIZE_KEY = 'filterListPageSize';

function usePageSize(): [number, (n: number) => void] {
    const [size, setSize] = useState<number>(10);
    useEffect(() => {
        browser.storage.local.get(PAGE_SIZE_KEY).then(r => {
            const v = r[PAGE_SIZE_KEY];
            if (PAGE_SIZES.includes(v as typeof PAGE_SIZES[number])) setSize(v as number);
        }).catch(() => { /* 기본값으로 */ });
    }, []);
    return [size, (n: number) => { setSize(n); browser.storage.local.set({ [PAGE_SIZE_KEY]: n }).catch(() => undefined); }];
}

export interface FilterActions {
    editAtom: (row: Row, atomId: string) => void;
    addAtom: (row: Row) => void;
    removeAtom: (row: Row, atomId: string) => void;
    editChannel: (row: Row) => void;
    removeChannel: (row: Row) => void;
    editNote: (row: Row) => void;
    removeNote: (row: Row) => void;
    rotateType: (row: Row) => void;
    setColor: (row: Row, color: string) => void;
}
const TYPE_LABEL: Record<FilterType, string> = { include: '포함', exclude: '제외', sleep: '꺼짐' };

/** 비어 있는 채널·메모의 + 는 그 줄(타일)을 볼 때만 — 각 시안의 줄 sx에 섞는다. */
const revealEmpty: SxProps<Theme> = {
    '&:not(:hover):not(:focus-within) .tbc-empty': { opacity: 0 },
    '& .tbc-empty': { transition: 'opacity 0.12s' },
};

export function PlainFilterTable({ variant, rows, columns, toolbar, emptyText, adapter, actions }: {
    variant: string;
    adapter: PlatformAdapter;
    actions: FilterActions;
    rows: Row[];
    columns: GridColDef[];
    toolbar: (selected: Set<GridRowId>) => React.ReactNode;
    emptyText: string;
}) {
    const [size, setSize] = usePageSize();
    const [selected, setSelected] = useState<Set<GridRowId>>(new Set());
    const [page, setPage] = useState(0);
    const pages = Math.max(1, Math.ceil(rows.length / size));
    const start = page * size;
    const pageRows = rows.slice(start, start + size);

    useEffect(() => {
        const ids = new Set(rows.map(r => r.id));
        setSelected(prev => {
            const next = new Set([...prev].filter(id => ids.has(id as string)));
            return next.size === prev.size ? prev : next;
        });
        if (page > pages - 1) setPage(pages - 1);
    }, [rows, pages, page]);
    useEffect(() => { setPage(0); }, [variant]);

    const colByField = useMemo(() => new Map(columns.map(c => [c.field, c])), [columns]);
    const header = (field: string) => colByField.get(field)?.headerName ?? field;
    /** 열 정의의 renderCell을 부품으로. 비어 있는 채널·메모는 .tbc-empty로 감싸 줄 hover 때만 보이게. */
    const part: Part = (field, row) => {
        const col = colByField.get(field);
        const value = (row as unknown as Record<string, unknown>)[field];
        const node = col?.renderCell ? col.renderCell({ value, row, id: row.id, field } as any) : String(value ?? '');
        const empty = (field === 'filterChannelName' || field === 'filterNote') && !value;
        return empty ? <span className="tbc-empty" style={{ display: 'inline-flex' }}>{node}</span> : node;
    };

    const isSel = (r: Row) => selected.has(r.id);
    const toggle = (id: GridRowId) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const allOnPage = pageRows.length > 0 && pageRows.every(isSel);
    const toggleAll = () => setSelected(prev => { const n = new Set(prev); pageRows.forEach(r => (allOnPage ? n.delete(r.id) : n.add(r.id))); return n; });
    const check = (r: Row) => <Checkbox size="small" checked={isSel(r)} onChange={() => toggle(r.id)} sx={{ p: 0.5 }} inputProps={{ 'aria-label': 'select' }} />;
    // 전체 선택 체크박스는 줄 체크박스와 같은 세로줄(맨 왼쪽)에 — 메일함처럼. 이 쪽을 다 고르면 "N개 모두 선택"을 제안.
    const masterCheck = (
        <Checkbox size="small" checked={allOnPage} indeterminate={!allOnPage && pageRows.some(isSel)} onChange={toggleAll} disabled={!pageRows.length}
            sx={{ p: 0.5 }} inputProps={{ 'aria-label': '전체 선택' }} />
    );
    const selectEverything = () => setSelected(new Set(rows.map(r => r.id)));
    const rowBg = (r: Row) => ({ bgcolor: isSel(r) ? 'action.selected' : 'transparent', '&:hover': { bgcolor: isSel(r) ? 'action.selected' : 'action.hover' } });

    const body = (() => {
        if (pageRows.length === 0) return <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>{emptyText} 0</Typography>;
        if (variant === 'B') return <Tiles rows={pageRows} part={part} check={check} isSel={isSel} />;
        if (variant === 'C') return <Grouped rows={pageRows} part={part} check={check} rowBg={rowBg} header={header} />;
        if (variant === 'D') return <Dense rows={pageRows} part={part} check={check} rowBg={rowBg} />;
        if (variant === 'F') return <SiteRows dense rows={pageRows} check={check} rowBg={rowBg} adapter={adapter} actions={actions} />;
        return <Sentences rows={pageRows} part={part} check={check} rowBg={rowBg} header={header} />;
    })();

    return (
        <Box>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', minHeight: 40, px: 0.5, flexWrap: 'wrap' }}>
                {masterCheck}
                {selected.size > 0 ? (
                    <>
                        <Typography sx={{ fontSize: 13, fontWeight: 800 }}>{selected.size}개 선택</Typography>
                        {allOnPage && selected.size < rows.length && (
                            <Box component="button" type="button" onClick={selectEverything}
                                sx={{ border: 0, background: 'none', p: 0, cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 700, color: 'text.secondary', textDecoration: 'underline', textDecorationColor: '#ffd60a', textDecorationThickness: 3, textUnderlineOffset: 3 }}>
                                필터 {rows.length}개 모두 선택
                            </Box>
                        )}
                        {toolbar(selected)}
                        <Box component="button" type="button" onClick={() => setSelected(new Set())}
                            sx={{ ml: 'auto', border: 0, background: 'none', p: 0, cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 700, color: 'text.secondary', '&:hover': { color: 'text.primary' } }}>선택 해제</Box>
                    </>
                ) : (
                    <Typography color="text.secondary" sx={{ fontSize: 13, fontWeight: 700 }}>필터 {rows.length}개</Typography>
                )}
            </Box>
            {body}
            {rows.length > PAGE_SIZES[0] && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', pt: 1.5 }}>
                    <PageSizePicker size={size} onChange={n => { setSize(n); setPage(0); }} />
                    {rows.length > size && <Pager page={page} pages={pages} setPage={setPage} start={start} count={pageRows.length} total={rows.length} />}
                </Box>
            )}
        </Box>
    );
}

// ── A: 문장 목록 ─────────────────────────────────────────────

function Sentences({ rows, part, check, rowBg, header }: { rows: Row[]; part: Part; check: (r: Row) => React.ReactNode; rowBg: (r: Row) => object; header: (f: string) => string }) {
    return (
        <Box sx={{ borderTop: 2, borderColor: 'text.primary' }}>
            {rows.map(r => (
                <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, pl: 0.5, pr: 1, borderBottom: 1, borderColor: 'divider', ...rowBg(r), ...revealEmpty }}>
                    {check(r)}
                    {/* 색: 왼쪽 굵은 띠 (원본 채팅창 수집 표시와 같은 모양) */}
                    <Box sx={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center' }}>{part('markerColor', r)}</Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        {part('filters', r)}
                        <Box sx={{ display: 'flex', gap: 2, mt: 0.5, color: 'text.secondary', fontSize: 13, alignItems: 'center', flexWrap: 'wrap' }}>
                            <MetaItem label={header('filterChannelName')}>{part('filterChannelName', r)}</MetaItem>
                            <MetaItem label={header('filterNote')}>{part('filterNote', r)}</MetaItem>
                        </Box>
                    </Box>
                    <TypePill r={r}>{part('filterType', r)}</TypePill>
                </Box>
            ))}
        </Box>
    );
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, maxWidth: 260 }}>
            <Typography component="span" variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>{label}</Typography>
            <Box sx={{ minWidth: 0, flex: 1 }}>{children}</Box>
        </Box>
    );
}

/** 조건을 알약 모양 테두리로 감싼다 (안의 회전 동작은 기존 ConditionLabel). */
function TypePill({ r, children }: { r: Row; children: React.ReactNode }) {
    return (
        <Box sx={{ flex: 'none', border: 2, borderRadius: 999, px: 0.5, borderColor: r.filterType === 'include' ? 'success.main' : r.filterType === 'exclude' ? 'error.main' : 'divider' }}>
            {children}
        </Box>
    );
}

// ── B: 타일 ─────────────────────────────────────────────

function Tiles({ rows, part, check, isSel }: { rows: Row[]; part: Part; check: (r: Row) => React.ReactNode; isSel: (r: Row) => boolean }) {
    return (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 1.5 }}>
            {rows.map(r => (
                <Box key={r.id} sx={{
                    display: 'flex', flexDirection: 'column', gap: 1, p: 1.5, borderRadius: 2, minHeight: 130,
                    // 카드 안의 타일 — 테두리 대신 옅은 면 (외곽선이 겹치지 않게)
                    // action.hover는 이 테마에서 연노랑이라 쉬는 타일은 무채색 옅은 면으로
                    bgcolor: isSel(r) ? 'action.selected' : (t: Theme) => (t.palette.mode === 'dark' ? '#23211c' : '#f5f4ef'),
                    outline: isSel(r) ? 2 : 0, outlineColor: 'text.primary', outlineStyle: 'solid',
                    opacity: r.filterType === 'sleep' ? 0.6 : 1,
                    ...revealEmpty,
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {check(r)}
                        {part('filterType', r)}
                        <Box sx={{ ml: 'auto' }}>{part('markerColor', r)}</Box>
                    </Box>
                    <Box sx={{ flex: 1 }}>{part('filters', r)}</Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, borderTop: 1, borderColor: 'divider', pt: 1 }}>
                        <MetaItem label="채널">{part('filterChannelName', r)}</MetaItem>
                        <MetaItem label="메모">{part('filterNote', r)}</MetaItem>
                    </Box>
                </Box>
            ))}
        </Box>
    );
}

// ── C: 조건별 묶음 ─────────────────────────────────────────────

function Grouped({ rows, part, check, rowBg, header }: { rows: Row[]; part: Part; check: (r: Row) => React.ReactNode; rowBg: (r: Row) => object; header: (f: string) => string }) {
    const template = '36px minmax(0, 6fr) minmax(0, 2fr) minmax(0, 2fr) 72px 48px';
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {(['include', 'exclude', 'sleep'] as FilterType[]).map(type => {
                const list = rows.filter(r => r.filterType === type);
                if (!list.length) return null;
                return (
                    <Box key={type}>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderTop: 2, borderColor: 'text.primary', pt: 1, mb: 0.5 }}>
                            <Typography sx={{ fontWeight: 900, fontSize: 17 }}>{TYPE_LABEL[type]} <Typography component="span" color="text.secondary" sx={{ fontWeight: 600 }}>{list.length}</Typography></Typography>
                        </Box>
                        <Box sx={{ display: 'grid', gridTemplateColumns: template, columnGap: 2, px: 0.5, py: 0.5, color: 'text.secondary' }}>
                            <span />
                            {['filters', 'filterChannelName', 'filterNote'].map(f => <Typography key={f} variant="caption" sx={{ fontWeight: 800 }}>{header(f)}</Typography>)}
                            <Typography variant="caption" sx={{ fontWeight: 800 }}>바꾸기</Typography>
                            <Typography variant="caption" sx={{ fontWeight: 800 }}>{header('markerColor')}</Typography>
                        </Box>
                        {list.map(r => (
                            <Box key={r.id} sx={{ display: 'grid', gridTemplateColumns: template, alignItems: 'center', columnGap: 2, px: 0.5, py: 1, borderTop: 1, borderColor: 'divider', ...rowBg(r), ...revealEmpty }}>
                                {check(r)}
                                <Box sx={{ minWidth: 0 }}>{part('filters', r)}</Box>
                                <Box sx={{ minWidth: 0 }}>{part('filterChannelName', r)}</Box>
                                <Box sx={{ minWidth: 0 }}>{part('filterNote', r)}</Box>
                                <Box>{part('filterType', r)}</Box>
                                <Box>{part('markerColor', r)}</Box>
                            </Box>
                        ))}
                    </Box>
                );
            })}
        </Box>
    );
}

// ── D: 촘촘한 한 줄 ─────────────────────────────────────────────

function Dense({ rows, part, check, rowBg }: { rows: Row[]; part: Part; check: (r: Row) => React.ReactNode; rowBg: (r: Row) => object }) {
    return (
        <Box sx={{ borderTop: 2, borderColor: 'text.primary' }}>
            {rows.map(r => (
                <Box key={r.id} sx={{
                    display: 'flex', alignItems: 'center', gap: 1, height: 44, px: 0.5, borderBottom: 1, borderColor: 'divider', ...rowBg(r), ...revealEmpty,
                    // 칩이 넘치면 한 줄 안에서 잘라 높이를 고정
                    '& .MuiStack-root': { flexWrap: 'nowrap', overflow: 'hidden' },
                    '& .MuiChip-root': { height: 26 },
                }}>
                    {check(r)}
                    <Box sx={{ width: 4, alignSelf: 'stretch', my: 1, borderRadius: 2, bgcolor: r.filterType === 'include' ? (r.markerColor || '#FFC107') : 'transparent' }} />
                    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
                        <Box sx={{ minWidth: 0, flex: '0 1 auto', overflow: 'hidden' }}>{part('filters', r)}</Box>
                        <Box sx={{ flex: 'none', display: 'flex', gap: 1, color: 'text.secondary', fontSize: 13, '& > *': { maxWidth: 180 } }}>
                            {part('filterChannelName', r)}{part('filterNote', r)}
                        </Box>
                    </Box>
                    <Box sx={{ flex: 'none', width: 80 }}>{part('filterType', r)}</Box>
                    <Box sx={{ flex: 'none' }}>{part('markerColor', r)}</Box>
                </Box>
            ))}
        </Box>
    );
}

// ── E · F: 사이트 방식 내용물 ─────────────────────────────────────────────

/** 줄을 볼 때만 보이는 것 (추가 링크, ✕). 키보드로 들어와도 보이게 focus-within. */
const hoverReveal: SxProps<Theme> = {
    '& .tbc-hover': { opacity: 0, transition: 'opacity 0.12s' },
    '&:hover .tbc-hover, &:focus-within .tbc-hover': { opacity: 1 },
};

const linkSx: SxProps<Theme> = {
    border: 0, background: 'none', p: 0, cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 700, color: 'text.secondary',
    '&:hover': { color: 'text.primary', textDecoration: 'underline', textDecorationColor: '#ffd60a', textDecorationThickness: 3, textUnderlineOffset: 3 },
};

function TextLink({ children, onClick, hover, label }: { children: React.ReactNode; onClick: () => void; hover?: boolean; label?: string }) {
    return <Box component="button" type="button" className={hover ? 'tbc-hover' : undefined} aria-label={label} onClick={onClick} sx={linkSx}>{children}</Box>;
}

/** 조건 상태 색 — 기존 칩과 같은 뜻(맞음 초록 / 아님 빨강 / 꺼짐 회색)을 테두리 없는 옅은 면으로. */
const ATOM_TONE: Record<FilterType, { bg: (t: Theme) => string; fg: (t: Theme) => string; label: string }> = {
    include: { bg: t => alpha(t.palette.success.main, t.palette.mode === 'dark' ? 0.2 : 0.12), fg: t => (t.palette.mode === 'dark' ? '#5fd39a' : '#137a47'), label: '맞음' },
    exclude: { bg: t => alpha(t.palette.error.main, t.palette.mode === 'dark' ? 0.22 : 0.1), fg: t => (t.palette.mode === 'dark' ? '#ff8a8e' : '#c22b31'), label: '아님' },
    sleep: { bg: t => alpha(t.palette.text.primary, 0.07), fg: t => t.palette.text.secondary, label: '꺼짐' },
};

/** 조건 하나: 배지는 그림 + 이름, 이름은 @, 키워드는 따옴표. 상태는 면 색(초록/빨강/회색). 누르면 편집, ✕는 올렸을 때. */
function AtomText({ a, adapter, onEdit, onRemove }: { a: AtomicFilterElement; adapter: PlatformAdapter; onEdit: () => void; onRemove: () => void }) {
    const label = a.category === 'badge' ? (a.badgeName || a.value) : a.category === 'name' ? `@${a.value}` : `“${a.value}”`;
    const tone = ATOM_TONE[a.type] ?? ATOM_TONE.include;
    return (
        <Box component="span" title={tone.label} sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0, height: 26, pl: a.category === 'badge' ? 0.5 : 1, pr: 0.75, borderRadius: 999,
            bgcolor: tone.bg, color: tone.fg, '&:hover .tbc-x': { opacity: 1 },
        }}>
            <Box component="button" type="button" onClick={onEdit}
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, border: 0, background: 'none', p: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', fontWeight: 700, fontSize: 13, minWidth: 0 }}>
                {a.category === 'badge' && <img src={adapter.getBadgeImageUrl(a.value, '2x')} alt="" width={18} height={18} style={{ flex: 'none', opacity: a.type === 'sleep' ? 0.5 : 1 }} />}
                <Box component="span" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</Box>
            </Box>
            <Box component="button" type="button" className="tbc-x" aria-label="조건 삭제" onClick={onRemove}
                sx={{ opacity: 0, border: 0, background: 'none', p: 0, cursor: 'pointer', color: 'inherit', fontSize: 15, lineHeight: 1, '&:focus-visible': { opacity: 1 } }}>×</Box>
        </Box>
    );
}

/** 필터 상태 태그 — 조건 칩과 같은 색 규칙(포함 초록 / 제외 빨강 / 꺼짐 회색). 칩과 구별되게 네모 모서리.
 *  누를 때마다 바뀐다 (기존 동작과 같다). */
function TypeTag({ row, onClick }: { row: Row; onClick: () => void }) {
    const tone = ATOM_TONE[row.filterType] ?? ATOM_TONE.include;
    return (
        <Box component="button" type="button" onClick={onClick} title="눌러서 바꾸기"
            sx={{ flex: 'none', border: 0, cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 800, px: 1, py: 0.25, borderRadius: 1, minWidth: 44, bgcolor: tone.bg, color: tone.fg }}>
            {TYPE_LABEL[row.filterType]}
        </Box>
    );
}

/** 수집 표시 색 = 원본 채팅창에서 이 필터에 걸린 채팅 왼쪽에 붙는 띠의 색. 포함 필터만 의미가 있다.
 *  작은 색 칸을 누르면 팔레트 팝업 — 자주 쓰는 색 + "직접 고르기"(OS 색 고르기, 닫힐 때 한 번 저장). */
const SWATCHES = ['#FFC107', '#FF7A45', '#FF5C8A', '#B46BFF', '#4C8DFF', '#20B2AA', '#3DD6A3', '#8BC34A', '#9E9E9E'];

function ColorBar({ row, onChange }: { row: Row; onChange: (c: string) => void }) {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const ref = React.useRef<HTMLInputElement>(null);
    const color = row.markerColor || '#FFC107';
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const h = (e: Event) => { onChange((e.target as HTMLInputElement).value); setAnchor(null); };
        el.addEventListener('change', h);
        return () => el.removeEventListener('change', h);
    }, [onChange, anchor]);
    if (row.filterType !== 'include') return <Box sx={{ width: 20, flex: 'none' }} />;   // 포함이 아니면 색이 쓰이지 않는다
    return (
        <>
            <Box component="button" type="button" onClick={e => setAnchor(e.currentTarget)} aria-label="수집 표시 색 바꾸기"
                    sx={{
                        flex: 'none', width: 20, height: 20, p: 0, borderRadius: '5px', cursor: 'pointer', bgcolor: color,
                        border: 2, borderColor: 'background.paper', boxShadow: t => `0 0 0 1px ${t.palette.divider}`,
                        transition: 'box-shadow 0.12s',
                        '&:hover, &:focus-visible': { boxShadow: t => `0 0 0 2px ${t.palette.text.primary}` },
                    }} />
            <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                slotProps={{ paper: { sx: { p: 1.5, borderRadius: 2 } } }}>
                <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', mb: 1 }}>수집 표시 색</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 28px)', gap: 1 }}>
                    {SWATCHES.map(c => (
                        <Box key={c} component="button" type="button" aria-label={c} onClick={() => { onChange(c); setAnchor(null); }}
                            sx={{ width: 28, height: 28, p: 0, borderRadius: 1, cursor: 'pointer', bgcolor: c, border: 2, borderColor: 'background.paper',
                                boxShadow: t => `0 0 0 ${c.toLowerCase() === color.toLowerCase() ? 2 : 1}px ${c.toLowerCase() === color.toLowerCase() ? t.palette.text.primary : t.palette.divider}`,
                                '&:hover': { boxShadow: t => `0 0 0 2px ${t.palette.text.primary}` } }} />
                    ))}
                    <Box component="button" type="button" aria-label="직접 고르기" onClick={() => ref.current?.click()}
                            sx={{ width: 28, height: 28, p: 0, borderRadius: 1, cursor: 'pointer', border: 1, borderColor: 'divider', bgcolor: 'transparent', color: 'text.secondary', fontSize: 16, fontWeight: 800,
                                background: 'conic-gradient(#f44, #fd0, #4d4, #4cf, #a4f, #f44)', '&:hover': { boxShadow: t => `0 0 0 2px ${t.palette.text.primary}` } }} />
                </Box>
                <input ref={ref} type="color" defaultValue={color} tabIndex={-1} style={{ position: 'absolute', visibility: 'hidden', width: 0, height: 0 }} />
            </Popover>
        </>
    );
}

function MetaText({ label, value, onEdit, onRemove }: { label: string; value?: string; onEdit: () => void; onRemove: () => void }) {
    if (!value) return <TextLink hover onClick={onEdit}>+ {label}</TextLink>;
    return (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0, '&:hover .tbc-x': { opacity: 1 } }}>
            <TextLink onClick={onEdit}><Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>{label}</Box> <Box component="span" sx={{ color: 'text.primary' }}>{value}</Box></TextLink>
            <Box component="button" type="button" className="tbc-x" aria-label={`${label} 지우기`} onClick={onRemove}
                sx={{ opacity: 0, border: 0, background: 'none', p: 0, cursor: 'pointer', color: 'text.secondary', fontSize: 14 }}>×</Box>
        </Box>
    );
}

function SiteRows({ dense, rows, check, rowBg, adapter, actions }: { dense: boolean; rows: Row[]; check: (r: Row) => React.ReactNode; rowBg: (r: Row) => object; adapter: PlatformAdapter; actions: FilterActions }) {
    const atoms = (r: Row) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px 6px', flexWrap: dense ? 'nowrap' : 'wrap', minWidth: 0, overflow: dense ? 'hidden' : 'visible' }}>
            {r.filters.map((a, i) => (
                <React.Fragment key={a.id}>
                    {i > 0 && <Typography component="span" variant="caption" color="text.secondary" sx={{ flex: 'none' }}>+</Typography>}
                    <AtomText a={a} adapter={adapter} onEdit={() => actions.editAtom(r, a.id)} onRemove={() => actions.removeAtom(r, a.id)} />
                </React.Fragment>
            ))}
            <Box sx={{ flex: 'none' }}><TextLink hover onClick={() => actions.addAtom(r)}>+ 조건</TextLink></Box>
        </Box>
    );
    const meta = (r: Row) => (
        <>
            <MetaText label="채널" value={r.filterChannelName} onEdit={() => actions.editChannel(r)} onRemove={() => actions.removeChannel(r)} />
            <MetaText label="메모" value={r.filterNote} onEdit={() => actions.editNote(r)} onRemove={() => actions.removeNote(r)} />
        </>
    );
    return (
        <Box sx={{ borderTop: 2, borderColor: 'text.primary' }}>
            {rows.map(r => (
                <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 0.5, borderBottom: 1, borderColor: 'divider', ...(dense ? { height: 44 } : { py: 1.25 }), ...rowBg(r), ...hoverReveal }}>
                    {check(r)}
                    <ColorBar row={r} onChange={c => actions.setColor(r, c)} />
                    {dense ? (
                        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Box sx={{ minWidth: 0, flex: '0 1 auto' }}>{atoms(r)}</Box>
                            <Box sx={{ flex: 'none', display: 'flex', gap: 1.5, ml: 'auto' }}>{meta(r)}</Box>
                        </Box>
                    ) : (
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            {atoms(r)}
                            <Box sx={{ display: 'flex', gap: 2, mt: 0.5, flexWrap: 'wrap', minHeight: 20 }}>{meta(r)}</Box>
                        </Box>
                    )}
                    <TypeTag row={r} onClick={() => actions.rotateType(r)} />
                </Box>
            ))}
        </Box>
    );
}

// ── 페이지 이동 ─────────────────────────────────────────────

function PageSizePicker({ size, onChange }: { size: number; onChange: (n: number) => void }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography color="text.secondary" sx={{ fontSize: 13, fontWeight: 700, mr: 0.5 }}>페이지당</Typography>
            {PAGE_SIZES.map(n => (
                <Box key={n} component="button" type="button" onClick={() => onChange(n)} aria-pressed={n === size}
                    sx={{
                        minWidth: 34, height: 28, px: 0.75, border: 0, borderRadius: '6px', cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums', color: n === size ? '#111' : 'text.secondary', bgcolor: n === size ? 'primary.main' : 'transparent',
                        '&:hover': { bgcolor: n === size ? 'primary.main' : 'action.hover', color: n === size ? '#111' : 'text.primary' },
                    }}>{n}</Box>
            ))}
        </Box>
    );
}

function Pager({ page, pages, setPage, start, count, total }: { page: number; pages: number; setPage: (p: number) => void; start: number; count: number; total: number }) {
    const nums = Array.from({ length: pages }, (_, i) => i).filter(i => i === 0 || i === pages - 1 || Math.abs(i - page) <= 2);
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, ml: 'auto' }}>
            <Typography color="text.secondary" sx={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', mr: 1 }}>{start + 1}–{start + count} / {total}</Typography>
            <IconButton size="small" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="이전 페이지"><ChevronLeftIcon /></IconButton>
            {nums.map((i, k) => (
                <React.Fragment key={i}>
                    {k > 0 && i - nums[k - 1] > 1 && <Typography color="text.secondary">…</Typography>}
                    <Button size="small" variant="text" onClick={() => setPage(i)} aria-current={i === page ? 'page' : undefined}
                        sx={{ minWidth: 34, px: 1, ...(i === page ? { bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.main', textDecoration: 'none' } } : {}) }}>{i + 1}</Button>
                </React.Fragment>
            ))}
            <IconButton size="small" disabled={page === pages - 1} onClick={() => setPage(page + 1)} aria-label="다음 페이지"><ChevronRightIcon /></IconButton>
        </Box>
    );
}
