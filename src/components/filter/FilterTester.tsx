import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlatformAdapter } from '@/platform';
import { evaluateFilterGroup } from '@/filter/evaluate';
import type { BadgeInterface, ChatInfo } from '@/interfaces/chat';
import type { CompositeFilterElement } from '@/interfaces/filter';
import { Icon, IconButton, Select, TextInput } from '@/ui';
import BadgeList from './BadgeList';
import { DEFAULT_MARKER_COLOR, FilterChips } from './FilterList';
import s from './FilterTester.module.css';

/**
 * 필터 시험 — 채팅 한 줄(배지·닉네임·내용)을 만들면 지금 필터로 수집되는지 바로 보여 준다.
 * 필터 목록 옆 칸에 열리고, 열려 있는 동안 목록의 각 줄도 결과에 맞춰 칠한다(useFilterTest → FilterList).
 * 판정은 실제와 같은 evaluateFilterGroup. 실행 버튼 없이 입력할 때마다 바뀐다.
 */

export type Verdict = 'collected' | 'excluded' | 'not_collected';

/** 필터 한 줄의 시험 결과. atoms: 조건별 맞음 여부(꺼진 조건은 빠진다). */
export interface RowTest {
    state: 'include' | 'exclude' | 'partial' | 'miss' | 'inactive';
    atoms: Map<string, boolean>;
}

export interface TestInput {
    nickname: string;
    message: string;
    badges: BadgeInterface[];
    /** 채널을 지정한 필터를 시험할 채널. undefined = 그 밖의 채널 */
    channelId?: string;
}

export const EMPTY_TEST: TestInput = { nickname: '', message: '', badges: [] };

export function useFilterTest(input: TestInput, rules: CompositeFilterElement[], adapter: PlatformAdapter) {
    return useMemo(() => {
        const chat: ChatInfo = {
            badges: input.badges.map(b => adapter.getBadgeIdentity(b.badgeImage.badge_img_url_1x)),
            textContents: [input.message],
            loginName: input.nickname,
            nickName: input.nickname,
        };
        const { channelId } = input;
        const final = evaluateFilterGroup(chat, rules, channelId);
        const rows = new Map<string, RowTest>();
        const included: CompositeFilterElement[] = [];
        const excluded: CompositeFilterElement[] = [];
        for (const r of rules) {
            const atoms = new Map<string, boolean>();
            for (const a of r.filters) {
                if (a.type === 'sleep') continue;
                atoms.set(a.id, evaluateFilterGroup(chat, [{ ...r, filterType: 'include', filterChannelId: undefined, filters: [a] }]).pass);
            }
            const active = r.filterType !== 'sleep' && (!r.filterChannelId || r.filterChannelId === channelId);
            const hit = active && evaluateFilterGroup(chat, [{ ...r, filterType: 'include' }], channelId).pass;
            // '아님' 조건은 그 값이 없는 거의 모든 채팅에서 참이라, 그것만 맞은 걸 "일부 맞음"으로 띄우면
            // 빈 채팅에서도 강조된다. '맞음' 조건이 하나라도 맞았을 때만 일부 맞음으로 본다.
            const some = r.filters.some(a => a.type === 'include' && atoms.get(a.id));
            const state: RowTest['state'] = !active ? 'inactive' : hit ? (r.filterType === 'exclude' ? 'exclude' : 'include') : some ? 'partial' : 'miss';
            rows.set(r.id, { state, atoms });
            if (state === 'include') included.push(r);
            if (state === 'exclude') excluded.push(r);
        }
        const verdict: Verdict = final.pass ? 'collected' : excluded.length ? 'excluded' : 'not_collected';
        return { verdict, color: final.markerColor || DEFAULT_MARKER_COLOR, included, excluded, rows };
    }, [input, rules, adapter]);
}

export type FilterTestResult = ReturnType<typeof useFilterTest>;

const ALL = '__all__';
const VERDICT_ICON: Record<Verdict, string> = { collected: 'check_circle', excluded: 'block', not_collected: 'remove_circle_outline' };

/** 필터 목록 옆 칸. 입력은 위(채팅 한 줄), 결과는 아래. */
export function FilterTesterPanel({ input, onInput, result, rules, adapter, onClose }: {
    input: TestInput;
    onInput: (next: TestInput) => void;
    result: FilterTestResult;
    rules: CompositeFilterElement[];
    adapter: PlatformAdapter;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const [picking, setPicking] = useState(false);
    const set = (patch: Partial<TestInput>) => onInput({ ...input, ...patch });
    const toggleBadge = (b: BadgeInterface) => set({ badges: input.badges.some(x => x.id === b.id) ? input.badges.filter(x => x.id !== b.id) : [...input.badges, b] });

    // 채널을 지정한 필터가 있을 때만 채널을 고르게 한다.
    const channels = useMemo(() => {
        const m = new Map<string, string>();
        rules.forEach(r => { if (r.filterChannelId) m.set(r.filterChannelId, r.filterChannelName || r.filterChannelId); });
        return [...m].map(([value, label]) => ({ value, label }));
    }, [rules]);

    return (
        <section className={s.panel} aria-label={t('filter_test.title')}>
            <div className={s.head}>
                <h2 className={s.title}><Icon name="science" />{t('filter_test.title')}</h2>
                <IconButton icon="close" size="sm" label={t('common.close')} onClick={onClose} />
            </div>

            <div className={s.chat}>
                <div className={s.badges}>
                    {input.badges.map(b => (
                        <button key={b.id} type="button" className={s.badge} onClick={() => toggleBadge(b)} aria-label={`${b.badgeName} ${t('filter_test.remove_badge')}`}>
                            <img src={b.badgeImage.badge_img_url_2x || b.badgeImage.badge_img_url_1x} alt="" />
                        </button>
                    ))}
                    <button type="button" className={`${s.addBadge} ${picking ? s.on : ''}`} onClick={() => setPicking(p => !p)} aria-expanded={picking}>
                        <Icon name={picking ? 'expand_less' : 'add'} />{t('filter_test.badge')}
                    </button>
                </div>
                {picking && (
                    <div className={s.picker}>
                        <BadgeList onBadgeSelect={toggleBadge} />
                    </div>
                )}
                <TextInput value={input.nickname} onChange={e => set({ nickname: e.target.value })} placeholder={t('filter_test.nickname')} aria-label={t('filter_test.nickname')} />
                <TextInput value={input.message} onChange={e => set({ message: e.target.value })} placeholder={t('filter_test.message')} aria-label={t('filter_test.message')} />
                {channels.length > 0 && (
                    <Select value={input.channelId ?? ALL} onChange={v => set({ channelId: v === ALL ? undefined : v })} aria-label={t('filter_test.channel')}
                        options={[{ value: ALL, label: t('filter_test.other_channel') }, ...channels]} />
                )}
            </div>

            <div className={`${s.result} ${s[result.verdict]}`} role="status" aria-live="polite">
                <div className={s.verdict}>
                    <Icon name={VERDICT_ICON[result.verdict]} className={s.verdictIcon} />
                    <span>{t(`filter_test.${result.verdict}`)}</span>
                    {result.verdict === 'collected' && <span className={s.marker} style={{ background: result.color }} aria-hidden="true" />}
                </div>
                {/* 목록에서도 줄을 칠하지만 다른 페이지에 있을 수 있어 여기에도 둔다 */}
                {result.excluded.length > 0 && <Hits label={t('filter_test.excluded_by')} rows={result.excluded} adapter={adapter} />}
                {result.included.length > 0 && <Hits label={t('filter_test.matched')} rows={result.included} adapter={adapter} />}
            </div>
        </section>
    );
}

function Hits({ label, rows, adapter }: { label: string; rows: CompositeFilterElement[]; adapter: PlatformAdapter }) {
    return (
        <div className={s.hits}>
            <span className={s.label}>{label}</span>
            {rows.map(r => <FilterChips key={r.id} row={r} adapter={adapter} />)}
        </div>
    );
}
