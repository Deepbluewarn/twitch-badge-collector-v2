import React from 'react';
import { useTranslation } from 'react-i18next';
import { FilterCategory, AtomicFilterElement, CompositeFilterElement, FilterType } from '@/interfaces/filter';
import { Button, Card, Dialog, Field, Select, Stack, TextArea, TextInput } from '@/ui';
import BadgeList from './BadgeList';
import { useGlobalSettingContext } from '../../context/GlobalSetting';
import { defaultAtomicFilter } from '@/utils/utils-common';
import { getAdapter, getBadgeSrcSet } from '@/platform';

/** 채널 주소를 붙여 넣으면 채널 ID만 뽑는다. 주소가 아니면 그대로. */
export function extractChannelId(input: string, platform: string): string {
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
            if (filterGroup.category !== 'badge') return null;
            return (
                <Card style={{ minWidth: 120, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {filterGroup.value && (
                        <img
                            style={{ width: '18px', height: '18px' }}
                            src={adapter.getBadgeImageUrl(filterGroup.value, '1x')}
                            srcSet={getBadgeSrcSet(adapter, filterGroup.value)}
                        />
                    )}
                </Card>
            );
        };

        return (
            <Stack gap={16}>
                <Field label={t('common.category')}>
                    <Select<FilterCategory>
                        value={filterGroup.category}
                        onChange={(category) => {
                            setFilterGroup(filter => {
                                if (!filter) return filter;
                                return {
                                    ...defaultAtomicFilter(filter.id, filter.category, filter.type),
                                }
                            });
                            handleFilterObjectChange({ category }, filterId!);
                        }}
                        options={[
                            { value: 'name', label: t('common.nickname') },
                            { value: 'keyword', label: t('common.keyword') },
                            { value: 'badge', label: t('common.badge') },
                        ]}
                    />
                </Field>
                <Stack dir="row" gap={16} align="flex-end">
                    <BadgeImage />
                    {
                        filterGroup.category === 'badge' ? (
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <Field label={t('common.badge_name')}>
                                    <TextInput
                                        value={filterGroup.badgeName || ''}
                                        onChange={e => {
                                            handleFilterObjectChange({ badgeName: e.target.value }, filterId!);
                                        }}
                                    />
                                </Field>
                            </div>
                        ) : (
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <Field label={t('common.content')}>
                                    <TextInput
                                        value={filterGroup.value || ''}
                                        onChange={e => {
                                            handleFilterObjectChange({ value: e.target.value }, filterId!);
                                        }}
                                    />
                                </Field>
                            </div>
                        )
                    }

                    {/* 필터 조건 선택 추가 */}
                    <Field label={t('common.condition')}>
                        <Select<FilterType>
                            value={filterGroup.type || 'include'}
                            onChange={(type) => {
                                handleFilterObjectChange({ type }, filterId!);
                            }}
                            options={[
                                { value: 'include', label: t('filter.category.include') },
                                { value: 'exclude', label: t('filter.category.exclude') },
                                { value: 'sleep', label: t('filter.category.sleep') },
                            ]}
                        />
                    </Field>
                </Stack>

                {filterGroup.category === 'badge' && (
                    <div style={{ height: 420, display: 'flex', flexDirection: 'column' }}>
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
                    </div>
                )}
            </Stack>
        );
    };

    // 채널 수정 폼
    const renderChannelContent = () => {
        if (!filterGroupList) return;

        return (
            <Stack gap={16}>
                <Field label={t('common.channel_id')}>
                    <TextInput
                        value={filterGroupList.filterChannelId || ''}
                        onChange={e => {
                            handleListObjectChange({ filterChannelId: extractChannelId(e.target.value, globalSetting.platform) });
                        }}
                    />
                </Field>
                <Field label={t('common.channel_name')}>
                    <TextInput
                        value={filterGroupList.filterChannelName || ''}
                        onChange={e => {
                            handleListObjectChange({ filterChannelName: e.target.value });
                        }}
                    />
                </Field>
            </Stack>
        );
    };

    // 비고 수정 폼
    const renderNoteContent = () => {
        if (!filterGroupList) return;

        return (
            <Field label={t('common.note')}>
                <TextArea
                    value={filterGroupList.filterNote || ''}
                    onChange={e => {
                        handleListObjectChange({ filterNote: e.target.value });
                    }}
                    rows={4}
                />
            </Field>
        );
    };

    const saveDisabled = type === 'channel' && !filterGroupList?.filterChannelId?.trim();

    return (
        <Dialog
            open={open}
            onClose={onClose}
            title={getDialogTitle()}
            width={type === 'filter' ? 'lg' : 'xs'}
            actions={<>
                <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
                <Button variant="primary" disabled={saveDisabled} onClick={() => handleSave()}>
                    {
                        mode === 'edit' ? t('common.save') : t('common.add')
                    }
                </Button>
            </>}
        >
            {renderContent()}
        </Dialog>
    );
}
