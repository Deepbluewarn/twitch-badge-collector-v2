/**
 * PROTOTYPE — 버릴 코드. 질문: "필터가 수백 개일 때 필터 검색은 어떤 모양이어야 하나?"
 * 설정 페이지에서 &variant=A|B|C 로 바꿔 본다(dev 빌드에서만). 가짜 필터 ~900개를 섞는다(&fake=0이면 끔).
 * 왼쪽 채널 목록·범위 넓음 버튼은 진짜 그대로 — 검색은 그 결과 안에서 한 번 더 거른다.
 */
import React, { useMemo, useRef, useState } from 'react';
import type { PlatformAdapter } from '@/platform';
import type { AtomicFilterElement, CompositeFilterElement, FilterType } from '@/interfaces/filter';
import { Icon } from '@/ui';
import { FilterList, FilterListActions } from '../FilterList';
import p from './FilterSearchPrototype.module.css';

type Row = CompositeFilterElement;

// ── 가짜 데이터 (prototype/channel-view에서 가져옴) ─────────────────────────────
const SYL = '가나다라마바사아자차카타파하루미유키소리하나별달빛토끼냥이코코모모';
const fakeName = (i: number) => {
    const L = SYL.length;
    const n = SYL[i % L] + SYL[Math.floor(i / L) % L] + (i % 3 ? SYL[(i * 7) % L] : '');
    return i % 5 === 0 ? `${n}TV` : i % 7 === 0 ? `${n} 채널` : n;
};
const WORDS = ['공지', '안녕', '질문', '이벤트', '구독', '후원', '광고', '링크', '도배', '추첨'];
export function makeFakeRows(platform: Row['platform']): Row[] {
    const rows: Row[] = [];
    for (let i = 0; i < 300; i++) {
        const count = 1 + (i * 13 % 5 === 0 ? 6 : i % 3);
        for (let j = 0; j < count; j++) {
            const k = i * 7 + j;
            rows.push({
                id: `proto-${i}-${j}`, platform, filterType: (['include', 'include', 'include', 'exclude', 'sleep'] as FilterType[])[k % 5],
                filterNote: k % 9 === 0 ? `${WORDS[k % WORDS.length]} 관련` : '',
                filterChannelId: i % 4 === 0 ? undefined : `proto${String(i).padStart(4, '0')}`, filterChannelName: i % 4 === 0 ? undefined : fakeName(i),
                filters: [{ id: `proto-a-${k}`, category: (['keyword', 'name', 'keyword'] as const)[j % 3], type: k % 6 === 5 ? 'exclude' : 'include', value: j % 3 === 1 ? `fan${i}_${j}` : WORDS[k % WORDS.length] }],
            });
        }
    }
    return rows;
}
export function protoSafeActions(a: FilterListActions): FilterListActions {
    const fake = (r: Row) => r.id.startsWith('proto-');
    const wrap = <A extends unknown[]>(fn: (r: Row, ...x: A) => void) => (r: Row, ...x: A) => { if (!fake(r)) fn(r, ...x); };
    return {
        ...a,
        editAtom: wrap(a.editAtom), addAtom: wrap(a.addAtom), removeAtom: wrap(a.removeAtom), editChannel: wrap(a.editChannel),
        removeChannel: wrap(a.removeChannel), editNote: wrap(a.editNote), removeNote: wrap(a.removeNote), rotateType: wrap(a.rotateType),
        setColor: wrap(a.setColor), deleteMany: ids => a.deleteMany(new Set([...ids].filter(id => !id.startsWith('proto-')))),
    };
}

// ── 검색 ─────────────────────────────
type Field = 'all' | 'badge' | 'name' | 'keyword' | 'note' | 'channel';
const atomText = (a: AtomicFilterElement) => (a.category === 'badge' ? a.badgeName || a.value : a.value).toLowerCase();
function matches(r: Row, q: string, field: Field = 'all') {
    if (!q) return true;
    const t = q.toLowerCase();
    const inAtoms = (cat?: AtomicFilterElement['category']) => r.filters.some(a => (!cat || a.category === cat) && atomText(a).includes(t));
    switch (field) {
        case 'badge': return inAtoms('badge');
        case 'name': return inAtoms('name');
        case 'keyword': return inAtoms('keyword');
        case 'note': return (r.filterNote ?? '').toLowerCase().includes(t);
        case 'channel': return (r.filterChannelName ?? '').toLowerCase().includes(t) || (r.filterChannelId ?? '').toLowerCase().includes(t);
        default: return inAtoms() || (r.filterNote ?? '').toLowerCase().includes(t) || (r.filterChannelName ?? '').toLowerCase().includes(t);
    }
}

export interface VariantProps {
    rows: Row[];
    adapter: PlatformAdapter;
    actions: FilterListActions;
    extra: React.ReactNode;
    test?: React.ComponentProps<typeof FilterList>['test'];
}

// ── A: 표 위 큰 검색창 (늘 보임) ─────────────────────────────
export function VariantA({ rows, adapter, actions, extra, test }: VariantProps) {
    const [q, setQ] = useState('');
    const shown = useMemo(() => rows.filter(r => matches(r, q.trim())), [rows, q]);
    return (
        <div className={p.stack}>
            <label className={p.bigBar}>
                <Icon name="search" />
                <input className={p.bigInput} value={q} onChange={e => setQ(e.target.value)} placeholder="필터 찾기" />
                {q && <button type="button" className={p.clear} onClick={() => setQ('')} aria-label="지우기"><Icon name="close" /></button>}
            </label>
            <FilterList rows={shown} adapter={adapter} actions={actions} test={test} toolbarExtra={extra} />
        </div>
    );
}

// ── B: 머리 줄 안에 접힌 돋보기 — 누르면 그 자리에서 펼쳐진다 ─────────────────────────────
export function VariantB({ rows, adapter, actions, extra, test }: VariantProps) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const input = useRef<HTMLInputElement>(null);
    const shown = useMemo(() => rows.filter(r => matches(r, q.trim())), [rows, q]);
    return (
        <FilterList rows={shown} adapter={adapter} actions={actions} test={test} toolbarExtra={<>
            {open || q ? (
                <span className={p.inlineBar}>
                    <Icon name="search" />
                    <input ref={input} autoFocus className={p.inlineInput} value={q} onChange={e => setQ(e.target.value)} placeholder="필터 찾기"
                        onBlur={() => { if (!q) setOpen(false); }} onKeyDown={e => { if (e.key === 'Escape') { setQ(''); setOpen(false); } }} />
                    {q && <button type="button" className={p.clear} onClick={() => { setQ(''); setOpen(false); }} aria-label="지우기"><Icon name="close" /></button>}
                </span>
            ) : (
                <button type="button" className={p.iconBtn} onClick={() => setOpen(true)} aria-label="필터 찾기"><Icon name="search" /></button>
            )}
            {extra}
        </>} />
    );
}

// ── C: 검색창 + 어디서 찾을지 고르는 칩 (배지·닉네임·키워드·채널·메모) ─────────────────────────────
const FIELDS: [Field, string][] = [['all', '전체'], ['badge', '배지'], ['name', '닉네임'], ['keyword', '키워드'], ['channel', '채널'], ['note', '메모']];
export function VariantC({ rows, adapter, actions, extra, test }: VariantProps) {
    const [q, setQ] = useState('');
    const [field, setField] = useState<Field>('all');
    const shown = useMemo(() => rows.filter(r => matches(r, q.trim(), field)), [rows, q, field]);
    return (
        <div className={p.stack}>
            <div className={p.facetRow}>
                <label className={p.midBar}>
                    <Icon name="search" />
                    <input className={p.bigInput} value={q} onChange={e => setQ(e.target.value)} placeholder="필터 찾기" />
                    {q && <button type="button" className={p.clear} onClick={() => setQ('')} aria-label="지우기"><Icon name="close" /></button>}
                </label>
                <div className={p.facets}>
                    {FIELDS.map(([k, label]) => (
                        <button key={k} type="button" className={`${p.facet} ${field === k ? p.facetOn : ''}`} onClick={() => setField(k)}>{label}</button>
                    ))}
                </div>
            </div>
            <FilterList rows={shown} adapter={adapter} actions={actions} test={test} toolbarExtra={extra} />
        </div>
    );
}

export const VARIANTS = { A: '표 위 큰 검색창', B: '머리 줄 돋보기', C: '검색창 + 찾을 곳 칩' } as const;
