import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFilterGroupContext } from '@/context/FilterGroup';
import { useGlobalSettingContext } from '@/context/GlobalSetting';
import { getAdapter } from '@/platform';
import { evaluateFilterGroup } from '@/filter/evaluate';
import type { BadgeInterface, ChatInfo } from '@/interfaces/chat';
import type { CompositeFilterElement } from '@/interfaces/filter';
import { Button, Dialog, Icon, Select, TextInput } from '@/ui';
import BadgeList from './BadgeList';
import { DEFAULT_MARKER_COLOR, FilterChips } from './FilterList';
import s from './FilterTester.module.css';

/**
 * 필터 시험 — 채팅 한 줄(배지·닉네임·내용)을 만들면 지금 필터로 수집되는지 바로 보여 준다.
 * 판정은 실제와 같은 evaluateFilterGroup. 실행 버튼 없이 입력할 때마다 바뀐다.
 */

type Verdict = 'collected' | 'excluded' | 'not_collected';

const ALL = '__all__';

export default function FilterTester({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useTranslation();
    const { globalSetting } = useGlobalSettingContext();
    const { filterGroup } = useFilterGroupContext();
    const adapter = getAdapter(globalSetting.platform);
    const rules = useMemo(() => filterGroup.filter(f => f.platform === globalSetting.platform), [filterGroup, globalSetting.platform]);

    const [nickname, setNickname] = useState('');
    const [message, setMessage] = useState('');
    const [badges, setBadges] = useState<BadgeInterface[]>([]);
    const [picking, setPicking] = useState(false);
    const [channel, setChannel] = useState(ALL);

    // 채널을 지정한 필터가 있을 때만 채널을 고르게 한다.
    const channels = useMemo(() => {
        const m = new Map<string, string>();
        rules.forEach(r => { if (r.filterChannelId) m.set(r.filterChannelId, r.filterChannelName || r.filterChannelId); });
        return [...m].map(([value, label]) => ({ value, label }));
    }, [rules]);
    const channelId = channel === ALL ? undefined : channel;

    const chat: ChatInfo = useMemo(() => ({
        badges: badges.map(b => adapter.getBadgeIdentity(b.badgeImage.badge_img_url_1x)),
        textContents: [message],
        loginName: nickname,
        nickName: nickname,
    }), [badges, message, nickname, adapter]);

    const result = useMemo(() => {
        const final = evaluateFilterGroup(chat, rules, channelId);
        // 필터 하나씩: 꺼진 필터·다른 채널 필터는 판정에 안 쓰인다.
        const hits = rules.filter(r => r.filterType !== 'sleep'
            && (!r.filterChannelId || r.filterChannelId === channelId)
            && evaluateFilterGroup(chat, [{ ...r, filterType: 'include' }], channelId).pass);
        const included = hits.filter(r => r.filterType === 'include');
        const excluded = hits.filter(r => r.filterType === 'exclude');
        const verdict: Verdict = final.pass ? 'collected' : excluded.length ? 'excluded' : 'not_collected';
        return { verdict, color: final.markerColor || DEFAULT_MARKER_COLOR, included, excluded };
    }, [chat, rules, channelId]);

    const toggleBadge = (b: BadgeInterface) => setBadges(prev => (prev.some(x => x.id === b.id) ? prev.filter(x => x.id !== b.id) : [...prev, b]));

    return (
        <Dialog open={open} onClose={onClose} width="md" title={t('filter_test.title')}
            actions={<Button onClick={onClose}>{t('common.close')}</Button>}>
            {/* 채팅 한 줄 — 치지직 채팅처럼 [배지][닉네임] 내용 */}
            <div className={s.chat}>
                {badges.map(b => (
                    <button key={b.id} type="button" className={s.badge} onClick={() => toggleBadge(b)} aria-label={`${b.badgeName} ${t('filter_test.remove_badge')}`}>
                        <img src={b.badgeImage.badge_img_url_2x || b.badgeImage.badge_img_url_1x} alt="" />
                    </button>
                ))}
                <button type="button" className={`${s.addBadge} ${picking ? s.on : ''}`} onClick={() => setPicking(p => !p)} aria-expanded={picking}>
                    <Icon name="add" />{t('filter_test.badge')}
                </button>
                <TextInput className={s.nick} value={nickname} onChange={e => setNickname(e.target.value)} placeholder={t('filter_test.nickname')} aria-label={t('filter_test.nickname')} />
                <TextInput className={s.message} value={message} onChange={e => setMessage(e.target.value)} placeholder={t('filter_test.message')} aria-label={t('filter_test.message')} />
            </div>

            {channels.length > 0 && (
                <div className={s.channelRow}>
                    <span className={s.label}>{t('filter_test.channel')}</span>
                    <Select size="sm" value={channel} onChange={setChannel} style={{ width: 'auto' }}
                        options={[{ value: ALL, label: t('filter_test.other_channel') }, ...channels]} />
                </div>
            )}

            {picking && (
                <div className={s.picker}>
                    <BadgeList onBadgeSelect={toggleBadge} />
                </div>
            )}

            <Result {...result} adapter={adapter} />
        </Dialog>
    );
}

const VERDICT_ICON: Record<Verdict, string> = { collected: 'check_circle', excluded: 'block', not_collected: 'remove_circle_outline' };

function Result({ verdict, color, included, excluded, adapter }: {
    verdict: Verdict; color: string; included: CompositeFilterElement[]; excluded: CompositeFilterElement[]; adapter: ReturnType<typeof getAdapter>;
}) {
    const { t } = useTranslation();
    return (
        <div className={`${s.result} ${s[verdict]}`} role="status" aria-live="polite">
            <div className={s.verdict}>
                <Icon name={VERDICT_ICON[verdict]} className={s.verdictIcon} />
                <span>{t(`filter_test.${verdict}`)}</span>
                {verdict === 'collected' && <span className={s.marker} style={{ background: color }} aria-hidden="true" />}
            </div>
            {excluded.length > 0 && <Hits label={t('filter_test.excluded_by')} rows={excluded} adapter={adapter} />}
            {included.length > 0 && <Hits label={t('filter_test.matched')} rows={included} adapter={adapter} />}
        </div>
    );
}

function Hits({ label, rows, adapter }: { label: string; rows: CompositeFilterElement[]; adapter: ReturnType<typeof getAdapter> }) {
    return (
        <div className={s.hits}>
            <span className={s.label}>{label}</span>
            <div className={s.hitList}>
                {rows.map(r => <FilterChips key={r.id} row={r} adapter={adapter} />)}
            </div>
        </div>
    );
}
