/**
 * 필터 고급 모드를 위한 컴포넌트입니다.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button, Card, Divider, Field, Icon, IconButton, TextInput } from '@/ui';
import ChannelIdGuideDialog from './dialog/ChannelIdGuideDialog';
import {
    AtomicFilterElement,
    FilterCategory,
    FilterType
} from "../../interfaces/filter";
import { useFilterGroupContext } from '../../context/FilterGroup';
import { nanoid } from 'nanoid';
import { AdvancedFilterCategorySelector, FilterSelectorType, FilterTypeSegmented, FilterTypeSelector } from './FilterComponents';
import { useGlobalSettingContext } from '../../context/GlobalSetting';
import { getAdapter, getBadgeSrcSet } from '@/platform';
import { useAlertContext } from '@/context/Alert';
import s from './FilterAddDialog.module.css';

export default function FilterInputFormList(
    props: {
        afInputRow: AtomicFilterElement[],
        setAfInputRow: React.Dispatch<React.SetStateAction<AtomicFilterElement[]>>,
        filterInputListRef: React.MutableRefObject<AtomicFilterElement[]>,
        onAddSuccess?: () => void,
    }
) {
    const { globalSetting } = useGlobalSettingContext();
    const { addCompositeFilters } = useFilterGroupContext();
    const { addAlert } = useAlertContext();
    const [filterGroupType, setFilterGroupType] = React.useState<FilterType>('include');
    const [filterGroupNote, setFilterGroupNote] = useState('');
    const [nameFilterAvail, setNameFilterAvail] = React.useState(false);
    const [channelId, setChannelId] = useState('');
    const [channelName, setChannelName] = useState('');
    const [guideOpen, setGuideOpen] = useState(false);

    const { t } = useTranslation();

    const addFilterInputForm = () => {
        props.setAfInputRow(list => {
            return [...list, {
                category: nameFilterAvail ? 'keyword' : 'name',
                id: nanoid(),
                type: 'include',
                value: ''
            }]
        });
    }
    const onFilterTypeChanged = (value: FilterType) => {
        setFilterGroupType(value);
    }
    const onFilterNoteChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
        setFilterGroupNote(event.target.value);
    }
    const addFilter = useCallback(() => {
        const added = addCompositeFilters([{
            filterType: filterGroupType,
            id: nanoid(),
            filterNote: filterGroupNote,
            filters: [...props.filterInputListRef.current],
            platform: globalSetting.platform,
            filterChannelId: channelId,
            filterChannelName: channelName,
        }]);
        if (added) {
            resetFilterGroupInputList();
            setFilterGroupNote('');
            setChannelId('');
            setChannelName('');
            addAlert({ serverity: 'success', message: t('alert.filter_added') });
            props.onAddSuccess?.();
        }
    }, [filterGroupType, filterGroupNote, globalSetting.platform, channelId, channelName, props.onAddSuccess]);

    const resetFilterGroupInputList = () => {
        props.setAfInputRow([]);
    }

    React.useEffect(() => {
        const rows = props.afInputRow;
        
        props.filterInputListRef.current = rows;

        setNameFilterAvail(rows.some(row => row.category === 'name'));
    }, [props.afInputRow]);

    useEffect(() => {
        resetFilterGroupInputList();
    }, [globalSetting.platform]);

    return (
        <Card className={s.advancedCard}>
            <div className={s.cardContent}>
                {
                    props.afInputRow.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
                            {
                                props.afInputRow.map(input => {
                                    return (
                                        <AdvancedFilterInputForm
                                            key={input.id}
                                            value={input}
                                            setInputList={props.setAfInputRow}
                                            afInputListRef={props.filterInputListRef}
                                            nameFilterAvail={nameFilterAvail}
                                        ></AdvancedFilterInputForm>
                                    )
                                })
                            }
                        </div>

                    ) : (
                        <div className={s.empty}>
                            <div className={s.emptyIcon}>
                                <Icon name="filter_list" />
                            </div>
                            <p className={s.emptyTitle}>
                                {t('common.add_filter_elements')}
                            </p>
                            <p className={s.emptyHint}>
                                <Trans i18nKey='setting.filter.empty_hint' components={{ b: <b /> }} />
                            </p>
                        </div>
                    )
                }
            </div>

            <Divider />
            <div className={s.cardActions}>
                {/* 조건(filterType) toggle + "필터 요소 추가" 버튼을 같은 행에 — 같이 폼 영역
                    편집 액션이라 시각적으로 가까이. */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                    <FilterTypeSegmented
                        value={filterGroupType}
                        onChange={onFilterTypeChanged}
                    />
                    <Button
                        onClick={addFilterInputForm}
                        size="sm"
                        icon="add"
                        style={{ marginLeft: 'auto' }}
                    >
                        {t('common.add_filter_element')}
                    </Button>
                </div>

                <Field label={t('common.note_optional')}>
                    <TextInput
                        value={filterGroupNote}
                        onChange={onFilterNoteChanged}
                    />
                </Field>

                {/* 채널 섹션: optional + 모르는 사람 위해 inline help icon */}
                <div>
                    <div className={s.channelLabel}>
                        <span>{t('common.channel_only')}</span>
                        <IconButton
                            icon="help_outline"
                            size="sm"
                            onClick={() => setGuideOpen(true)}
                            label={t('channel_guide.title')}
                        />
                    </div>
                    <div className={s.channelInputs}>
                        <Field label={t('common.channel_id')}>
                            <TextInput
                                value={channelId}
                                onChange={(e) => setChannelId(e.target.value)}
                            />
                        </Field>
                        <Field label={t('common.channel_name')}>
                            <TextInput
                                value={channelName}
                                onChange={(e) => setChannelName(e.target.value)}
                            />
                        </Field>
                    </div>
                </div>

                {/* primary CTA: 우측 하단에 명확하게 */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                        disabled={props.afInputRow.length === 0}
                        onClick={addFilter}
                        variant="primary"
                    >
                        {t('common.add_filter')}
                    </Button>
                </div>
            </div>
            <ChannelIdGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />
        </Card>
    )
}

function AdvancedFilterInputForm(props: {
    value: AtomicFilterElement,
    setInputList: React.Dispatch<React.SetStateAction<AtomicFilterElement[]>>,
    afInputListRef: React.MutableRefObject<AtomicFilterElement[]>,
    nameFilterAvail: boolean
}) {
    const {globalSetting} = useGlobalSettingContext();
    const adapter = getAdapter(globalSetting.platform);
    const { t } = useTranslation();
    const inputChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.value;
        const inputRef = props.afInputListRef.current;
        const newInputRef = inputRef.map(l => {
            if (l.id === props.value.id) {
                if (l.category === 'badge') {
                    l.badgeName = newValue;
                } else {
                    l.value = newValue;
                }
            }
            return l;
        });

        props.afInputListRef.current = newInputRef;
    }

    const selectorChanged = (newValue: FilterCategory | FilterType, selectorType: FilterSelectorType) => {

        props.setInputList(list => {
            return list.map(l => {
                if (l.id === props.value.id) {
                    if (selectorType === 'category') {
                        l.category = newValue as FilterCategory;
                    } else if (selectorType === 'type') {
                        l.type = newValue as FilterType;
                    }
                }
                return l;
            });
        });
    }

    const removeList = (id: string) => {
        props.setInputList(list => list.filter(l => l.id !== id));
    }

    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            {
                props.value.category === 'badge' ? (
                    <>
                        <div className={s.badgeBox} style={{ minWidth: 120 }}>
                            <img
                                style={{ width: '18px', height: '18px' }}
                                src={adapter.getBadgeImageUrl(props.value.value, '1x')}
                                srcSet={getBadgeSrcSet(adapter, props.value.value)}
                            />
                        </div>

                        <Field label={t('common.badge_name')} className={s.grow}>
                            <TextInput
                                defaultValue={props.value.badgeName}
                                onChange={inputChanged}
                            />
                        </Field>
                    </>
                ) : (
                    <>
                        <AdvancedFilterCategorySelector
                            value={props.value.category}
                            onChange={(v) => selectorChanged(v, 'category')}
                            nameFilterAvail={props.nameFilterAvail}
                        />

                        <Field label={t('common.value')} className={s.grow}>
                            <TextInput
                                defaultValue={props.value.value}
                                onChange={inputChanged}
                            />
                        </Field>
                    </>
                )
            }

            <FilterTypeSelector
                value={props.value.type}
                onChange={(v) => selectorChanged(v, 'type')}
            />

            <Button variant="text" onClick={() => removeList(props.value.id)}>{t('common.remove')}</Button>
        </div>
    )
}
