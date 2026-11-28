import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Icon, IconButton, Stack, TextInput } from '@/ui';
import { useConfirm } from '@/ui/useConfirm';
import { SectionTitle, SettingRow, SettingsCard } from './settings/SettingsUI';
import { updateAudioConfig, type AudioParams } from '@/utils/audio-compressor';
import { markUsage } from '@/telemetry/usage-mark';
import {
    AUDIO_JEV_KEY, JEV_KEY_URL, JEV_ORIGINS, askJev, getJevState, updateJevState, type JevFailure, type JevHistoryItem, type JevState,
} from '@/utils/audio-jev';
import s from './AudioSetting.module.css';

/**
 * 설정 '소리'의 '설명으로 설정' (src/utils/audio-jev.ts). 직접 설정 아래, 구분선 밑에 둔다.
 * 입력하는 동안 히스토리를 걸러 보여 준다 — 비슷한 걸 이미 받았으면 Jev를 다시 부르지 않고 적용하게.
 */
const APPLIED_MS = 1500;

export default function AudioJev() {
    const { t, i18n } = useTranslation();
    const [st, setSt] = useState<JevState | null>(null);
    const [q, setQ] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<Exclude<JevFailure, 'limit'> | null>(null);
    const [adv, setAdv] = useState(false);
    const [applied, setApplied] = useState<string | null>(null);
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        getJevState().then(setSt);
        const onChange = (changes: Record<string, unknown>, area: string) => {
            if (area === 'local' && AUDIO_JEV_KEY in changes) getJevState().then(setSt);
        };
        browser.storage.onChanged.addListener(onChange);
        return () => browser.storage.onChanged.removeListener(onChange);
    }, []);

    const ownKey = !!st?.apiKey;
    const quota = ownKey ? {} : st?.quota ?? {};
    const cooldown = quota.cooldownUntil && quota.cooldownUntil > now ? Math.ceil((quota.cooldownUntil - now) / 1000) : 0;
    const limit = quota.limit && quota.limit.resetAt > now ? quota.limit : null;
    // 쿨타임 카운트다운, 한도 풀리는 시각을 지나면 다시 그린다
    useEffect(() => {
        if (!cooldown && !limit) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [!!cooldown, !!limit]);
    if (!st) return null;

    const apply = (id: string, params: AudioParams) => {
        updateAudioConfig(c => ({ ...c, params }));
        setApplied(id);
        setTimeout(() => setApplied(a => a === id ? null : a), APPLIED_MS);
    };

    const send = async () => {
        const question = q.trim();
        if (!question || busy) return;
        setBusy(true);
        setError(null);
        const res = await askJev(question, st.apiKey);
        setBusy(false);
        setNow(Date.now());
        if (res.ok) {
            const item: JevHistoryItem = { id: crypto.randomUUID(), question, name: question, params: res.params, at: Date.now() };
            await updateJevState(x => ({ ...x, history: [item, ...x.history], quota: st.apiKey ? x.quota : res.quota }));
            setQ('');
            apply(item.id, item.params);
        } else {
            if (res.reason !== 'limit') setError(res.reason);
            if (!st.apiKey && (res.reason === 'limit' || res.reason === 'unclear')) await updateJevState(x => ({ ...x, quota: { ...x.quota, ...res.quota } }));
        }
    };

    const needle = q.trim().toLowerCase();
    const shown = needle ? st.history.filter(h => `${h.name} ${h.question}`.toLowerCase().includes(needle)) : st.history;
    const resetAt = limit && new Date(limit.resetAt).toLocaleTimeString(i18n.language, { hour: 'numeric', minute: '2-digit' });

    return (
        <>
            <hr className={s.divider} />
            <SectionTitle>{t('audio.jev.title')}</SectionTitle>
            <p className={s.lead}>{t('audio.jev.note')}</p>
            <SettingsCard>
                <div className={s.ask}>
                    <Stack dir='row' gap={8} align='center'>
                        <div style={{ flex: 1 }}>
                            <TextInput value={q} placeholder={t('audio.jev.placeholder')} disabled={!!limit} maxLength={200}
                                onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(); }} />
                        </div>
                        <Button size='sm' variant='primary' className={s.send} icon={busy || cooldown ? 'hourglass_top' : 'auto_awesome'}
                            disabled={!!limit || !!cooldown || busy || !q.trim()} onClick={send}>
                            {cooldown ? t('audio.jev.seconds', { n: cooldown }) : t('audio.jev.send')}
                        </Button>
                    </Stack>
                    {!limit && quota.remaining != null && <span className={s.idle}>{t('audio.jev.remaining', { n: quota.remaining })}</span>}
                    {error && <span className={s.idle}>{t(`audio.jev.${error}`)}</span>}
                    {limit && (
                        <div className={s.limit}>
                            <Icon name='error' size={18} className={s.limitIcon} />
                            <div>
                                <div>{t(limit.kind === 'user' ? 'audio.jev.user_limit' : 'audio.jev.global_limit', { time: resetAt })}</div>
                                <Stack dir='row' gap={6} className={s.limitActions}>
                                    <Button size='sm' variant='text' icon='open_in_new' onClick={() => window.open(JEV_KEY_URL)}>{t('audio.jev.get_key')}</Button>
                                    <Button size='sm' variant='text' onClick={() => setAdv(true)}>{t('audio.jev.open_advanced')}</Button>
                                </Stack>
                            </div>
                        </div>
                    )}
                </div>
            </SettingsCard>

            {shown.length > 0 && <>
                <SectionTitle>{t('audio.jev.history')}</SectionTitle>
                <SettingsCard>
                    {shown.map(h => <HistoryRow key={h.id} item={h} applied={applied === h.id} onApply={() => { markUsage('audioJevReapply'); apply(h.id, h.params); }} />)}
                </SettingsCard>
            </>}

            <button type='button' className={s.advToggle} aria-expanded={adv} onClick={() => setAdv(!adv)}>
                <Icon name={adv ? 'expand_less' : 'expand_more'} size={18} />{t('audio.jev.advanced')}
            </button>
            {adv && (
                <SettingsCard>
                    <SettingRow label={t('audio.jev.key')}>
                        <KeyInput saved={st.apiKey} />
                    </SettingRow>
                </SettingsCard>
            )}
        </>
    );
}

/**
 * 내 키 — 저장을 눌러야 들어간다. Jev API 권한(선택 권한)은 사용자 동작 안에서만 물을 수 있어서 blur 대신 버튼으로.
 * 비우고 저장하면 다시 중계 서버를 쓴다.
 */
function KeyInput({ saved }: { saved: string }) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState(saved);
    useEffect(() => setDraft(saved), [saved]);
    const save = async () => {
        const apiKey = draft.trim();
        if (apiKey && !await browser.permissions.request({ origins: JEV_ORIGINS }).catch(() => false)) return;
        await updateJevState(x => ({ ...x, apiKey }));
    };
    return (
        <Stack dir='row' gap={6} align='center'>
            <TextInput size='sm' type='password' className={s.keyInput} value={draft} placeholder='sk-...' autoComplete='off'
                onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }} />
            <Button size='sm' disabled={draft.trim() === saved} onClick={save}>{t('common.save')}</Button>
        </Stack>
    );
}

/** 히스토리 한 줄 — 적용, 이름 바꾸기(그 자리에서), 지우기 */
function HistoryRow({ item, applied, onApply }: { item: JevHistoryItem; applied: boolean; onApply: () => void }) {
    const { t, i18n } = useTranslation();
    const [editing, setEditing] = useState(false);
    // Esc로 닫을 때 뒤따르는 blur가 저장하지 않게
    const cancelled = useRef(false);
    const [confirm, confirmDialog] = useConfirm();
    const rename = (v: string) => {
        setEditing(false);
        if (cancelled.current) return;
        const name = v.trim() || item.question;
        if (name !== item.name) updateJevState(x => ({ ...x, history: x.history.map(h => h.id === item.id ? { ...h, name } : h) }));
    };
    const remove = async () => {
        if (!await confirm({ title: t('audio.jev.delete_confirm'), confirmLabel: t('common.remove'), cancelLabel: t('common.cancel') })) return;
        updateJevState(x => ({ ...x, history: x.history.filter(h => h.id !== item.id) }));
    };
    return (
        <SettingRow>
            <Stack dir='row' align='center' gap={8} style={{ flex: 1, minWidth: 0 }}>
                <Icon name='history' size={18} className={s.historyIcon} />
                {editing
                    ? <TextInput size='sm' autoFocus defaultValue={item.name} maxLength={200} style={{ flex: 1 }}
                        onBlur={e => rename(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur();
                            if (e.key === 'Escape') { cancelled.current = true; setEditing(false); }
                        }} />
                    : <span className={s.name} title={item.question}>{item.name}</span>}
            </Stack>
            <span className={s.idle}>{new Date(item.at).toLocaleDateString(i18n.language, { month: 'numeric', day: 'numeric' })}</span>
            <Button size='sm' variant='text' icon={applied ? 'check' : undefined} onClick={onApply}>{t(applied ? 'audio.jev.applied' : 'audio.jev.apply')}</Button>
            <IconButton size='sm' icon='edit' label={t('audio.jev.rename')} onClick={() => { cancelled.current = false; setEditing(true); }} />
            <IconButton size='sm' icon='delete' label={t('common.remove')} onClick={remove} />
            {confirmDialog}
        </SettingRow>
    );
}
