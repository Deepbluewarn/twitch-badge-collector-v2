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
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import CircularProgress from '@mui/material/CircularProgress';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { BadgeInterface } from '../../interfaces/chat';
import { useGlobalSettingContext } from '../../context/GlobalSetting';
import { getAdapter, getBadgeSrcSet } from '@/platform';
import { rotateFilterType, chipColor } from '../chip/FilterTypeChip';
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
        <Stack sx={{ height: '100%', minHeight: 0 }} spacing={1.5}>
            {/* 상단 toolbar: 검색 + scope toggle */}
            <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                    size="small"
                    placeholder={t('common.search')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    sx={{ flex: 1 }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon fontSize="small" />
                            </InputAdornment>
                        ),
                        endAdornment: search ? (
                            <InputAdornment position="end">
                                <IconButton size="small" onClick={() => setSearch('')}>
                                    <ClearIcon fontSize="small" />
                                </IconButton>
                            </InputAdornment>
                        ) : undefined,
                    }}
                />
                {supportsChannelScope && (
                    <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={scope}
                        onChange={(_, v) => v && setScope(v)}
                    >
                        <ToggleButton value="global">{t('common.global')}</ToggleButton>
                        <ToggleButton value="channel">{t('common.channel')}</ToggleButton>
                    </ToggleButtonGroup>
                )}
            </Stack>

            {/* 채널 스코프 입력 */}
            {channelScopeNeedsInput && (
                <Stack direction="row" spacing={1}>
                    <TextField
                        size="small"
                        placeholder={t('common.channel_name')}
                        value={channelInput}
                        onChange={(e) => setChannelInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') onChannelSearch(); }}
                        sx={{ flex: 1 }}
                    />
                    <Button variant="outlined" size="small" onClick={onChannelSearch}>
                        {t('common.search')}
                    </Button>
                </Stack>
            )}

            {/* multi 모드: 선택 카운트 + 추가 버튼 */}
            {multiple && (
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ minHeight: 32 }}>
                    <Typography variant="body2" color="text.secondary">
                        {selectedIds.size > 0
                            ? `${selectedIds.size}개 선택됨`
                            : '여러 배지를 선택할 수 있습니다'}
                    </Typography>
                    <Button
                        variant="contained"
                        size="small"
                        disabled={selectedIds.size === 0}
                        onClick={onAddSelected}
                    >
                        {t('common.add_selected')}
                    </Button>
                </Stack>
            )}

            {/* 배지 그리드 */}
            <Box
                sx={{
                    flex: 1,
                    minHeight: 0,
                    overflow: 'auto',
                    position: 'relative',
                }}
            >
                {isFetching && (
                    <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
                        <CircularProgress size={20} />
                    </Box>
                )}
                {!isFetching && filtered.length === 0 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                        <Typography variant="body2" color="text.secondary">
                            {channelScopeNeedsInput && channelQuery === ''
                                ? '채널 이름을 입력하고 검색하세요'
                                : '표시할 배지가 없습니다'}
                        </Typography>
                    </Box>
                )}
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))',
                        gap: 0.75,
                    }}
                >
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
                </Box>
            </Box>
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
    const { globalSetting } = useGlobalSettingContext();
    const adapter = getAdapter(globalSetting.platform);
    const showTypeChip = multiple && selected;

    return (
        <Card
            variant="outlined"
            sx={{
                position: 'relative',
                borderColor: selected ? 'primary.main' : 'divider',
                borderWidth: selected ? 2 : 1,
                transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
                '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: (theme) => theme.palette.mode === 'dark'
                        ? '0 4px 12px rgba(0,0,0,0.5)'
                        : '0 4px 12px rgba(0,0,0,0.1)',
                    borderColor: selected ? 'primary.main' : 'primary.light',
                },
            }}
        >
            <CardActionArea onClick={onClick} sx={{ p: 0.75, height: '100%' }}>
                <Stack alignItems="center" spacing={0.25}>
                    <Box
                        sx={{
                            width: 24,
                            height: 24,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            mb: 0.25,
                        }}
                    >
                        <img
                            src={adapter.getBadgeImageUrl(
                                adapter.getBadgeIdentity(badge.badgeImage.badge_img_url_1x),
                                '2x'
                            )}
                            srcSet={getBadgeSrcSet(adapter, adapter.getBadgeIdentity(badge.badgeImage.badge_img_url_1x))}
                            style={{ maxWidth: '100%', maxHeight: '100%' }}
                            alt={badge.badgeName}
                        />
                    </Box>
                    <Typography
                        variant="caption"
                        sx={{
                            fontWeight: 500,
                            textAlign: 'center',
                            width: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            lineHeight: 1.2,
                        }}
                        title={badge.badgeName}
                    >
                        {badge.badgeName}
                    </Typography>
                    <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                            textAlign: 'center',
                            width: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: '0.65rem',
                            lineHeight: 1.2,
                        }}
                        title={badge.channel}
                    >
                        {badge.channel}
                    </Typography>
                </Stack>
            </CardActionArea>
            {/* 선택 표시 + filterType chip (multi 모드 + 선택됨) */}
            {selected && multiple && (
                <CheckCircleIcon
                    color="primary"
                    fontSize="small"
                    sx={{ position: 'absolute', top: 4, right: 4 }}
                />
            )}
            {showTypeChip && (
                <Box sx={{ display: 'flex', justifyContent: 'center', pb: 0.75 }}>
                    <Chip
                        size="small"
                        label={badge.filterType === 'include' ? '포함' : '제외'}
                        color={chipColor(badge.filterType)}
                        onClick={(e) => { e.stopPropagation(); onTypeRotate(); }}
                        sx={{ cursor: 'pointer' }}
                    />
                </Box>
            )}
        </Card>
    );
}
