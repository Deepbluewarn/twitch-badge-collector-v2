import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Button from '@mui/material/Button';
import CustomTextField from '@components/TextField/CustomTextField';
import { useTranslation } from 'react-i18next';
import { ArrayFilterCategory, ArrayFilterInterface, ArrayFilterListInterface, FilterType } from '@interfaces/filter';
import { FormControl, InputLabel, MenuItem, Paper, Select, Stack, Typography } from '@mui/material';
import BadgeList from './BadgeList';
import { useGlobalSettingContext } from '../../context/GlobalSetting';
import { getDefaultArrayFilter } from '@utils/utils-common';

// 모달 타입 정의
export type DialogType = 'filter' | 'channel' | 'note' | null;
export type DialogMode = 'edit' | 'add' | null;

interface FilterDialogProps {
    open: boolean;
    onClose: () => void;
    type: DialogType;
    selectedFilterList?: ArrayFilterListInterface;
    filterId?: string; // type === 'filter' 일때 ArrayFilter 내 Filter 특정하기 위함. 
    mode?: DialogMode;
    onSave: (type: DialogType, updatedData: ArrayFilterListInterface | undefined) => void;
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
    const { t } = useTranslation();

    // 새 필터 추가를 위한 기본 필터 객체 생성
    const _defaultArrayFilter = getDefaultArrayFilter();
    // 편집 중인 데이터 상태
    const [arrayFilterList, setArrayFilterList] = React.useState<ArrayFilterListInterface | undefined>(selectedFilterList);
    const [arrayFilter, setArrayFilter] = React.useState<ArrayFilterInterface | undefined>();

    // 모달이 열릴 때마다 편집 데이터 초기화
    React.useEffect(() => {
        if (mode === 'edit') {
            setArrayFilterList(selectedFilterList);
            setArrayFilter(type === 'filter' ? selectedFilterList?.filters.find(f => f.id === filterId) : undefined);
        } else if (mode === 'add') {
            setArrayFilterList(selectedFilterList);
            setArrayFilter(type === 'filter' ? _defaultArrayFilter : undefined);
        }
    }, [selectedFilterList, filterId, type, mode]);

    // 저장 핸들러
    const handleSave = (_arrayFilterList?: ArrayFilterListInterface) => {
        let saveData: ArrayFilterListInterface | undefined = _arrayFilterList ?? arrayFilterList;

        if (mode === 'add' && arrayFilter && arrayFilterList && !NON_SUBFILTER_TYPES.includes(type)) {
            const _afList: ArrayFilterListInterface = { ...arrayFilterList };
            _afList.filters = [..._afList.filters, arrayFilter];
            saveData = _afList;
        }
        onSave(type, saveData);
        onClose();
    };


    // 상위 필터(리스트) 속성 변경
    const handleListObjectChange = (updates: Partial<ArrayFilterListInterface>) => {
        setArrayFilterList(afList => {
            if (!afList) return afList;
            return {
                ...afList,
                ...updates
            };
        });
    };

    // 하위 필터(필터) 속성 변경
    const handleFilterObjectChange = (updates: Partial<ArrayFilterInterface>, filterId: string) => {
        setArrayFilterList(afList => {
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

        setArrayFilter(current =>
            current ? { ...current, ...updates } : current
        );
    };

    // 타입에 따른 다이얼로그 타이틀
    const getDialogTitle = () => {
        const modeTitle = mode === 'add' ? '추가' : '수정';

        switch (type) {
            case 'filter': return t(`필터 ${modeTitle}`);
            case 'channel': return t(`채널 ${modeTitle}`);
            case 'note': return t(`비고 ${modeTitle}`);
            default: return t('수정');
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
                return <div>{t('선택된 항목이 없습니다.')}</div>;
        }
    };

    // 필터 수정/추가 폼
    const renderFilterContent = () => {
        if (!arrayFilter) return null;

        const BadgeImage = () => {
            if (!arrayFilter.value && arrayFilter.category === 'badge') {
                return <Typography>배지 선택</Typography>
            }

            return arrayFilter.category === 'badge' ? (
                <Paper
                    variant="outlined"
                    sx={{
                        minWidth: 120,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center'
                    }}
                >

                    {
                        globalSetting.platform === 'twitch' ? (
                            <img
                                style={{ width: '18px', height: '18px' }}
                                src={`https://static-cdn.jtvnw.net/badges/v1/${arrayFilter.value}/1`}
                                srcSet={
                                    `https://static-cdn.jtvnw.net/badges/v1/${arrayFilter.value}/1 1x, 
                            https://static-cdn.jtvnw.net/badges/v1/${arrayFilter.value}/2 2x, 
                            https://static-cdn.jtvnw.net/badges/v1/${arrayFilter.value}/3 4x`}
                            />
                        ) : (
                            <img
                                style={{ width: '18px', height: '18px' }}
                                src={arrayFilter.value}
                            />
                        )
                    }

                </Paper>
            ) : null
        }

        return (
            <Stack spacing={2}>
                <FormControl>
                    <InputLabel id="filter-category-label">{'카테고리'}</InputLabel>
                    <Select
                        labelId="filter-category-label"
                        value={arrayFilter.category || ''}
                        label={'카테고리'}
                        onChange={(e) => {
                            setArrayFilter(filter => {
                                if (!filter) return filter;
                                return {
                                    ...getDefaultArrayFilter(filter.id, filter.category, filter.type),
                                }
                            });
                            handleFilterObjectChange({ category: e.target.value as ArrayFilterCategory }, filterId!);
                        }}
                    >
                        <MenuItem value="name">{'닉네임'}</MenuItem>
                        <MenuItem value="keyword">{'키워드'}</MenuItem>
                        <MenuItem value="badge">{'배지'}</MenuItem>
                    </Select>
                </FormControl>
                <Stack spacing={2} direction={'row'}>
                    <BadgeImage />
                    {
                        arrayFilter.category === 'badge' ? (
                            <CustomTextField
                                label={'배지 이름'}
                                value={arrayFilter.badgeName || ''}
                                onChange={e => {
                                    handleFilterObjectChange({ badgeName: e.target.value }, filterId!);
                                }}
                                fullWidth
                            />
                        ) : (
                            <CustomTextField
                                label={'내용'}
                                value={arrayFilter.value || ''}
                                onChange={e => {
                                    handleFilterObjectChange({ value: e.target.value }, filterId!);
                                }}
                                fullWidth
                            />
                        )
                    }

                    {/* 필터 조건 선택 추가 */}
                    <FormControl>
                        <InputLabel id="filter-type-label">{'조건'}</InputLabel>
                        <Select
                            labelId="filter-type-label"
                            value={arrayFilter.type || 'include'}
                            label={'조건'}
                            onChange={(e) => {
                                handleFilterObjectChange({ type: e.target.value as FilterType }, filterId!);
                            }}
                        >
                            <MenuItem value="include">{'포함'}</MenuItem>
                            <MenuItem value="exclude">{'제외'}</MenuItem>
                            <MenuItem value="sleep">{'꺼짐'}</MenuItem>
                        </Select>
                    </FormControl>
                </Stack>

                {arrayFilter.category === 'badge' && (
                    <BadgeList
                        onBadgeSelect={(selectedBadge) => {
                            const _badgeFilter: ArrayFilterInterface = {
                                badgeName: selectedBadge.badgeName,
                                category: 'badge',
                                id: selectedBadge.id,
                                type: selectedBadge.filterType,
                                value: selectedBadge.badgeImage.badge_img_url_1x,
                            }
                            handleFilterObjectChange(_badgeFilter, filterId!);
                        }}
                    />
                )}
            </Stack>
        );
    };

    // 채널 수정 폼
    const renderChannelContent = () => {
        if (!arrayFilterList) return;

        return (
            <Stack spacing={2}>
                <CustomTextField
                    label={t('channel.name')}
                    value={arrayFilterList.filterChannelName || ''}
                    onChange={e => {
                        handleListObjectChange({ filterChannelName: e.target.value });
                    }}
                    fullWidth
                />
                <CustomTextField
                    label={t('channel.id')}
                    value={arrayFilterList.filterChannelId || ''}
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
        if (!arrayFilterList) return;

        return (
            <CustomTextField
                label={'비고'}
                value={arrayFilterList.filterNote || ''}
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
                fullWidth
                maxWidth="lg"
            >
                <DialogTitle>{getDialogTitle()}</DialogTitle>
                <DialogContent>
                    {renderContent()}
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>{t('common.cancel')}</Button>
                    <Button onClick={() => handleSave()} color="primary">
                        {
                            mode === 'edit' ? t('common.save') : t('추가')
                        }
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}