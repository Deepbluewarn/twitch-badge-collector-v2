import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Button from '@mui/material/Button';
import CustomTextField from '@/components/TextField/CustomTextField';
import { useTranslation } from 'react-i18next';
import { FilterCategory, AtomicFilterElement, CompositeFilterElement, FilterType } from '@/interfaces/filter';
import { Box, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Typography } from '@mui/material';
import BadgeList from './BadgeList';
import { useGlobalSettingContext } from '../../context/GlobalSetting';
import { defaultAtomicFilter } from '@/utils/utils-common';
import { getAdapter, getBadgeSrcSet } from '@/platform';

// 모달 타입 정의
export type DialogType = 'filter' | 'channel' | 'note' | null;
export type DialogMode = 'edit' | 'add' | null;

interface FilterDialogProps {
    open: boolean;
    onClose: () => void;
    type: DialogType;
    selectedFilterList?: CompositeFilterElement;
    filterId?: string; // type === 'filter' 일때 ArrayFilter 내 Filter 특정하기 위함. 
    mode?: DialogMode;
    onSave: (type: DialogType, updatedData: CompositeFilterElement | undefined) => void;
}

// 하위 필터 배열을 건드릴 필요 없는 타입을 상수 배열로 관리
const NON_SUBFILTER_TYPES: DialogType[] = ['channel', 'note'];

export default function FilterDialog(props: FilterDialogProps) {
    const {
        open,
        onClose,
        type,
        selectedFilterList,
        filterId,
        mode = 'edit',
        onSave
    } = props;
    const { globalSetting } = useGlobalSettingContext();
    const adapter = getAdapter(globalSetting.platform);
    const { t } = useTranslation();

    // 새 필터 추가를 위한 기본 필터 객체 생성
    const _defaultAtomicFilter = defaultAtomicFilter();
    // 편집 중인 데이터 상태
    const [filterGroupList, setFilterGroupList] = React.useState<CompositeFilterElement | undefined>(selectedFilterList);
    const [filterGroup, setFilterGroup] = React.useState<AtomicFilterElement | undefined>();

    // 모달이 열릴 때마다 편집 데이터 초기화
    React.useEffect(() => {
        if (mode === 'edit') {
            setFilterGroupList(selectedFilterList);
            setFilterGroup(type === 'filter' ? selectedFilterList?.filters.find(f => f.id === filterId) : undefined);
        } else if (mode === 'add') {
            setFilterGroupList(selectedFilterList);
            setFilterGroup(type === 'filter' ? _defaultAtomicFilter : undefined);
        }
    }, [selectedFilterList, filterId, type, mode]);

    // 저장 핸들러
    const handleSave = (_filterGroupList?: CompositeFilterElement) => {
        let saveData: CompositeFilterElement | undefined = _filterGroupList ?? filterGroupList;

        if (mode === 'add' && filterGroup && filterGroupList && !NON_SUBFILTER_TYPES.includes(type)) {
            const _afList: CompositeFilterElement = { ...filterGroupList };
            _afList.filters = [..._afList.filters, filterGroup];
            saveData = _afList;
        }
        onSave(type, saveData);
        onClose();
    };


    // 상위 필터(리스트) 속성 변경
    const handleListObjectChange = (updates: Partial<CompositeFilterElement>) => {
        setFilterGroupList(afList => {
            if (!afList) return afList;
            return {
                ...afList,
                ...updates
            };
        });
    };

    // 하위 필터(필터) 속성 변경
    const handleFilterObjectChange = (updates: Partial<AtomicFilterElement>, filterId: string) => {
        setFilterGroupList(afList => {
            if (!afList) return afList;
            return {
                ...afList,
                filters: afList.filters.map(filter =>
                    filter.id === filterId
                        ? { ...filter, ...updates }
                        : filter
                )
            };
        });

        setFilterGroup(current =>
            current ? { ...current, ...updates } : current
        );
    };

    // 타입에 따른 다이얼로그 타이틀
    const getDialogTitle = () => {
        switch (type) {
            case 'filter': return t(mode === 'add' ? 'filter_dialog.add_filter' : 'filter_dialog.edit_filter');
            case 'channel': return t(mode === 'add' ? 'filter_dialog.add_channel' : 'filter_dialog.edit_channel');
            case 'note': return t(mode === 'add' ? 'filter_dialog.add_note' : 'filter_dialog.edit_note');
            default: return t('common.edit');
        }
    };

    // 각 타입별 컨텐츠 렌더링
    const renderContent = () => {
        switch (type) {
            case 'filter':
                return renderFilterContent();
            case 'channel':
                return renderChannelContent();
            case 'note':
                return renderNoteContent();
            default:
                return <div>{t('filter_dialog.nothing_selected')}</div>;
        }
    };

    // 필터 수정/추가 폼
    const renderFilterContent = () => {
        if (!filterGroup) return null;

        const BadgeImage = () => {
            if (!filterGroup.value && filterGroup.category === 'badge') {
                return (
                    <Paper
                        variant="outlined"
                        sx={{
                            minWidth: 120,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >

                    </Paper>
                );
            }

            return filterGroup.category === 'badge' ? (
                <Paper
                    variant="outlined"
                    sx={{
                        minWidth: 120,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center'
                    }}
                >

                    <img
                        style={{ width: '18px', height: '18px' }}
                        src={adapter.getBadgeImageUrl(filterGroup.value, '1x')}
                        srcSet={getBadgeSrcSet(adapter, filterGroup.value)}
                    />

                </Paper>
            ) : null
        }

        return (
            <Stack spacing={2}>
                <FormControl>
                    <InputLabel id="filter-category-label">{t('common.category')}</InputLabel>
                    <Select
                        labelId="filter-category-label"
                        value={filterGroup.category || ''}
                        label={t('common.category')}
                        size='small'
                        onChange={(e) => {
                            setFilterGroup(filter => {
                                if (!filter) return filter;
                                return {
                                    ...defaultAtomicFilter(filter.id, filter.category, filter.type),
                                }
                            });
                            handleFilterObjectChange({ category: e.target.value as FilterCategory }, filterId!);
                        }}
                    >
                        <MenuItem value="name">{t('common.nickname')}</MenuItem>
                        <MenuItem value="keyword">{t('common.keyword')}</MenuItem>
                        <MenuItem value="badge">{t('common.badge')}</MenuItem>
                    </Select>
                </FormControl>
                <Stack spacing={2} direction={'row'}>
                    <BadgeImage />
                    {
                        filterGroup.category === 'badge' ? (
                            <CustomTextField
                                label={t('common.badge_name')}
                                value={filterGroup.badgeName || ''}
                                onChange={e => {
                                    handleFilterObjectChange({ badgeName: e.target.value }, filterId!);
                                }}
                                fullWidth
                            />
                        ) : (
                            <CustomTextField
                                label={t('common.content')}
                                value={filterGroup.value || ''}
                                onChange={e => {
                                    handleFilterObjectChange({ value: e.target.value }, filterId!);
                                }}
                                fullWidth
                            />
                        )
                    }

                    {/* 필터 조건 선택 추가 */}
                    <FormControl>
                        <InputLabel id="filter-type-label">{t('common.condition')}</InputLabel>
                        <Select
                            labelId="filter-type-label"
                            value={filterGroup.type || 'include'}
                            label={t('common.condition')}
                            size="small"
                            onChange={(e) => {
                                handleFilterObjectChange({ type: e.target.value as FilterType }, filterId!);
                            }}
                        >
                            <MenuItem value="include">{t('filter.category.include')}</MenuItem>
                            <MenuItem value="exclude">{t('filter.category.exclude')}</MenuItem>
                            <MenuItem value="sleep">{t('filter.category.sleep')}</MenuItem>
                        </Select>
                    </FormControl>
                </Stack>

                {filterGroup.category === 'badge' && (
                    <Box sx={{ height: 420, display: 'flex', flexDirection: 'column' }}>
                        <BadgeList
                            onBadgeSelect={(selectedBadge) => {
                                const badgeUUID = adapter.getBadgeIdentity(selectedBadge.badgeImage.badge_img_url_1x);

                                const _badgeFilter: AtomicFilterElement = {
                                    badgeName: selectedBadge.badgeName,
                                    category: 'badge',
                                    id: selectedBadge.id,
                                    type: selectedBadge.filterType,
                                    value: badgeUUID,
                                }
                                handleFilterObjectChange(_badgeFilter, filterId!);
                            }}
                        />
                    </Box>
                )}
            </Stack>
        );
    };

    // 채널 수정 폼
    const renderChannelContent = () => {
        if (!filterGroupList) return;

        return (
            <Stack spacing={2}>
                <CustomTextField
                    label={t('common.channel_name')}
                    value={filterGroupList.filterChannelName || ''}
                    onChange={e => {
                        handleListObjectChange({ filterChannelName: e.target.value });
                    }}
                    fullWidth
                />
                <CustomTextField
                    label={t('common.channel_id')}
                    value={filterGroupList.filterChannelId || ''}
                    onChange={e => {
                        handleListObjectChange({ filterChannelId: e.target.value });
                    }}
                    fullWidth
                />
            </Stack>
        );
    };

    // 비고 수정 폼
    const renderNoteContent = () => {
        if (!filterGroupList) return;

        return (
            <CustomTextField
                label={t('common.note')}
                value={filterGroupList.filterNote || ''}
                onChange={e => {
                    handleListObjectChange({ filterNote: e.target.value });
                }}
                fullWidth
                multiline
                rows={4}
            />
        );
    };

    return (
        <>
            <Dialog
                open={open}
                onClose={onClose}
                fullWidth={false}
                maxWidth="lg"
            >
                <DialogTitle>{getDialogTitle()}</DialogTitle>
                <DialogContent>
                    <Box sx={{ p: 1 }}>
                        {renderContent()}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>{t('common.cancel')}</Button>
                    <Button onClick={() => handleSave()} color="primary">
                        {
                            mode === 'edit' ? t('common.save') : t('common.add')
                        }
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}