import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChzzkChannel, canReachChzzkApi, requestChzzkApiAccess, searchChzzkChannels } from '@/api/chzzk-channel';
import { Button, Icon, Spinner, TextInput } from '@/ui';
import s from './ChannelSearch.module.css';

/**
 * 채널 이름으로 찾아 고르기 (치지직만). 고르면 ID·이름·프로필 사진을 onPick으로 넘긴다.
 * 치지직 탭도 없고 호스트 권한도 없으면 버튼 하나만 — 누르면 브라우저가 권한을 묻고, 허용하면 검색 칸이 열린다.
 */
export function ChannelSearch({ platform, onPick }: { platform: string; onPick: (c: ChzzkChannel) => void }) {
    const { t } = useTranslation();
    const [access, setAccess] = useState<boolean | null>(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ChzzkChannel[] | null>(null);
    const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { if (platform === 'chzzk') canReachChzzkApi().then(setAccess); }, [platform]);

    // 입력이 멈추면 검색. 앞선 요청은 취소한다.
    useEffect(() => {
        const q = query.trim();
        if (!access || !q) { setResults(null); setState('idle'); return; }
        const ctrl = new AbortController();
        const timer = setTimeout(() => {
            setState('loading');
            searchChzzkChannels(q, ctrl.signal)
                .then(r => { if (!ctrl.signal.aborted) { setResults(r); setState('idle'); } })
                .catch(e => { if (!ctrl.signal.aborted) { console.warn('[tbcv2] channel search failed', e); setState('error'); } });
        }, 300);
        return () => { clearTimeout(timer); ctrl.abort(); };
    }, [query, access]);

    if (platform !== 'chzzk' || access === null) return null;

    if (!access) {
        return (
            <Button icon="search" onClick={async () => {
                if (await requestChzzkApiAccess()) {
                    setAccess(true);
                    setTimeout(() => inputRef.current?.focus());
                }
            }}>{t('channel_search.button')}</Button>
        );
    }

    const pick = (c: ChzzkChannel) => { onPick(c); setQuery(''); };
    return (
        <div className={s.root}>
            <TextInput ref={inputRef} lead="search" value={query} onChange={e => setQuery(e.target.value)}
                placeholder={t('channel_search.placeholder')} aria-label={t('channel_search.button')}
                trail={state === 'loading' ? <Spinner /> : undefined} />
            {query.trim() && state !== 'loading' && (
                state === 'error' ? <div className={s.empty}>{t('channel_search.error')}</div>
                    : results && results.length === 0 ? <div className={s.empty}>{t('channel_search.empty')}</div>
                        : results && (
                            <ul className={s.list}>
                                {results.map(c => (
                                    <li key={c.id}>
                                        <button type="button" className={s.item} onClick={() => pick(c)}>
                                            <ChannelAvatar src={c.imageUrl} size={28} />
                                            <span className={s.name}>{c.name}</span>
                                            {c.verified && <Icon name="verified" className={s.verified} />}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )
            )}
        </div>
    );
}

/** 채널 프로필 사진. 없으면 빈 동그라미. */
export function ChannelAvatar({ src, size = 16 }: { src?: string; size?: number }) {
    const [broken, setBroken] = useState(false);
    useEffect(() => setBroken(false), [src]);
    return src && !broken
        ? <img className={s.avatar} src={src} alt="" width={size} height={size} onError={() => setBroken(true)} />
        : <span className={`${s.avatar} ${s.blank}`} style={{ width: size, height: size }} aria-hidden="true" />;
}
