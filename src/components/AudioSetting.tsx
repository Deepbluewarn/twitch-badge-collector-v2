import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Stack, Switch, Tag } from '@/ui';
import { ChannelAvatar } from './filter/ChannelSearch';
import { Note, SectionTitle, SettingRow, SettingsCard } from './settings/SettingsUI';
import { parseChannelKey } from '@/utils/channel-off';
import {
    AUDIO_KEY, AUDIO_STATUS_MESSAGE, DEFAULT_PARAMS, PARAM_RANGE, getAudioConfig, setAudioChannel, updateAudioConfig,
    type AudioConfig, type AudioParams, type AudioStatusReply,
} from '@/utils/audio-compressor';
import s from './AudioSetting.module.css';
import AudioJev from './AudioJev';

/**
 * 설정 '소리' — 방송 소리 컴프레서 (src/utils/audio-compressor.ts).
 * 활성화하면 모든 방송에 걸리고, 팝업 채널 카드의 스위치로 채널마다 끈다. 값은 모든 채널이 같이 쓰고, 바꾸면 방송 탭에 바로 걸린다.
 * 값은 직접 정하거나, 구분선 아래 '설명으로 설정'(AudioJev)에서 문장으로 받는다.
 */
const PARAM_KEYS: (keyof AudioParams)[] = ['threshold', 'ratio', 'knee', 'attack', 'release', 'makeup'];
/** 이름은 오디오 쪽에서 흔히 쓰는 영어 그대로 — 번역하지 않는다 */
const PARAM_LABEL: Record<keyof AudioParams, string> = {
    threshold: 'Threshold', ratio: 'Ratio', knee: 'Knee', attack: 'Attack', release: 'Release', makeup: 'Makeup gain',
};
const HOST_TABS = ['*://chzzk.naver.com/*', '*://*.twitch.tv/*'];
const METER_MS = 100;
/** 미터 끝 = 이만큼 누름 */
const METER_MAX_DB = 24;

export default function AudioSetting() {
    const { t } = useTranslation();
    const [cfg, setCfg] = useState<AudioConfig | null>(null);
    useEffect(() => {
        getAudioConfig().then(setCfg);
        const onChange = (changes: Record<string, unknown>, area: string) => {
            if (area === 'local' && AUDIO_KEY in changes) getAudioConfig().then(setCfg);
        };
        browser.storage.onChanged.addListener(onChange);
        return () => browser.storage.onChanged.removeListener(onChange);
    }, []);
    if (!cfg) return null;

    const setParam = (k: keyof AudioParams, v: number) => {
        setCfg({ ...cfg, params: { ...cfg.params, [k]: v } });
        updateAudioConfig(c => ({ ...c, params: { ...c.params, [k]: v } }));
    };

    return (
        <>
            <SettingsCard>
                <SettingRow label={t('audio.enable')}>
                    <Switch checked={cfg.enabled} onChange={v => updateAudioConfig(c => ({ ...c, enabled: v }))} />
                </SettingRow>
            </SettingsCard>
            <Note>{t('audio.where')}</Note>

            {cfg.enabled && (
                <>
                    <SectionTitle actions={
                        <Button size='sm' variant='text' icon='restart_alt' onClick={() => updateAudioConfig(c => ({ ...c, params: DEFAULT_PARAMS }))}>
                            {t('audio.reset')}
                        </Button>
                    }>{t('audio.params')}</SectionTitle>
                    <SettingsCard>
                        <Meter />
                        {PARAM_KEYS.map(k => {
                            const r = PARAM_RANGE[k];
                            return (
                                <SettingRow key={k} label={PARAM_LABEL[k]}>
                                    <div className={s.slider}>
                                        <input type='range' className={s.range} min={r.min} max={r.max} step={r.step}
                                            value={cfg.params[k]} aria-label={PARAM_LABEL[k]}
                                            onChange={e => setParam(k, Number(e.target.value))} />
                                        <span className={s.value}>{k === 'makeup' && cfg.params[k] > 0 ? '+' : ''}{cfg.params[k]}{r.unit}</span>
                                    </div>
                                </SettingRow>
                            );
                        })}
                    </SettingsCard>

                    <OffChannelList off={cfg.off} />
                    <AudioJev />
                </>
            )}
        </>
    );
}

/**
 * 지금 누르는 양 — 방송 탭에 0.1초마다 묻는다. 걸린 탭이 있으면 그 탭, 없으면 못 건 이유(업데이트 직후, 다른 확장),
 * 그것도 없으면 걸린 탭이 없다고 쓴다.
 */
function Meter() {
    const { t } = useTranslation();
    const [reply, setReply] = useState<AudioStatusReply | null>(null);
    useEffect(() => {
        let tabs: number[] = [];
        let n = 0;
        let alive = true;
        const poll = async () => {
            if (n++ % 10 === 0) tabs = (await browser.tabs.query({ url: HOST_TABS })).flatMap(x => x.id == null ? [] : [x.id]);
            let blocked: AudioStatusReply | null = null;
            for (const id of tabs) {
                const r = await browser.tabs.sendMessage(id, { type: AUDIO_STATUS_MESSAGE }, { frameId: 0 }).catch(() => null) as AudioStatusReply | null;
                if (r?.status === 'ok' && r.reduction != null) { if (alive) setReply(r); return; }
                if (r && r.status !== 'ok') blocked ??= r;
            }
            if (alive) setReply(blocked);
        };
        const timer = setInterval(poll, METER_MS);
        return () => { alive = false; clearInterval(timer); };
    }, []);
    const db = reply?.status === 'ok' ? reply.reduction : null;
    const idle = reply?.status === 'update' ? browser.i18n.getMessage('audioUpdated' as any)
        : reply?.status === 'other' ? browser.i18n.getMessage('audioOtherExtension' as any)
        : t('audio.no_tab');
    return (
        <SettingRow label={t('audio.meter')}>
            {db == null ? <span className={s.idle}>{idle}</span> : (
                <div className={s.slider}>
                    <div className={s.meter}><i style={{ width: `${Math.min(1, -db / METER_MAX_DB) * 100}%` }} /></div>
                    <span className={s.value}>{db.toFixed(1)} dB</span>
                </div>
            )}
        </SettingRow>
    );
}

/** 끈 채널 — 방송에 들어가지 않고도 다시 켤 수 있게. 없으면 그리지 않는다. */
function OffChannelList({ off }: { off: AudioConfig['off'] }) {
    const msg = (k: string) => browser.i18n.getMessage(k as any);
    const entries = Object.entries(off).sort((a, b) => b[1].at - a[1].at);
    if (!entries.length) return null;
    return (
        <>
            <SectionTitle>{msg('offChannels')}</SectionTitle>
            <SettingsCard>
                {entries.map(([key, v]) => {
                    const { platform, id } = parseChannelKey(key);
                    return (
                        <SettingRow key={key}>
                            <Stack dir='row' align='center' gap={8} style={{ flex: 1, minWidth: 0 }}>
                                <ChannelAvatar src={v.image} size={20} />
                                <span className={s.name}>{v.name || id}</span>
                                <Tag>{platform === 'chzzk' ? 'CHZZK' : 'Twitch'}</Tag>
                            </Stack>
                            <Button size='sm' variant='text' onClick={() => setAudioChannel(platform, id, true)}>{msg('turnOn')}</Button>
                        </SettingRow>
                    );
                })}
            </SettingsCard>
        </>
    );
}
