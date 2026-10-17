/**
 * PROTOTYPE — 필터 설정 페이지 디자인 시안 3개. 배지 사이트(badgecollector.dev /badges)의 디자인 언어 + UX 개선.
 * "세 가지 필터 페이지 시안을 `?variant=` 로 전환. '0'은 지금 페이지." 개발 빌드에서만 보인다.
 *
 * 필터는 진짜 저장된 값으로 시작하지만 고쳐도 저장하지 않는다 (메모리 안에서만).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGlobalSettingContext } from '@/context/GlobalSetting';
import { useFilterGroupContext } from '@/context/FilterGroup';
import { getAdapter } from '@/platform';
import { useProtoThemeClass } from '@/components/prototype/PrototypeSwitcher';
import { fetchBadgesCached } from '@/utils/badgeCache';
import { evaluateFilterGroup } from '@/filter/evaluate';
import { setDarkTheme } from '@/reducer/setting';
import type { BadgeInterface, ChatInfo } from '@/interfaces/chat';
import type { AtomicFilterElement, CompositeFilterElement, FilterCategory, FilterType } from '@/interfaces/filter';
import type { SettingInterface } from '@/interfaces/setting';

type Platform = SettingInterface['platform'];
const uid = () => Math.random().toString(36).slice(2, 10);
const COLORS = ['#FFC107', '#ff5c8a', '#3dd6a3', '#4c8dff', '#b46bff', '#ff8a3d'];

// ── 공통 데이터 ─────────────────────────────────────────────

/** 저장된 필터로 시작하는 메모리 사본. 저장하지 않는다. */
function useDraftFilters(platform: Platform) {
    const { filterGroup } = useFilterGroupContext();
    const [all, setAll] = useState<CompositeFilterElement[]>([]);
    const seeded = useRef(false);
    useEffect(() => {
        if (seeded.current || filterGroup.length === 0) return;
        seeded.current = true;
        setAll(filterGroup);
    }, [filterGroup]);
    const rules = all.filter(r => r.platform === platform);
    const upsert = (r: CompositeFilterElement) => setAll(prev => prev.some(p => p.id === r.id) ? prev.map(p => p.id === r.id ? r : p) : [...prev, r]);
    const remove = (id: string) => setAll(prev => prev.filter(p => p.id !== id));
    const move = (id: string, d: number) => setAll(prev => {
        const i = prev.findIndex(p => p.id === id); const j = i + d;
        if (i < 0 || j < 0 || j >= prev.length) return prev;
        const next = [...prev]; [next[i], next[j]] = [next[j], next[i]]; return next;
    });
    /** 대량 필터 시험용 — 카탈로그 배지·이름·키워드로 n개를 만들어 붙인다. */
    const seed = (n: number, badges: BadgeInterface[]) => setAll(prev => {
        const words = ['ㅋㅋ', '공지', '질문', '선물', '노래', '감사', '광고', '도배', '스포', '링크'];
        const made: CompositeFilterElement[] = Array.from({ length: n }, (_, i) => {
            const atoms: AtomicFilterElement[] = [];
            const b = badges[(i * 7) % Math.max(1, badges.length)];
            if (b && i % 3 !== 2) atoms.push(badgeAtom(b));
            if (i % 3 !== 0) atoms.push(textAtom(i % 2 ? 'keyword' : 'name', i % 2 ? words[i % words.length] : `시청자${i}`, i % 11 === 0 ? 'exclude' : 'include'));
            const type: FilterType = i % 9 === 0 ? 'exclude' : i % 13 === 0 ? 'sleep' : 'include';
            return { ...newRule(platform, atoms, type), markerColor: COLORS[i % COLORS.length], filterNote: i % 5 === 0 ? `메모 ${i}` : '' };
        });
        return [...prev, ...made];
    });
    return { rules, upsert, remove, move, seed };
}

function useCatalog(platform: Platform) {
    const [badges, setBadges] = useState<BadgeInterface[]>([]);
    useEffect(() => {
        setBadges([]);
        fetchBadgesCached(getAdapter(platform), { scope: 'global' }).then(setBadges).catch(() => setBadges([]));
    }, [platform]);
    return badges;
}

// 치지직 배지 JSON의 그룹 이름은 channel에, 획득 조건은 note에 들어온다 (platform/chzzk.ts).
const groupOf = (b: BadgeInterface) => b.channel || '기타';

function newRule(platform: Platform, atoms: AtomicFilterElement[], filterType: FilterType = 'include'): CompositeFilterElement {
    return { id: uid(), filterType, filterNote: '', filters: atoms, platform, markerColor: COLORS[0] };
}
function badgeAtom(b: BadgeInterface, type: FilterType = 'include'): AtomicFilterElement {
    return { id: uid(), category: 'badge', type, value: b.id, badgeName: b.badgeName, badgeSetId: b.badgeSetId };
}
const textAtom = (category: FilterCategory, value: string, type: FilterType = 'include'): AtomicFilterElement => ({ id: uid(), category, type, value });

/** 규칙이 "배지 하나만 모으기/빼기"인지. 배지 일람(B)에서 타일 상태로 바로 보여 줄 수 있는 모양. */
const singleBadge = (r: CompositeFilterElement) => r.filters.length === 1 && r.filters[0].category === 'badge' && r.filters[0].type === 'include' && !r.filterChannelId;

function Shell({ children }: { children: React.ReactNode }) {
    const themeClass = useProtoThemeClass();
    return (
        <div className={themeClass} style={{ minHeight: '100vh', paddingBottom: 80 }}>
            <div style={{ borderBottom: '2px solid var(--rule)' }}>
                <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 16px', height: 56, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={browser.runtime.getURL('/assets/icon.png')} alt="" width={24} height={24} />
                    <b style={{ fontWeight: 900, fontSize: 17, letterSpacing: '-0.03em' }}>Badge Collector</b>
                    <span style={{ flex: 1 }} />
                    <ThemeSeg />
                    <span className="pt-tag yellow">프로토타입 · 저장 안 됨</span>
                </div>
            </div>
            <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 16px' }}>{children}</div>
        </div>
    );
}

/** 테마 설정(진짜 설정)을 바로 바꾼다 — 밝게/어둡게를 오가며 보기 쉽게. */
function ThemeSeg() {
    const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();
    const v = globalSetting.darkTheme;
    return (
        <div className="pt-seg" style={{ marginRight: 8 }}>
            <button aria-pressed={v === 'light'} onClick={() => dispatchGlobalSetting(setDarkTheme('light'))}>밝게</button>
            <button aria-pressed={v === 'dark'} onClick={() => dispatchGlobalSetting(setDarkTheme('dark'))}>어둡게</button>
            <button aria-pressed={v === 'system'} onClick={() => dispatchGlobalSetting(setDarkTheme('system'))}>시스템</button>
        </div>
    );
}

function PageHead({ platform, setPlatform, right }: { platform: Platform; setPlatform: (p: Platform) => void; right?: React.ReactNode }) {
    return (
        <div style={{ padding: '36px 0 0' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 44, fontWeight: 900, letterSpacing: '-0.05em' }}>필터</h1>
                {right}
            </div>
            <div className="pt-tabs" style={{ marginTop: 18 }} role="tablist">
                {(['chzzk', 'twitch'] as Platform[]).map(p => (
                    <button key={p} role="tab" aria-selected={platform === p} onClick={() => setPlatform(p)}>{p === 'chzzk' ? '치지직' : '트위치'}</button>
                ))}
            </div>
        </div>
    );
}

function usePlatform(): [Platform, (p: Platform) => void] {
    const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();
    return [globalSetting.platform, p => dispatchGlobalSetting({ type: 'SET_PLATFORM', payload: p })];
}

function AtomView({ a, platform }: { a: AtomicFilterElement; platform: Platform }) {
    const not = a.type === 'exclude';
    if (a.category === 'badge') {
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800, textDecoration: not ? 'line-through' : 'none' }}>
                <span className="pt-badge-tile" style={{ width: 30, height: 30, borderRadius: 8 }}>
                    <img src={getAdapter(platform).getBadgeImageUrl(a.value, '2x')} alt="" style={{ width: 20, height: 20 }} />
                </span>
                {a.badgeName || a.value}
            </span>
        );
    }
    return (
        <b style={{ textDecoration: not ? 'line-through' : 'none' }}>
            {a.category === 'name' ? `@${a.value}` : `“${a.value}”`}
        </b>
    );
}

/** 배지 고르기 — 검색 + 그룹별 격자. A·C가 같이 쓴다. */
function BadgePicker({ badges, onPick, onClose }: { badges: BadgeInterface[]; onPick: (b: BadgeInterface) => void; onClose: () => void }) {
    const [q, setQ] = useState('');
    const list = q ? badges.filter(b => `${b.badgeName} ${b.note} ${b.channel}`.toLowerCase().includes(q.toLowerCase())) : badges;
    const groups = [...new Set(list.map(groupOf))];
    return (
        <div style={{ border: '2px solid var(--line)', borderRadius: 12, background: 'var(--paper)', padding: 14, maxHeight: 420, overflow: 'auto' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input className="pt-input" autoFocus placeholder="배지 이름 검색" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1 }} />
                <button className="pt-btn small" onClick={onClose}>닫기</button>
            </div>
            {badges.length === 0 && <p className="pt-muted">배지 목록이 없습니다.</p>}
            {groups.map(g => (
                <div key={g} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', margin: '6px 0' }}>{g}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 4 }}>
                        {list.filter(b => groupOf(b) === g).map(b => (
                            <button key={b.id} onClick={() => onPick(b)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, border: 0, borderRadius: 8, background: 'none', cursor: 'pointer', textAlign: 'left' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--yellow-soft)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                <img src={b.badgeImage.badge_img_url_2x || b.badgeImage.badge_img_url_1x} alt="" width={24} height={24} />
                                <span style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.badgeName}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── 많은 필터: 페이지 + 검색 ─────────────────────────────────────────────
// 필터를 수백 개 등록해 쓰는 사용자가 있다. 목록은 항상 페이지로 자르고, 검색은 조건·메모·채널을 본다.

function usePager<T>(items: T[], size: number, resetKey: unknown = null) {
    const [page, setPage] = useState(0);
    const pages = Math.max(1, Math.ceil(items.length / size));
    useEffect(() => { setPage(0); }, [resetKey]);
    useEffect(() => { if (page > pages - 1) setPage(pages - 1); }, [pages, page]);
    const start = page * size;
    return { page, setPage, pages, start, pageItems: items.slice(start, start + size), total: items.length };
}

function Pager({ page, setPage, pages, start, pageItems, total }: ReturnType<typeof usePager<unknown>>) {
    if (total === 0) return null;
    // 1 … 4 5 [6] 7 8 … 20
    const nums = [...new Set([0, page - 2, page - 1, page, page + 1, page + 2, pages - 1])].filter(n => n >= 0 && n < pages).sort((a, b) => a - b);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'space-between', padding: '10px 0', flexWrap: 'wrap' }}>
            <span className="pt-muted" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{start + 1}–{start + pageItems.length} / {total}</span>
            {pages > 1 && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <button className="pt-btn small" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="이전 페이지">←</button>
                    {nums.map((n, i) => (
                        <React.Fragment key={n}>
                            {i > 0 && n - nums[i - 1] > 1 && <span className="pt-muted">…</span>}
                            <button className={`pt-btn small${n === page ? ' primary' : ''}`} style={{ minWidth: 34, padding: '0 8px', fontVariantNumeric: 'tabular-nums' }} onClick={() => setPage(n)} aria-current={n === page ? 'page' : undefined}>{n + 1}</button>
                        </React.Fragment>
                    ))}
                    <button className="pt-btn small" disabled={page === pages - 1} onClick={() => setPage(page + 1)} aria-label="다음 페이지">→</button>
                </div>
            )}
        </div>
    );
}

const matchesQuery = (r: CompositeFilterElement, q: string) => {
    if (!q) return true;
    const hay = [...r.filters.map(a => `${a.badgeName ?? ''} ${a.value}`), r.filterNote, r.filterChannelName ?? ''].join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).every(w => hay.includes(w));
};

function SearchBox({ value, onChange, count }: { value: string; onChange: (v: string) => void; count: number }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input className="pt-input" type="search" placeholder="필터 검색 — 배지·이름·키워드·메모·채널" value={value} onChange={e => onChange(e.target.value)} style={{ flex: 1, height: 40, fontSize: 15 }} />
            {value && <span className="pt-muted" style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{count}개 찾음</span>}
        </div>
    );
}

/** 시안 확인용 — 필터를 대량으로 넣어 본다. */
function SeedButton({ onSeed }: { onSeed: () => void }) {
    return <button className="pt-link" style={{ fontSize: 13 }} onClick={onSeed}>샘플 300개 넣기</button>;
}

// ── 필터 배열 공통 ─────────────────────────────────────────────
// 도메인 모델 (CONTEXT.md "Filter system"): 필터 그룹 = 필터의 순서 있는 배열, 필터 = 조건의 배열(AND).
//  - 빼기 필터는 순서와 상관없이 이긴다 (맞는 순간 그룹 평가를 끊는다).
//  - 모으기 필터는 판정만 세우고 계속 본다 → 여러 개에 맞으면 *마지막(아래쪽)* 필터의 표시 색.
//  - 조건의 맞음/아님/끄기는 조건 하나에 대한 NOT·비활성. 꺼진 조건이 있으면 그 필터는 안 걸린다.
// 화면 용어: composite = "필터", atomic = "조건".

const atomLabel = (a: AtomicFilterElement) => a.category === 'badge' ? (a.badgeName || a.value) : a.category === 'name' ? `@${a.value}` : `“${a.value}”`;
const CAT_LABEL: Record<FilterCategory, string> = { badge: '배지', name: '이름', keyword: '키워드' };

/** 조건 배열 편집기 — 맞음/아님/끄기, 삭제, 조건 추가. A(펼침·빠른 추가), B(묶음 만들기), C(편집기)가 같이 쓴다. */
function ConditionEditor({ atoms, onChange, badges, platform, compact }: {
    atoms: AtomicFilterElement[];
    onChange: (atoms: AtomicFilterElement[]) => void;
    badges: BadgeInterface[];
    platform: Platform;
    compact?: boolean;
}) {
    const [picking, setPicking] = useState(false);
    const set = (a: AtomicFilterElement) => onChange(atoms.map(x => x.id === a.id ? a : x));
    return (
        <div>
            {atoms.map((a, i) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: compact ? '5px 0' : '8px 0', borderBottom: '1px solid var(--hair)', opacity: a.type === 'sleep' ? 0.5 : 1 }}>
                    <span className="pt-muted" style={{ width: 40, fontSize: 12, fontWeight: 800 }}>{i === 0 ? '' : '그리고'}</span>
                    <span className="pt-tag" style={{ width: 48, textAlign: 'center' }}>{CAT_LABEL[a.category]}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {a.category === 'badge'
                            ? <AtomView a={{ ...a, type: 'include' }} platform={platform} />
                            : <input className="pt-input" autoFocus={!a.value} value={a.value} placeholder={a.category === 'name' ? '닉네임 또는 아이디' : '채팅에 들어간 말'} onChange={e => set({ ...a, value: e.target.value })} style={{ width: '100%', height: 32 }} />}
                    </div>
                    <div className="pt-seg">
                        <button aria-pressed={a.type === 'include'} onClick={() => set({ ...a, type: 'include' })}>{a.category === 'keyword' ? '들어감' : '맞음'}</button>
                        <button aria-pressed={a.type === 'exclude'} onClick={() => set({ ...a, type: 'exclude' })}>{a.category === 'keyword' ? '안 들어감' : '아님'}</button>
                        <button aria-pressed={a.type === 'sleep'} onClick={() => set({ ...a, type: 'sleep' })} title="이 조건이 꺼져 있으면 필터 전체가 걸리지 않습니다">끄기</button>
                    </div>
                    <button className="pt-link" style={{ color: 'var(--muted)' }} aria-label="조건 삭제" onClick={() => onChange(atoms.filter(x => x.id !== a.id))}>×</button>
                </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                <span className="pt-muted" style={{ fontSize: 12, fontWeight: 800, width: 40 }}>{atoms.length ? '그리고' : ''}</span>
                <button className="pt-btn small" onClick={() => setPicking(p => !p)}>+ 배지</button>
                <button className="pt-btn small" onClick={() => onChange([...atoms, textAtom('name', '')])}>+ 이름</button>
                <button className="pt-btn small" onClick={() => onChange([...atoms, textAtom('keyword', '')])}>+ 키워드</button>
            </div>
            {picking && <div style={{ marginTop: 8 }}><BadgePicker badges={badges} onPick={b => { onChange([...atoms, badgeAtom(b)]); setPicking(false); }} onClose={() => setPicking(false)} /></div>}
        </div>
    );
}

/** 필터 한 줄 요약: 조건들을 "그리고"로. 아님은 취소선, 꺼짐은 흐리게. */
function FilterSentence({ r, platform }: { r: CompositeFilterElement; platform: Platform }) {
    return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 8px', minWidth: 0 }}>
            {r.filters.length === 0 && <span className="pt-muted">조건 없음</span>}
            {r.filters.map((a, i) => (
                <React.Fragment key={a.id}>
                    {i > 0 && <span className="pt-muted" style={{ fontWeight: 700, fontSize: 13 }}>그리고</span>}
                    <span style={{ opacity: a.type === 'sleep' ? 0.4 : 1 }}>
                        {a.type === 'exclude' && <span className="pt-muted" style={{ fontSize: 12, fontWeight: 800, marginRight: 4 }}>아님</span>}
                        <AtomView a={a} platform={platform} />
                    </span>
                </React.Fragment>
            ))}
            {r.filterChannelId && <span className="pt-tag ink">{r.filterChannelName || r.filterChannelId} 채널만</span>}
            {r.filterNote && <span className="pt-muted" style={{ fontSize: 13 }}>— {r.filterNote}</span>}
        </div>
    );
}

function ColorPicker({ value, onChange }: { value?: string; onChange: (c: string) => void }) {
    return (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {COLORS.map(c => <button key={c} aria-label={c} onClick={() => onChange(c)} style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', border: (value ?? COLORS[0]) === c ? '3px solid var(--line)' : '2px solid var(--hair)' }} />)}
        </div>
    );
}

/** 채널·메모·색 — 필터(composite)에 붙는 나머지. */
function FilterMeta({ r, upsert }: { r: CompositeFilterElement; upsert: (r: CompositeFilterElement) => void }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 16, marginTop: 14, alignItems: 'end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 800, fontSize: 13 }}>
                <span>이 채널에서만 <span className="pt-muted" style={{ fontWeight: 500 }}>· 비우면 모든 채널</span></span>
                <input className="pt-input" placeholder="채널 이름 또는 주소" value={r.filterChannelName ?? ''} onChange={e => upsert({ ...r, filterChannelName: e.target.value || undefined, filterChannelId: e.target.value ? 'proto' : undefined })} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 800, fontSize: 13 }}>
                <span>메모 <span className="pt-muted" style={{ fontWeight: 500 }}>· 나만 보는 설명</span></span>
                <input className="pt-input" value={r.filterNote} onChange={e => upsert({ ...r, filterNote: e.target.value })} />
            </label>
            {r.filterType === 'include' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 800, fontSize: 13 }}>
                    <span>수집 표시 색</span>
                    <ColorPicker value={r.markerColor} onChange={c => upsert({ ...r, markerColor: c })} />
                </div>
            )}
        </div>
    );
}

// ── A: 필터를 문장으로 ─────────────────────────────────────────────
// 표 대신 한 줄 = 필터 하나를 "배지 A 그리고 키워드 B" 문장으로. 모으기 / 빼기 / 꺼 둔 필터로 나눠
// 빼기가 우선한다는 걸 보이게 한다. 노란 줄에서 조건을 하나 이상 모아 필터 하나로 추가하고,
// 줄을 누르면 그 자리에서 조건 배열·채널·메모·색을 고친다. 모으기 안의 순서는 색 우선순위.

export function VariantA() {
    const [platform, setPlatform] = usePlatform();
    const { rules, upsert, remove, move, seed } = useDraftFilters(platform);
    const badges = useCatalog(platform);
    const [query, setQuery] = useState('');
    const shown = rules.filter(r => matchesQuery(r, query));
    const [draft, setDraft] = useState<AtomicFilterElement[]>([]);
    const [addTo, setAddTo] = useState<FilterType>('include');
    const [open, setOpen] = useState<string | null>(null);

    const commit = () => {
        const atoms = draft.filter(a => a.value.trim());
        if (!atoms.length) return;
        upsert(newRule(platform, atoms, addTo));
        setDraft([]);
    };

    // 섹션마다 따로 페이지를 넘긴다 (모으기가 수백 개여도 빼기는 바로 보이게).
    const pagers = {
        include: usePager(shown.filter(r => r.filterType === 'include'), 20, query),
        exclude: usePager(shown.filter(r => r.filterType === 'exclude'), 20, query),
        sleep: usePager(shown.filter(r => r.filterType === 'sleep'), 20, query),
    };
    const Section = ({ type, title, note }: { type: FilterType; title: string; note: string }) => {
        const pager = pagers[type];
        const all = rules.filter(r => r.filterType === type);
        const list = pager.pageItems;
        return (
            <section style={{ marginTop: 32 }}>
                <div className="pt-section-head"><h2 style={{ fontSize: 20 }}>{title} <span className="pt-muted" style={{ fontWeight: 600, fontSize: 14 }}>{all.length}</span></h2><small>{note}</small></div>
                {list.length === 0 && <p className="pt-muted" style={{ padding: '10px 0' }}>{query ? '검색 결과 없음' : '없음'}</p>}
                {list.map((r, i) => (
                    <div key={r.id} style={{ borderBottom: '1px solid var(--hair)', background: open === r.id ? 'var(--tint)' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 8px', cursor: 'pointer' }} onClick={() => setOpen(o => o === r.id ? null : r.id)}>
                            {type === 'include' && <span className="pt-swatch" style={{ background: r.markerColor ?? COLORS[0] }} title="수집 표시 색" />}
                            <FilterSentence r={r} platform={platform} />
                            <span className="pt-muted" style={{ fontSize: 13, fontWeight: 700 }}>{open === r.id ? '접기' : '고치기'}</span>
                        </div>
                        {open === r.id && (
                            <div style={{ padding: '0 8px 16px' }}>
                                <ConditionEditor atoms={r.filters} onChange={filters => upsert({ ...r, filters })} badges={badges} platform={platform} compact />
                                <FilterMeta r={r} upsert={upsert} />
                                <div style={{ display: 'flex', gap: 14, marginTop: 14, alignItems: 'center' }}>
                                    <div className="pt-seg">
                                        {([['include', '모으기'], ['exclude', '빼기'], ['sleep', '끄기']] as const).map(([v, l]) => <button key={v} aria-pressed={r.filterType === v} onClick={() => upsert({ ...r, filterType: v })}>{l}</button>)}
                                    </div>
                                    {type === 'include' && !query && <>
                                        <button className="pt-link" disabled={pager.start + i === 0} onClick={() => move(r.id, -1)}>위로</button>
                                        <button className="pt-link" disabled={pager.start + i === pager.total - 1} onClick={() => move(r.id, 1)}>아래로</button>
                                    </>}
                                    <span style={{ flex: 1 }} />
                                    <button className="pt-link" style={{ color: 'var(--danger)' }} onClick={() => remove(r.id)}>필터 삭제</button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
                <Pager {...pager} />
            </section>
        );
    };

    return (
        <Shell>
            <PageHead platform={platform} setPlatform={setPlatform} right={
                <div style={{ display: 'flex', gap: 14, fontSize: 13 }}><SeedButton onSeed={() => seed(300, badges)} /><button className="pt-link">가져오기</button><button className="pt-link">내보내기</button></div>
            } />

            {/* 새 필터: 조건을 하나 이상 모아 추가 */}
            <div style={{ marginTop: 24, padding: 16, border: '2px solid var(--line)', borderRadius: 12, background: 'var(--yellow)', color: 'var(--on-yellow)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <b style={{ fontWeight: 900, fontSize: 16 }}>새 필터</b>
                    <div className="pt-seg" style={{ borderColor: '#111' }}>
                        {([['include', '모으기'], ['exclude', '빼기']] as const).map(([v, l]) => <button key={v} aria-pressed={addTo === v} onClick={() => setAddTo(v)} style={{ borderColor: '#111', color: addTo === v ? '#ffd60a' : '#111', background: addTo === v ? '#111' : '#fff' }}>{l}</button>)}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>조건을 여러 개 넣으면 모두 맞는 채팅만 걸립니다</span>
                </div>
                <div style={{ background: 'var(--paper)', color: 'var(--ink)', borderRadius: 8, padding: '6px 12px 12px', border: '2px solid #111' }}>
                    <ConditionEditor atoms={draft} onChange={setDraft} badges={badges} platform={platform} compact />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                    <button className="pt-btn" style={{ background: '#111', color: '#ffd60a', borderColor: '#111' }} disabled={!draft.some(a => a.value.trim())} onClick={commit}>필터 추가</button>
                </div>
            </div>

            <div style={{ marginTop: 28 }}><SearchBox value={query} onChange={setQuery} count={shown.length} /></div>

            <Section type="include" title="모으기" note="하나라도 맞으면 모읍니다 · 여러 개에 맞으면 아래쪽 필터의 색" />
            <Section type="exclude" title="빼기" note="순서와 상관없이 모으기보다 우선합니다" />
            <Section type="sleep" title="꺼 둔 필터" note="판정에 쓰지 않습니다" />
        </Shell>
    );
}

// ── B: 배지 일람 ─────────────────────────────────────────────
// 배지 사이트 /badges와 같은 왼쪽 목차 + 오른쪽 격자. 조건이 배지 하나뿐인 필터는 타일 상태로 바로
// 보여 주고(누를 때마다 모으기 → 빼기 → 해제), 조건이 여럿이거나 이름·키워드·채널이 붙은 필터는
// 위쪽 "묶음 필터"에 문장으로. "묶음 만들기"를 켜면 타일을 눌러 조건 배열을 쌓는다.

export function VariantB() {
    const [platform, setPlatform] = usePlatform();
    const { rules, upsert, remove, seed } = useDraftFilters(platform);
    const badges = useCatalog(platform);
    const [q, setQ] = useState('');
    const [bundleQuery, setBundleQuery] = useState('');
    const [tray, setTray] = useState<AtomicFilterElement[] | null>(null);   // null = 묶음 만들기 꺼짐
    const [trayType, setTrayType] = useState<FilterType>('include');

    const stateOf = (b: BadgeInterface) => singleIndex.get(b.id);
    const inBundle = (b: BadgeInterface) => bundleBadges.has(b.id);
    const onTile = (b: BadgeInterface) => {
        if (tray) {
            setTray(t => t!.some(a => a.value === b.id) ? t!.filter(a => a.value !== b.id) : [...t!, badgeAtom(b)]);
            return;
        }
        const r = stateOf(b);
        if (!r) upsert(newRule(platform, [badgeAtom(b)], 'include'));
        else if (r.filterType === 'include') upsert({ ...r, filterType: 'exclude' });
        else remove(r.id);
    };
    const list = q ? badges.filter(b => `${b.badgeName} ${b.note} ${b.channel}`.toLowerCase().includes(q.toLowerCase())) : badges;
    const groups = [...new Set(list.map(groupOf))];
    const bundles = rules.filter(r => !singleBadge(r));
    const bundlesShown = bundles.filter(r => matchesQuery(r, bundleQuery));
    const bundlePager = usePager(bundlesShown, 8, bundleQuery);   // 배지 격자가 아래로 밀려나지 않게 짧게
    // 배지 → 단일 배지 필터. 타일마다 배열을 훑지 않게 한 번에 색인 (필터가 수백 개).
    const singleIndex = useMemo(() => {
        const m = new Map<string, CompositeFilterElement>();
        for (const r of rules) if (singleBadge(r) && r.filterType !== 'sleep') m.set(r.filters[0].value, r);
        return m;
    }, [rules]);
    const bundleBadges = useMemo(() => new Set(bundles.flatMap(r => r.filters.filter(a => a.category === 'badge').map(a => a.value))), [bundles]);
    const inc = rules.filter(r => r.filterType === 'include').length;
    const exc = rules.filter(r => r.filterType === 'exclude').length;

    return (
        <Shell>
            <PageHead platform={platform} setPlatform={setPlatform} right={
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <SeedButton onSeed={() => seed(300, badges)} />
                    <span className="pt-tag yellow" style={{ fontSize: 13 }}>모으기 {inc}</span>
                    <span className="pt-tag ink" style={{ fontSize: 13 }}>빼기 {exc}</span>
                </div>
            } />

            {/* 묶음 필터 — 조건이 여럿이거나 배지 하나로 표현이 안 되는 필터 */}
            <section style={{ marginTop: 28 }}>
                <div className="pt-section-head">
                    <h2 style={{ fontSize: 18 }}>묶음 필터 <span className="pt-muted" style={{ fontWeight: 600, fontSize: 14 }}>{bundles.length}</span></h2>
                    <small>조건이 모두 맞아야 걸립니다 · 이름·키워드도 여기에</small>
                </div>
                {bundles.length > 8 && <div style={{ margin: '10px 0' }}><SearchBox value={bundleQuery} onChange={setBundleQuery} count={bundlesShown.length} /></div>}
                {bundlePager.pageItems.map(r => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderBottom: '1px solid var(--hair)' }}>
                        <span className={`pt-tag ${r.filterType === 'include' ? 'yellow' : r.filterType === 'exclude' ? 'ink' : ''}`}>{r.filterType === 'include' ? '모으기' : r.filterType === 'exclude' ? '빼기' : '꺼짐'}</span>
                        <FilterSentence r={r} platform={platform} />
                        <button className="pt-link" style={{ color: 'var(--muted)' }} onClick={() => remove(r.id)}>삭제</button>
                    </div>
                ))}
                <Pager {...bundlePager} />
                {!tray
                    ? <button className="pt-btn small" style={{ marginTop: 10 }} onClick={() => setTray([])}>+ 묶음 만들기</button>
                    : (
                        <div style={{ marginTop: 12, padding: 14, border: '2px solid var(--line)', borderRadius: 12, background: 'var(--yellow-soft)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                                <b style={{ fontWeight: 900 }}>새 묶음</b>
                                <div className="pt-seg">
                                    {([['include', '모으기'], ['exclude', '빼기']] as const).map(([v, l]) => <button key={v} aria-pressed={trayType === v} onClick={() => setTrayType(v)}>{l}</button>)}
                                </div>
                                <span className="pt-muted" style={{ fontSize: 13, fontWeight: 600 }}>아래 배지를 누르면 조건으로 들어갑니다</span>
                            </div>
                            <ConditionEditor atoms={tray} onChange={setTray} badges={badges} platform={platform} compact />
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                                <button className="pt-btn small" onClick={() => setTray(null)}>취소</button>
                                <button className="pt-btn small primary" disabled={!tray.some(a => a.value.trim())} onClick={() => { upsert(newRule(platform, tray.filter(a => a.value.trim()), trayType)); setTray(null); }}>묶음 추가</button>
                            </div>
                        </div>
                    )}
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0,1fr)', gap: 40, marginTop: 36, alignItems: 'start' }}>
                <nav style={{ position: 'sticky', top: 16, borderTop: '2px solid var(--rule)', display: 'flex', flexDirection: 'column' }}>
                    <input className="pt-input" placeholder="검색" value={q} onChange={e => setQ(e.target.value)} style={{ margin: '10px 0' }} />
                    {groups.map(g => (
                        <a key={g} href={`#g-${g}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 2px', borderBottom: '1px solid var(--hair)', textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
                            {g}<span className="pt-muted" style={{ fontWeight: 500 }}>{list.filter(b => groupOf(b) === g).length}</span>
                        </a>
                    ))}
                </nav>
                <div>
                    <p className="pt-muted" style={{ margin: '0 0 18px', fontWeight: 600 }}>
                        {tray ? '묶음 만들기 중 — 누른 배지가 새 묶음의 조건이 됩니다.' : <>배지를 누르면 <span className="pt-mark" style={{ color: 'var(--ink)' }}>모으기</span> → <b style={{ textDecoration: 'line-through' }}>빼기</b> → 해제 순으로 바뀝니다. 점 표시는 묶음 필터에 들어 있는 배지.</>}
                    </p>
                    {badges.length === 0 && <p className="pt-muted">이 플랫폼의 배지 목록이 없습니다. 묶음 필터로 이름·키워드를 추가하세요.</p>}
                    {groups.map(g => (
                        <section key={g} id={`g-${g}`} style={{ marginBottom: 36 }}>
                            <div className="pt-section-head"><h2 style={{ fontSize: 18 }}>{g}</h2></div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '18px 8px', marginTop: 12 }}>
                                {list.filter(b => groupOf(b) === g).map(b => {
                                    const st = tray ? (tray.some(a => a.value === b.id) ? 'include' : undefined) : stateOf(b)?.filterType;
                                    return (
                                        <button key={b.id} onClick={() => onTile(b)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, border: 0, background: 'none', cursor: 'pointer', padding: 0, color: 'var(--ink)' }}>
                                            <span style={{
                                                position: 'relative', display: 'grid', placeItems: 'center', width: 72, height: 72, borderRadius: 12,
                                                background: st === 'include' ? 'var(--yellow)' : st === 'exclude' ? 'var(--ink)' : 'var(--tint)',
                                                outline: st ? '2px solid var(--line)' : 'none',
                                            }}>
                                                <img src={b.badgeImage.badge_img_url_2x || b.badgeImage.badge_img_url_1x} alt="" style={{ width: 40, height: 40, opacity: st === 'exclude' ? 0.45 : 1 }} />
                                                {st && <span className={`pt-tag ${st === 'include' ? 'ink' : 'yellow'}`} style={{ position: 'absolute', bottom: -8 }}>{tray ? '조건' : st === 'include' ? '모으기' : '빼기'}</span>}
                                                {!tray && inBundle(b) && <span title="묶음 필터에 들어 있음" style={{ position: 'absolute', top: 6, right: 6, width: 9, height: 9, borderRadius: '50%', background: 'var(--yellow)', border: '2px solid var(--line)' }} />}
                                            </span>
                                            <b style={{ fontSize: 13, lineHeight: 1.35, textDecoration: st === 'exclude' ? 'line-through' : 'none', marginTop: 4 }}>{b.badgeName}</b>
                                            {b.note && <small className="pt-muted" style={{ fontSize: 12, lineHeight: 1.35, marginTop: -6 }}>{b.note}</small>}
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </Shell>
    );
}

// ── C: 목록 + 편집기 ─────────────────────────────────────────────
// 왼쪽은 필터 그룹(순서 있는 배열), 오른쪽은 고른 필터의 조건 배열 편집기. 아래에서 예시 채팅에
// 실제 평가 함수(evaluateFilterGroup)를 *그룹 전체*로 돌려, 이 필터만이 아니라 순서·빼기 우선까지
// 반영된 최종 결과(모음/빠짐, 표시 색)를 보여 준다.

function sampleChats(badges: BadgeInterface[]): { label: string; chat: ChatInfo }[] {
    const pick = (i: number) => badges[i % Math.max(1, badges.length)]?.id;
    const names = ['고양이집사', '방장대리', '치즈부자', '지나가던사람', '오래된구독자', '미션왕'];
    const texts = ['안녕하세요', '공지 확인해주세요', '오늘 방송 재밌다', 'ㅋㅋㅋㅋ', '노래 한 곡 불러주세요', '1년 됐네요'];
    return names.map((n, i) => ({
        label: n,
        chat: { badges: badges.length ? [pick(i), pick(i * 7 + 3)].filter(Boolean) as string[] : [], textContents: [texts[i]], loginName: `user${i}`, nickName: n },
    }));
}

export function VariantC() {
    const [platform, setPlatform] = usePlatform();
    const { rules, upsert, remove, move, seed } = useDraftFilters(platform);
    const badges = useCatalog(platform);
    const [selected, setSelected] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const shown = rules.filter(r => matchesQuery(r, query));
    const pager = usePager(shown, 25, query);
    const rule = rules.find(r => r.id === selected) ?? rules[0];
    const samples = useMemo(() => sampleChats(badges), [badges]);
    const badgeOf = (id: string) => badges.find(b => b.id === id);

    return (
        <Shell>
            <PageHead platform={platform} setPlatform={setPlatform} right={<SeedButton onSeed={() => seed(300, badges)} />} />
            <div style={{ display: 'grid', gridTemplateColumns: '360px minmax(0,1fr)', gap: 32, marginTop: 24, alignItems: 'start' }}>
                <div>
                    <div style={{ marginBottom: 14 }}><SearchBox value={query} onChange={setQuery} count={shown.length} /></div>
                    <div className="pt-section-head"><h2>필터 <span className="pt-muted" style={{ fontWeight: 600 }}>{rules.length}</span></h2><small>위에서 아래로 평가</small></div>
                    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {pager.pageItems.map(r => { const i = rules.indexOf(r); return (
                            <li key={r.id}>
                                <button onClick={() => setSelected(r.id)} style={{
                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 8px', cursor: 'pointer', color: 'var(--ink)',
                                    border: 0, borderBottom: '1px solid var(--hair)', background: rule?.id === r.id ? 'var(--yellow-soft)' : 'none',
                                    boxShadow: rule?.id === r.id ? 'inset 4px 0 0 var(--yellow)' : 'none', opacity: r.filterType === 'sleep' ? 0.5 : 1,
                                }}>
                                    <span className="pt-muted" style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, width: 28, textAlign: 'right' }}>{i + 1}</span>
                                    {r.filterType === 'include' ? <span className="pt-swatch" style={{ background: r.markerColor ?? COLORS[0] }} /> : <span style={{ width: 14 }} />}
                                    <span className={`pt-tag ${r.filterType === 'include' ? 'yellow' : r.filterType === 'exclude' ? 'ink' : ''}`}>{r.filterType === 'include' ? '모으기' : r.filterType === 'exclude' ? '빼기' : '꺼짐'}</span>
                                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>
                                        {r.filters.map(a => (a.type === 'exclude' ? '아님 ' : '') + atomLabel(a)).join(' 그리고 ') || '조건 없음'}
                                    </span>
                                    {r.filters.length > 1 && <span className="pt-tag">{r.filters.length}</span>}
                                </button>
                            </li>
                        ); })}
                    </ol>
                    <Pager {...pager} />
                    <button className="pt-btn block" style={{ marginTop: 12 }} onClick={() => { const r = newRule(platform, []); upsert(r); setSelected(r.id); }}>+ 새 필터</button>
                    <p className="pt-muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>빼기 필터는 순서와 상관없이 우선합니다. 모으기 필터 여러 개에 맞으면 아래쪽 필터의 색으로 표시합니다.</p>
                </div>

                {rule ? (
                    <div style={{ border: '2px solid var(--line)', borderRadius: 14, padding: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <div className="pt-seg">
                                {([['include', '모으기'], ['exclude', '빼기'], ['sleep', '끄기']] as const).map(([v, l]) => <button key={v} aria-pressed={rule.filterType === v} onClick={() => upsert({ ...rule, filterType: v })}>{l}</button>)}
                            </div>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <button className="pt-link" onClick={() => move(rule.id, -1)}>위로</button>
                                <button className="pt-link" onClick={() => move(rule.id, 1)}>아래로</button>
                                <button className="pt-link" style={{ color: 'var(--danger)' }} onClick={() => remove(rule.id)}>필터 삭제</button>
                            </div>
                        </div>

                        <h3 style={{ fontSize: 15, fontWeight: 900, margin: '22px 0 4px' }}>다음 조건을 모두 만족하는 채팅</h3>
                        <ConditionEditor atoms={rule.filters} onChange={filters => upsert({ ...rule, filters })} badges={badges} platform={platform} />
                        <FilterMeta r={rule} upsert={upsert} />

                        <h3 style={{ fontSize: 15, fontWeight: 900, margin: '26px 0 8px', paddingTop: 14, borderTop: '2px solid var(--rule)' }}>예시 채팅에 필터 전체를 돌려 보기</h3>
                        {samples.map(({ label, chat }) => {
                            const mine = rule.filters.length > 0 && evaluateFilterGroup(chat, [{ ...rule, filterType: 'include', filterChannelId: undefined }]).pass;
                            const total = evaluateFilterGroup(chat, rules.map(r => ({ ...r, filterChannelId: undefined })));
                            return (
                                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: mine ? 'var(--yellow-soft)' : 'none' }}>
                                    <span style={{ width: 56, fontSize: 12, fontWeight: 800 }}>{total.pass ? '모음' : '안 모음'}</span>
                                    <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: total.pass ? (total.markerColor ?? COLORS[0]) : 'transparent' }} />
                                    {chat.badges.map(id => badgeOf(id) && <img key={id} src={badgeOf(id)!.badgeImage.badge_img_url_1x} alt="" width={18} height={18} />)}
                                    <b style={{ opacity: total.pass ? 1 : 0.55 }}>{label}</b><span style={{ opacity: total.pass ? 1 : 0.55 }}>{chat.textContents[0]}</span>
                                    {mine && <span className="pt-tag" style={{ marginLeft: 'auto' }}>이 필터에 맞음</span>}
                                </div>
                            );
                        })}
                    </div>
                ) : <p className="pt-muted">필터가 없습니다.</p>}
            </div>
        </Shell>
    );
}

export const FILTER_VARIANTS = { A: VariantA, B: VariantB, C: VariantC };
export const FILTER_VARIANT_NAMES: Record<string, string> = { '0': '지금 페이지', A: '필터를 문장으로', B: '배지 일람 + 묶음', C: '목록 + 편집기' };
