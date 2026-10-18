/**
 * PROTOTYPE — 버릴 코드. 질문: "채널이 수백 개면 필터 목록을 채널별로 어떻게 보나?"
 * 세 가지 시안을 설정 페이지에서 ?variant=A|B|C 로 바꿔 본다(dev 빌드에서만). 가짜 채널 300개를 섞는다(?fake=0이면 끔).
 * 가짜 필터(id 'proto-')는 메모리에만 있고, 고치는 동작은 무시한다.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PlatformAdapter } from '@/platform';
import type { CompositeFilterElement } from '@/interfaces/filter';
import { Icon } from '@/ui';
import { FilterList, FilterListActions } from '../FilterList';
import { ChannelAvatar } from '../ChannelSearch';
import p from './ChannelViewPrototype.module.css';

type Row = CompositeFilterElement;
const ALL = '__all__';
const NONE = '__none__';

// ── 가짜 데이터 ─────────────────────────────
const SYL = '가나다라마바사아자차카타파하루미유키소리하나별달빛토끼냥이코코모모';
function fakeName(i: number) {
    const L = SYL.length;
    const n = SYL[i % L] + SYL[Math.floor(i / L) % L] + (i % 3 ? SYL[(i * 7) % L] : '');
    return i % 5 === 0 ? `${n}TV` : i % 7 === 0 ? `${n} 채널` : n;
}
export function makeFakeRows(platform: Row['platform']): Row[] {
    const rows: Row[] = [];
    for (let i = 0; i < 300; i++) {
        const id = `proto${String(i).padStart(4, '0')}`;
        const name = fakeName(i);
        const count = 1 + (i * 13 % 5 === 0 ? 6 : i % 3);
        for (let j = 0; j < count; j++) {
            rows.push({
                id: `proto-${i}-${j}`, platform, filterType: j % 4 === 3 ? 'exclude' : 'include', filterNote: '',
                filterChannelId: id, filterChannelName: name,
                filters: [{ id: `proto-a-${i}-${j}`, category: j % 2 ? 'name' : 'keyword', type: 'include', value: j % 2 ? `fan${i}_${j}` : ['공지', '안녕', '질문', '이벤트'][j % 4] }],
            });
        }
    }
    return rows;
}
export function protoSafeActions(a: FilterListActions): FilterListActions {
    const fake = (r: Row) => r.id.startsWith('proto-');
    const wrap = <A extends unknown[]>(fn: (r: Row, ...x: A) => void) => (r: Row, ...x: A) => { if (!fake(r)) fn(r, ...x); };
    return {
        editAtom: wrap(a.editAtom), addAtom: wrap(a.addAtom), removeAtom: wrap(a.removeAtom), editChannel: wrap(a.editChannel),
        removeChannel: wrap(a.removeChannel), editNote: wrap(a.editNote), removeNote: wrap(a.removeNote), rotateType: wrap(a.rotateType),
        setColor: wrap(a.setColor), deleteMany: ids => a.deleteMany(new Set([...ids].filter(id => !id.startsWith('proto-')))),
    };
}

// ── 공통 ─────────────────────────────
interface Channel { id: string; name: string; image?: string; count: number }
function useChannels(rows: Row[]) {
    return useMemo(() => {
        const m = new Map<string, Channel>();
        let none = 0;
        for (const r of rows) {
            if (!r.filterChannelId) { none++; continue; }
            const c = m.get(r.filterChannelId) ?? { id: r.filterChannelId, name: r.filterChannelName || r.filterChannelId, image: r.filterChannelImage, count: 0 };
            c.count++;
            m.set(r.filterChannelId, c);
        }
        return { list: [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko')), none };
    }, [rows]);
}
const byView = (rows: Row[], view: string) => view === ALL ? rows : rows.filter(r => (r.filterChannelId || NONE) === view);
const match = (c: Channel, q: string) => c.name.toLowerCase().includes(q.toLowerCase()) || c.id.toLowerCase().includes(q.toLowerCase());

export interface VariantProps {
    rows: Row[];
    adapter: PlatformAdapter;
    actions: FilterListActions;
    /** 필터 시험 버튼 등 머리 줄 오른쪽 */
    extra: React.ReactNode;
    test?: React.ComponentProps<typeof FilterList>['test'];
}

// ── A: 검색 되는 채널 고르기 (드롭다운 자리 그대로, 열면 검색 + 목록) ─────────────────────────────
export function VariantA({ rows, adapter, actions, extra, test }: VariantProps) {
    const { list, none } = useChannels(rows);
    const [view, setView] = useState(ALL);
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const box = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);
    const current = view === ALL ? null : view === NONE ? null : list.find(c => c.id === view);
    const label = view === ALL ? '모든 채널' : view === NONE ? '채널 지정 안 함' : current?.name;
    const shown = q ? list.filter(c => match(c, q)) : list;
    const choose = (v: string) => { setView(v); setOpen(false); setQ(''); };
    return (
        <FilterList rows={byView(rows, view)} adapter={adapter} actions={actions} test={test} toolbarExtra={<>
            <div className={p.combo} ref={box}>
                <button type="button" className={p.comboBtn} onClick={() => setOpen(o => !o)} aria-expanded={open}>
                    {current && <ChannelAvatar src={current.image} size={18} />}
                    <span className={p.ellipsis}>{label}</span>
                    <Icon name="expand_more" />
                </button>
                {open && (
                    <div className={p.pop}>
                        <input autoFocus className={p.search} placeholder="채널 이름" value={q} onChange={e => setQ(e.target.value)} />
                        <div className={p.popList}>
                            {!q && <>
                                <Option on={view === ALL} onClick={() => choose(ALL)}>모든 채널<span className={p.count}>{rows.length}</span></Option>
                                <Option on={view === NONE} onClick={() => choose(NONE)}>채널 지정 안 함<span className={p.count}>{none}</span></Option>
                                <div className={p.sep} />
                            </>}
                            {shown.map(c => (
                                <Option key={c.id} on={view === c.id} onClick={() => choose(c.id)}>
                                    <ChannelAvatar src={c.image} size={20} /><span className={p.ellipsis}>{c.name}</span><span className={p.count}>{c.count}</span>
                                </Option>
                            ))}
                            {q && shown.length === 0 && <div className={p.emptyPop}>없음</div>}
                        </div>
                    </div>
                )}
            </div>
            {extra}
        </>} />
    );
}
function Option({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
    return <button type="button" className={`${p.opt} ${on ? p.optOn : ''}`} onClick={onClick}>{children}</button>;
}

// ── B: 왼쪽 채널 목록 (메일함 폴더처럼 늘 보임) ─────────────────────────────
export function VariantB({ rows, adapter, actions, extra, test }: VariantProps) {
    const { list, none } = useChannels(rows);
    const [view, setView] = useState(ALL);
    const [q, setQ] = useState('');
    const shown = q ? list.filter(c => match(c, q)) : list;
    return (
        <div className={p.split}>
            <aside className={p.rail}>
                <input className={p.search} placeholder="채널 이름" value={q} onChange={e => setQ(e.target.value)} />
                <div className={p.railList}>
                    {!q && <>
                        <Option on={view === ALL} onClick={() => setView(ALL)}><Icon name="inbox" />모든 필터<span className={p.count}>{rows.length}</span></Option>
                        <Option on={view === NONE} onClick={() => setView(NONE)}><Icon name="public" />채널 지정 안 함<span className={p.count}>{none}</span></Option>
                        <div className={p.sep} />
                    </>}
                    {shown.map(c => (
                        <Option key={c.id} on={view === c.id} onClick={() => setView(c.id)}>
                            <ChannelAvatar src={c.image} size={20} /><span className={p.ellipsis}>{c.name}</span><span className={p.count}>{c.count}</span>
                        </Option>
                    ))}
                </div>
            </aside>
            <div className={p.splitMain}>
                <FilterList rows={byView(rows, view)} adapter={adapter} actions={actions} test={test} toolbarExtra={extra} />
            </div>
        </div>
    );
}

// ── C: 필터 검색창 하나 — 채널·조건·메모를 같이 찾고, 고른 채널은 토큰으로 ─────────────────────────────
export function VariantC({ rows, adapter, actions, extra, test }: VariantProps) {
    const { list } = useChannels(rows);
    const [channel, setChannel] = useState<Channel | null>(null);
    const [q, setQ] = useState('');
    const [focus, setFocus] = useState(false);
    const suggest = q.trim() && !channel ? list.filter(c => match(c, q.trim())).slice(0, 6) : [];
    const shown = useMemo(() => {
        let r = channel ? rows.filter(x => x.filterChannelId === channel.id) : rows;
        const t = q.trim().toLowerCase();
        if (t) r = r.filter(x => (x.filterChannelName ?? '').toLowerCase().includes(t) || (x.filterNote ?? '').toLowerCase().includes(t)
            || x.filters.some(a => (a.badgeName ?? a.value).toLowerCase().includes(t)));
        return r;
    }, [rows, channel, q]);
    return (
        <div className={p.stack}>
            <div className={p.searchBar}>
                <Icon name="search" />
                {channel && (
                    <span className={p.token}>
                        <ChannelAvatar src={channel.image} size={16} />{channel.name}
                        <button type="button" onClick={() => setChannel(null)} aria-label="채널 빼기">×</button>
                    </span>
                )}
                <input className={p.barInput} placeholder={channel ? '이 채널의 필터 찾기' : '필터 찾기 — 채널, 닉네임, 키워드, 배지, 메모'}
                    value={q} onChange={e => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)}
                    onKeyDown={e => { if (e.key === 'Backspace' && !q && channel) setChannel(null); }} />
                {focus && suggest.length > 0 && (
                    <div className={p.suggest}>
                        {suggest.map(c => (
                            <button key={c.id} type="button" className={p.opt} onMouseDown={() => { setChannel(c); setQ(''); }}>
                                <span className={p.kind}>채널</span><ChannelAvatar src={c.image} size={20} /><span className={p.ellipsis}>{c.name}</span><span className={p.count}>{c.count}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <FilterList rows={shown} adapter={adapter} actions={actions} test={test} toolbarExtra={extra} />
        </div>
    );
}

export const VARIANTS = { A: '검색 되는 드롭다운', B: '왼쪽 채널 목록', C: '필터 검색창 + 채널 토큰' } as const;
