import React from 'react';
import { useTranslation } from 'react-i18next';
import { Field, TextInput } from '@/ui';
import { ChannelAvatar, ChannelSearch } from './ChannelSearch';
import s from './ChannelInput.module.css';

/**
 * 필터의 채널 지정 칸 — 채널 수정 대화상자, 새 필터 추가(기본·고급)가 같이 쓴다.
 *
 * 검색으로 고른 채널(사진이 있는 채널)은 ID·이름 칸 대신 칩 하나로 보인다 — 고를 칸이 없으니 ID를 잘못
 * 고칠 일도 없다. ✕로 지우면 다시 검색·입력 칸. 트위치(검색 없음)나 주소를 붙여 넣는 사람은 칸에 바로 쓴다.
 */
export interface ChannelValue { id: string; name: string; image?: string }
export const EMPTY_CHANNEL: ChannelValue = { id: '', name: '' };

/** 채널 주소를 붙여 넣으면 채널 ID만 뽑는다. 주소가 아니면 그대로. */
export function channelIdFromInput(input: string, platform: string): string {
    const v = input.trim();
    if (platform === 'chzzk') {
        const m = v.match(/chzzk\.naver\.com\/(?:live\/)?([0-9a-f]{32})/i);
        if (m) return m[1];
    } else if (platform === 'twitch') {
        const m = v.match(/twitch\.tv\/(?:popout\/)?([A-Za-z0-9_]+)/i);
        if (m) return m[1].toLowerCase();
    }
    return input;
}

export function ChannelInput({ platform, value, onChange, row }: {
    platform: string;
    value: ChannelValue;
    onChange: (v: ChannelValue) => void;
    /** ID·이름 칸을 가로로 (새 필터 추가). 기본은 세로 (대화상자). */
    row?: boolean;
}) {
    const { t } = useTranslation();

    if (value.image && value.id) {
        return (
            <div className={s.chip}>
                <ChannelAvatar src={value.image} size={28} />
                <span className={s.text}>
                    <span className={s.name}>{value.name || value.id}</span>
                    <span className={s.id}>{value.id}</span>
                </span>
                <button type="button" className={s.clear} onClick={() => onChange(EMPTY_CHANNEL)} aria-label={t('common.remove')}>×</button>
            </div>
        );
    }
    return (
        <div className={s.stack}>
            <ChannelSearch platform={platform} onPick={c => onChange({ id: c.id, name: c.name, image: c.imageUrl })} />
            <div className={row ? s.row : s.stack}>
                <Field label={t('common.channel_id')}>
                    <TextInput value={value.id} onChange={e => onChange({ ...value, id: channelIdFromInput(e.target.value, platform), image: undefined })} />
                </Field>
                <Field label={t('common.channel_name')}>
                    <TextInput value={value.name} onChange={e => onChange({ ...value, name: e.target.value })} />
                </Field>
            </div>
        </div>
    );
}
