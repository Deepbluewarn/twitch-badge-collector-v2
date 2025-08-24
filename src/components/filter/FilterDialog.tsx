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
import SubFilter from './SubFilter';

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

export default function FilterEditDialog(props: FilterDialogProps) {
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
            setArrayFilter(selectedFilterList?.filters.find(f => f.id === filterId));
        } else if (mode === 'add') {
            setArrayFilterList(selectedFilterList);
            setArrayFilter(_defaultArrayFilter);
        }
        
    }, [selectedFilterList, filterId]);

    // 저장 핸들러
    const handleSave = (_arrayFilterList?: ArrayFilterListInterface) => {
        if (mode === 'add' && arrayFilter && arrayFilterList) {
            const _afList: ArrayFilterListInterface = { ...arrayFilterList };

            _afList.filters = [..._afList.filters, arrayFilter];
            onSave(type, _afList);
        } else {
            onSave(type, _arrayFilterList ?? arrayFilterList);
        }
        
        onClose();
    };

    const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

    const handleDeleteClick = () => {
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = () => {
        if (!arrayFilterList) return;

        const _filters = arrayFilterList.filters.filter(f => f.id !== filterId);

        arrayFilterList.filters = _filters;

        setDeleteDialogOpen(false);
        handleSave(arrayFilterList);
    };

    // 삭제 취소
    const handleDeleteCancel = () => {
        setDeleteDialogOpen(false);
    };

    /**
     * 객체 업데이트 핸들러 - 여러 필드 또는 객체 전체 변경
     * @param updates 업데이트할 속성들이 포함된 객체
     * @param filterId 필터 ID (필터 수정 시)
     */
    const handleObjectChange = (updates: Partial<ArrayFilterInterface>, filterId?: string) => {
        setArrayFilterList(afList => {
            if (!afList) return afList;

            // 최상위 속성 변경인 경우
            if (!filterId && mode === 'edit') {
                return {
                    ...afList,
                    ...updates
                };
            }

            // 내부 필터 변경인 경우
            return {
                ...afList,
                filters: afList.filters.map(filter =>
                    filter.id === filterId
                        ? { ...filter, ...updates }
                        : filter
                )
            };
        });

        // 현재 선택된 필터 상태도 업데이트 (UI 즉시 반영)
        setArrayFilter(current =>
            current ? { ...current, ...updates } : current
        );
    };

    // 타입에 따른 다이얼로그 타이틀
    const getDialogTitle = () => {
        if (mode === 'add') {
            return t('하위 필터 추가');
        }
        switch (type) {
            case 'filter': return t('필터 수정');
            case 'channel': return t('채널 수정');
            case 'note': return t('비고 수정');
            default: return t('수정');
        }
    };

    // 각 타입별 컨텐츠 렌더링
    const renderContent = () => {
        // if (mode === 'add') {
        //     return renderAddSubFilter();
        // }
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

    // 하위 필터 추가 폼
    const renderAddSubFilter = () => {
        return (
            <>

            </>
        )
    }

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
                            handleObjectChange({ category: e.target.value as ArrayFilterCategory }, filterId);
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
                                    handleObjectChange({ badgeName: e.target.value }, filterId);
                                }}
                                fullWidth
                            />
                        ) : (
                            <CustomTextField
                                label={'내용'}
                                value={arrayFilter.value || ''}
                                onChange={e => {
                                    handleObjectChange({ value: e.target.value }, filterId);
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
                                handleObjectChange({ type: e.target.value as FilterType }, filterId);
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
                            handleObjectChange(_badgeFilter, filterId);
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
                        handleObjectChange({ filterChannelName: e.target.value });
                    }}

                    fullWidth
                />
                <CustomTextField
                    label={t('channel.id')}
                    value={arrayFilterList.filterChannelId || ''}
                    onChange={e => {
                        handleObjectChange({ filterChannelId: e.target.value });
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
                    handleObjectChange({ filterNote: e.target.value });
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
                    {
                        mode === 'edit' ? (
                            <Button color={'warning'} onClick={handleDeleteClick}>필터 삭제</Button>
                        ) : null
                    }

                    <Button onClick={onClose}>{t('common.cancel')}</Button>
                    <Button onClick={() => handleSave()} color="primary">
                        {
                            mode === 'edit' ? t('common.save') : t('추가')
                        }
                    </Button>
                </DialogActions>
            </Dialog>
            {/* 삭제 확인 다이얼로그 */}
            <Dialog
                open={deleteDialogOpen}
                onClose={handleDeleteCancel}
                fullWidth
            >
                <DialogTitle>
                    필터를 정말 삭제할까요?
                    <SubFilter filter={selectedFilterList?.filters.find(f => f.id === filterId)} />
                </DialogTitle>
                <DialogActions>
                    <Button onClick={handleDeleteCancel}>취소</Button>
                    <Button color="error" onClick={handleDeleteConfirm}>확인</Button>
                </DialogActions>
            </Dialog>
        </>
    );
}