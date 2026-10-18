import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CompositeFilterElement } from '@/interfaces/filter';
import { Icon } from '@/ui';
import { ChannelAvatar } from './ChannelSearch';
import s from './ChannelRail.module.css';

/**
 * 필터 목록 왼쪽의 채널 목록 — 메일함 폴더처럼 고르면 그 채널 필터만 보인다.
 * 채널을 지정한 필터가 없으면 FilterGroupList가 아예 그리지 않는다(채널을 안 쓰는 사람에겐 지금 그대로).
 */
export const VIEW_ALL = '__all__';
export const VIEW_COMMON = '__common__';

export interface RailChannel { id: string; name: string; image?: string; count: number }

/** 필터들에서 채널 목록(이름순)과 채널 없는(공통) 필터 수 */
export function useRailChannels(rows: CompositeFilterElement[]) {
    return useMemo(() => {
        const m = new Map<string, RailChannel>();
        let common = 0;
        for (const r of rows) {
            if (!r.filterChannelId) { common++; continue; }
            const c = m.get(r.filterChannelId) ?? { id: r.filterChannelId, name: r.filterChannelName || r.filterChannelId, count: 0 };
            c.count++;
            c.image ??= r.filterChannelImage;
            m.set(r.filterChannelId, c);
        }
        return { channels: [...m.values()].sort((a, b) => a.name.localeCompare(b.name)), common };
    }, [rows]);
}

export const filterByView = (rows: CompositeFilterElement[], view: string) =>
    view === VIEW_ALL ? rows : rows.filter(r => (r.filterChannelId || VIEW_COMMON) === view);

/** 채널이 이보다 많을 때만 검색 칸 */
const SEARCH_FROM = 8;

export function ChannelRail({ total, common, channels, view, onView }: {
    total: number; common: number; channels: RailChannel[]; view: string; onView: (v: string) => void;
}) {
    const { t } = useTranslation();
    const [q, setQ] = useState('');
    const query = q.trim().toLowerCase();
    const shown = query ? channels.filter(c => c.name.toLowerCase().includes(query) || c.id.toLowerCase().includes(query)) : channels;
    return (
        <nav className={s.rail} aria-label={t('common.channel')}>
            {channels.length > SEARCH_FROM && (
                <input className={s.search} value={q} onChange={e => setQ(e.target.value)}
                    placeholder={t('channel_search.placeholder')} aria-label={t('channel_search.placeholder')} />
            )}
            <div className={s.list}>
                {!query && <>
                    <Item on={view === VIEW_ALL} onClick={() => onView(VIEW_ALL)} count={total}><Icon name="inbox" className={s.icon} />{t('filter_list.channel_all')}</Item>
                    <Item on={view === VIEW_COMMON} onClick={() => onView(VIEW_COMMON)} count={common}><Icon name="public" className={s.icon} />{t('filter_list.channel_none')}</Item>
                    <div className={s.sep} />
                </>}
                {shown.map(c => (
                    <Item key={c.id} on={view === c.id} onClick={() => onView(c.id)} count={c.count}>
                        <ChannelAvatar src={c.image} size={20} /><span className={s.name}>{c.name}</span>
                    </Item>
                ))}
            </div>
        </nav>
    );
}

function Item({ on, onClick, count, children }: { on: boolean; onClick: () => void; count: number; children: React.ReactNode }) {
    return (
        <button type="button" className={`${s.item} ${on ? s.on : ''}`} onClick={onClick} aria-current={on ? 'true' : undefined}>
            {children}<span className={s.count}>{count}</span>
        </button>
    );
}
