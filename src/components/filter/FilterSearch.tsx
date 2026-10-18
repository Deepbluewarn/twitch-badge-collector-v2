import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/ui';
import s from './FilterSearch.module.css';

/**
 * 필터 목록 머리 줄의 돋보기 — 누르면 그 자리에서 검색 칸이 펼쳐진다. 필터가 적은 사람에겐 버튼 하나뿐.
 * 검색어가 있으면 펼친 채로 둔다. Esc는 지우고 접는다. (시안: prototype/filter-search)
 */
export function FilterSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const close = () => { onChange(''); setOpen(false); };

    if (!open && !value) {
        return (
            <button type="button" className={s.toggle} onClick={() => setOpen(true)} aria-label={t('filter_list.search')}>
                <Icon name="search" />
            </button>
        );
    }
    return (
        <span className={s.bar}>
            <Icon name="search" />
            <input autoFocus className={s.input} value={value} onChange={e => onChange(e.target.value)}
                placeholder={t('filter_list.search')} aria-label={t('filter_list.search')}
                onBlur={() => { if (!value) setOpen(false); }}
                onKeyDown={e => { if (e.key === 'Escape') close(); }} />
            {value && (
                <button type="button" className={s.clear} onClick={close} aria-label={t('filter_list.search_clear')}>
                    <Icon name="close" />
                </button>
            )}
        </span>
    );
}
