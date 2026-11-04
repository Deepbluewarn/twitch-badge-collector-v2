import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChzzkChannel, canReachChzzkApi, fetchChzzkChannel, requestChzzkApiAccess, searchChzzkChannels } from '@/api/chzzk-channel';
import { Icon, Spinner, TextInput } from '@/ui';
import { verifiedMarkUrl } from '@/platform/chzzk-verified';
import type { AtomicFilterElement } from '@/interfaces/filter';
import { ChannelAvatar } from './ChannelSearch';
import s from './NicknameInput.module.css';

/**
 * 닉네임 조건의 값 칸 — 새 필터 추가(기본·고급)와 조건 수정 대화상자가 같이 쓴다.
 *
 * 치지직은 사용자 ID(userIdHash)가 곧 그 사람의 채널 ID라, 채널 검색으로 사람을 고르면 ID로 맞출 수 있다.
 * 고른 사람은 칩으로 보이고 닉네임을 바꿔도 계속 맞는다. 검색에 안 나오는 시청자도 많아서(실측 5명 중 2명)
 * 고르지 않고 적은 글자는 예전처럼 닉네임으로 맞춘다. 채널 주소나 ID를 붙여 넣으면 그 사람으로 바로 고른다.
 */
export type NicknameValue = Pick<AtomicFilterElement, 'value' | 'userId' | 'userImage'>;

/** 채널 주소나 32자리 ID만 있는 입력이면 그 ID. */
function userIdFromInput(input: string): string | null {
    const m = input.trim().match(/^(?:https?:\/\/)?(?:chzzk\.naver\.com\/(?:live\/)?)?([0-9a-f]{32})\/?$/i);
    return m ? m[1].toLowerCase() : null;
}

const fromChannel = (c: ChzzkChannel): NicknameValue => ({ value: c.name, userId: c.id, userImage: c.imageUrl });

export function NicknameInput({ platform, value, onChange }: {
    platform: string;
    value: NicknameValue;
    onChange: (v: NicknameValue) => void;
}) {
    const { t } = useTranslation();
    const chzzk = platform === 'chzzk';
    const [access, setAccess] = useState<boolean | null>(null);
    const [results, setResults] = useState<ChzzkChannel[]>([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    // 화살표로 고르는 중인 결과 (-1: 없음)
    const [active, setActive] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    // 붙여 넣은 ID를 확인하는 중에 사용자가 다시 쓰면 늦게 온 결과는 버린다
    const resolving = useRef(0);

    useEffect(() => { if (chzzk) canReachChzzkApi().then(setAccess); }, [chzzk]);

    const query = value.userId ? '' : value.value.trim();
    useEffect(() => {
        if (!chzzk || !access || !query || userIdFromInput(query)) { setResults([]); setLoading(false); return; }
        const ctrl = new AbortController();
        const timer = setTimeout(() => {
            setLoading(true);
            searchChzzkChannels(query, ctrl.signal)
                .then(r => { if (!ctrl.signal.aborted) { setResults(r); setActive(-1); } })
                .catch(e => { if (!ctrl.signal.aborted) { console.warn('[tbcv2] user search failed', e); setResults([]); } })
                .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
        }, 300);
        return () => { clearTimeout(timer); ctrl.abort(); };
    }, [query, access, chzzk]);

    const type = (text: string) => {
        const id = chzzk ? userIdFromInput(text) : null;
        const ticket = ++resolving.current;
        if (!id) { onChange({ value: text, userId: undefined, userImage: undefined }); return; }
        // 이름을 못 가져와도 ID로는 맞는다 — 이름 자리에 ID를 둔다
        onChange({ value: id, userId: id, userImage: undefined });
        fetchChzzkChannel(id)
            .then(c => { if (ticket === resolving.current) onChange(fromChannel(c)); })
            .catch(e => console.warn('[tbcv2] user lookup failed', e));
    };

    const pick = (c: ChzzkChannel) => { resolving.current++; onChange(fromChannel(c)); setOpen(false); };
    const clear = () => {
        resolving.current++;
        onChange({ value: '', userId: undefined, userImage: undefined });
        setTimeout(() => inputRef.current?.focus());
    };

    if (value.userId) {
        return (
            <div className={s.chip} title={value.userId}>
                <ChannelAvatar src={value.userImage} size={24} />
                <span className={s.name}>{value.value}</span>
                <button type="button" className={s.clear} onClick={clear} aria-label={t('common.remove')}>×</button>
            </div>
        );
    }

    // 치지직에선 오른쪽 자리를 늘 둔다. 자리가 생겼다 없어지면 TextInput이 칸을 감싸는 요소를 바꿔
    // input이 새로 만들어지고, 검색이 시작되는 순간 포커스가 빠져 이어서 칠 수 없다.
    const trail = !chzzk ? undefined : <>{loading && <Spinner />}</>;

    // 치지직 탭도 권한도 없으면 검색 결과 자리에 허용 버튼을 띄운다 — 칸 구석 아이콘은 아무도 못 알아챈다.
    // 권한 요청은 사용자 동작(클릭, Enter) 안에서만 된다. 허용하면 지금 적힌 글자로 바로 찾는다.
    const needAccess = chzzk && access === false && !!query && !userIdFromInput(query);
    const allow = async () => {
        if (await requestChzzkApiAccess()) setAccess(true);
        inputRef.current?.focus();
    };

    const shown = open && (results.length > 0 || needAccess);
    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!shown) return;
        if (needAccess && e.key === 'Enter') {
            e.preventDefault();
            void allow();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const step = e.key === 'ArrowDown' ? 1 : -1;
            // 끝에서 한 칸 더 가면 입력 칸(-1)으로, 거기서 다시 반대쪽 끝으로
            setActive(i => {
                const next = i + step;
                return next >= results.length ? -1 : next < -1 ? results.length - 1 : next;
            });
        } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault();
            pick(results[active]);
        } else if (e.key === 'Escape') {
            // 대화상자까지 닫히지 않게 목록만 닫는다
            e.stopPropagation();
            setOpen(false);
        }
    };

    return (
        <>
            <TextInput ref={inputRef} value={value.value} trail={trail}
                role="combobox" aria-expanded={shown} aria-autocomplete="list"
                onChange={e => { type(e.target.value); setOpen(true); setActive(-1); }}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onKeyDown={onKeyDown} />
            {shown && (
                <Dropdown anchor={inputRef}>
                    {needAccess ? (
                        <li>
                            <button type="button" className={`${s.item} ${s.allow}`} onMouseDown={e => e.preventDefault()} onClick={allow}>
                                <Icon name="person_search" />
                                <span className={s.name}>{t('user_search.allow')}</span>
                            </button>
                        </li>
                    ) : results.map((c, i) => (
                        <li key={c.id} role="option" aria-selected={i === active}>
                            {/* 누르는 순간 칸이 blur돼 목록이 닫히지 않게 mousedown 기본 동작을 막는다 */}
                            <button type="button" tabIndex={-1} className={`${s.item} ${i === active ? s.active : ''}`}
                                ref={el => { if (el && i === active) el.scrollIntoView({ block: 'nearest' }); }} onMouseDown={e => e.preventDefault()} onClick={() => pick(c)}>
                                <ChannelAvatar src={c.imageUrl} size={24} />
                                <span className={s.name}>{c.name}</span>
                                {c.verified && <img src={verifiedMarkUrl(c.verified)} alt="" className={s.verified} />}
                            </button>
                        </li>
                    ))}
                </Dropdown>
            )}
        </>
    );
}

/**
 * 검색 결과 자리 — 입력 칸 바로 아래에 띄운다. 필터 추가 카드와 대화상자 본문이 넘치면 잘라내므로(overflow)
 * body에 붙이고 칸의 화면 위치를 따라간다.
 */
function Dropdown({ anchor, children }: {
    anchor: React.RefObject<HTMLInputElement | null>;
    children: React.ReactNode;
}) {
    const [rect, setRect] = useState<DOMRect | null>(null);
    useLayoutEffect(() => {
        const place = () => { if (anchor.current) setRect(anchor.current.getBoundingClientRect()); };
        place();
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        return () => {
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
    }, [anchor]);
    if (!rect) return null;
    return createPortal(
        <ul className={s.menu} role="listbox" style={{ top: rect.bottom + 4, left: rect.left, width: rect.width }}>
            {children}
        </ul>,
        document.body,
    );
}
