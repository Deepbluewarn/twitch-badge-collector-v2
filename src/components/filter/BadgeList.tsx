/**
 * 배지 picker — 카드 그리드.
 *
 * 기존 DataGrid 기반은 좁은 dialog 환경에서 컬럼이 압축되고 클릭 영역도 어색했음.
 * 카드 그리드는 (1) 좁은 폭에서도 자동 reflow, (2) 큰 클릭 타겟, (3) 배지 이미지가
 * 중심이라 시각적 인지가 빠름.
 *
 * 동작:
 *  - single (multiple=false): 카드 클릭 → 즉시 onBadgeSelect 호출
 *  - multi (multiple=true): 카드 클릭으로 선택 토글 → 상단 "추가" 버튼으로 일괄 호출
 *  - multi 모드 선택된 카드엔 include/exclude chip — 클릭으로 회전
 *  - 검색바: badgeName + note + channel 매칭
 *  - 스코프 토글(Global/Channel): adapter.supportsChannelBadgeQuery일 때만
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Icon, IconButton, Segmented, Spinner, Stack, Tag, TagTone, TextInput } from '@/ui';
import { BadgeInterface } from '../../interfaces/chat';
import { useGlobalSettingContext } from '../../context/GlobalSetting';
import { getAdapter, getBadgeSrcSet } from '@/platform';
import { rotateFilterType } from '../chip/FilterTypeChip';
import { FilterType } from '@/interfaces/filter';
import s from './BadgeList.module.css';

const TYPE_TONE: Record<FilterType, TagTone> = { include: 'ok', exclude: 'bad', sleep: 'off' };
import { fetchBadgesCached } from '@/utils/badgeCache';

export interface SelectedBadgeCallbacks {
    onBadgeSelect?: (badge: BadgeInterface) => void;
    onMultiBadgesSelect?: (badges: BadgeInterface[]) => void;
    multiple?: boolean;
}

export default function BadgeList({
    onBadgeSelect,
    onMultiBadgesSelect,
    multiple = false,
}: SelectedBadgeCallbacks) {
    const { t } = useTranslation();
    const { globalSetting } = useGlobalSettingContext();
    const adapter = getAdapter(globalSetting.platform);
    const supportsChannelScope = adapter.supportsChannelBadgeQuery;

    const [scope, setScope] = useState<'global' | 'channel'>('global');
    const [channelInput, setChannelInput] = useState('');
    const [channelQuery, setChannelQuery] = useState('');
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    // 여러 개 고르기(고급 설정)를 끄거나 켜면 고른 것을 비운다 — 모드를 오가며 남은 선택이 보이지 않게.
    useEffect(() => { setSelectedIds(new Set()); }, [multiple]);
    const [badges, setBadges] = useState<BadgeInterface[]>([]);

    // 플랫폼 변경 시 상태 초기화 — 기존 검색/선택이 다른 플랫폼에 의미 없음.
    useEffect(() => {
        setScope('global');
        setChannelInput('');
        setChannelQuery('');
        setSearch('');
        setSelectedIds(new Set());
    }, [globalSetting.platform]);

    const channelScopeNeedsInput = supportsChannelScope && scope === 'channel';
    const { data: fetched, isFetching } = useQuery({
        queryKey: ['badges', globalSetting.platform, scope, channelQuery],
        queryFn: () => fetchBadgesCached(adapter, {
            scope,
            channelLogin: scope === 'channel' ? channelQuery : undefined,
        }),
        enabled: !channelScopeNeedsInput || channelQuery !== '',
        // 배지는 거의 안 바뀜 + storage 캐시가 따로 있으니 세션 내 재요청도 막음.
        staleTime: Infinity,
        gcTime: Infinity,
    });

    useEffect(() => {
        if (fetched) setBadges(fetched);
    }, [fetched]);

    const filtered = useMemo(() => {
        if (!search) return badges;
        const q = search.toLowerCase();
        return badges.filter(b =>
            (b.badgeName?.toLowerCase().includes(q))
            || (b.note?.toLowerCase().includes(q))
            || (b.channel?.toLowerCase().includes(q))
        );
    }, [badges, search]);

    const onCardClick = (badge: BadgeInterface) => {
        if (multiple) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(badge.id)) next.delete(badge.id);
                else next.add(badge.id);
                return next;
            });
        } else {
            onBadgeSelect?.(badge);
        }
    };

    const onTypeRotate = (badge: BadgeInterface) => {
        setBadges(prev => prev.map(b =>
            b.id === badge.id ? { ...b, filterType: rotateFilterType(b.filterType) } : b
        ));
    };

    const onAddSelected = () => {
        const picked = badges.filter(b => selectedIds.has(b.id));
        onMultiBadgesSelect?.(picked);
        setSelectedIds(new Set());
    };

    const onChannelSearch = () => {
        setChannelQuery(channelInput.replace(/\s/g, ''));
    };

    return (
        <Stack gap={12} style={{ height: '100%', minHeight: 0 }}>
            {/* 상단 toolbar: 검색 + scope toggle */}
            <Stack dir="row" gap={8} align="center">
                <div style={{ flex: 1, minWidth: 0 }}>
                    <TextInput
                        size="sm"
                        lead="search"
                        placeholder={t('common.search')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        trail={search ? (
                            <IconButton size="sm" icon="clear" label={t('common.reset')} onClick={() => setSearch('')} />
                        ) : undefined}
                    />
                </div>
                {supportsChannelScope && (
                    <Segmented
                        size="sm"
                        value={scope}
                        onChange={setScope}
                        options={[
                            { value: 'global', label: t('common.global') },
                            { value: 'channel', label: t('common.channel') },
                        ]}
                    />
                )}
            </Stack>

            {/* 채널 스코프 입력 */}
            {channelScopeNeedsInput && (
                <Stack dir="row" gap={8}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <TextInput
                            size="sm"
                            placeholder={t('common.channel_name')}
                            value={channelInput}
                            onChange={(e) => setChannelInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') onChannelSearch(); }}
                        />
                    </div>
                    <Button size="sm" onClick={onChannelSearch}>
                        {t('common.search')}
                    </Button>
                </Stack>
            )}

            {/* multi 모드: 선택 카운트 + 추가 버튼 */}
            {multiple && (
                <Stack dir="row" justify="space-between" align="center" style={{ minHeight: 32 }}>
                    <span className={s.meta}>
                        {selectedIds.size > 0
                            ? t('common.selected_count', { count: selectedIds.size })
                            : t('badge_list.multi_select_hint')}
                    </span>
                    <Button
                        variant="primary"
                        size="sm"
                        disabled={selectedIds.size === 0}
                        onClick={onAddSelected}
                    >
                        {t('common.add_selected')}
                    </Button>
                </Stack>
            )}

            {/* 배지 그리드 */}
            <div className={s.scroller}>
                {isFetching && (
                    <div className={s.spinner}>
                        <Spinner />
                    </div>
                )}
                {!isFetching && filtered.length === 0 && (
                    <div className={s.empty}>
                        {channelScopeNeedsInput && channelQuery === ''
                            ? t('badge_list.search_hint')
                            : t('badge_list.empty')}
                    </div>
                )}
                <div className={s.grid}>
                    {filtered.map((badge) => (
                        <BadgeCard
                            key={badge.id}
                            badge={badge}
                            selected={selectedIds.has(badge.id)}
                            multiple={multiple}
                            onClick={() => onCardClick(badge)}
                            onTypeRotate={() => onTypeRotate(badge)}
                        />
                    ))}
                </div>
            </div>
        </Stack>
    );
}

function BadgeCard({
    badge,
    selected,
    multiple,
    onClick,
    onTypeRotate,
}: {
    badge: BadgeInterface;
    selected: boolean;
    multiple: boolean;
    onClick: () => void;
    onTypeRotate: () => void;
}) {
    const { t } = useTranslation();
    const { globalSetting } = useGlobalSettingContext();
    const adapter = getAdapter(globalSetting.platform);
    const showTypeChip = multiple && selected;
    const identity = adapter.getBadgeIdentity(badge.badgeImage.badge_img_url_1x);

    return (
        <Card className={selected && multiple ? `${s.tile} ${s.selected}` : s.tile}>
            <button type="button" className={s.tileBtn} onClick={onClick} aria-pressed={multiple ? selected : undefined}>
                <span className={s.img}>
                    <img
                        src={adapter.getBadgeImageUrl(identity, '2x')}
                        srcSet={getBadgeSrcSet(adapter, identity)}
                        alt={badge.badgeName}
                    />
                </span>
                <span className={s.name} title={badge.badgeName}>{badge.badgeName}</span>
                <span className={s.channel} title={badge.channel}>{badge.channel}</span>
            </button>
            {/* 선택 표시 + filterType chip (multi 모드 + 선택됨) */}
            {selected && multiple && (
                <Icon name="check_circle" size={18} className={s.check} />
            )}
            {showTypeChip && (
                <div className={s.chipRow}>
                    <Tag round tone={TYPE_TONE[badge.filterType] ?? 'neutral'} onClick={onTypeRotate}>
                        {t(`filter.category.${badge.filterType}`)}
                    </Tag>
                </div>
            )}
        </Card>
    );
}
