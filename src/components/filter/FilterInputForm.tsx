/**
 * 필터 기본(simple) 모드 — 단일 atomic 필터로 composite 그룹 하나 추가.
 * advanced 모드(FilterInputFormList)와 layout 통일:
 *   - 본문: atomic 필터 입력 (카테고리/배지 + 값 + 초기화)
 *   - 액션: 조건(Toggle) → 메모 → 채널 섹션(help 포함) → 필터 추가
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Divider, Field, IconButton, TextInput } from '@/ui';
import {
    AtomicFilterElement,
    FilterCategory,
    FilterType
} from "../../interfaces/filter";
import { useFilterGroupContext } from '../../context/FilterGroup';
import { nanoid } from 'nanoid';
import { FilterSelectorType, FilterCategorySelector, FilterTypeSegmented } from './FilterComponents';
import { useGlobalSettingContext } from '../../context/GlobalSetting';
import { defaultAtomicFilter } from '@/utils/utils-common';
import { getAdapter, getBadgeSrcSet } from '@/platform';
import ChannelIdGuideDialog from './dialog/ChannelIdGuideDialog';
import { useAlertContext } from '@/context/Alert';
import s from './FilterAddDialog.module.css';

export default function FilterInputForm(
    props: {
        filterInput: AtomicFilterElement | undefined,
        setFilterInput: React.Dispatch<React.SetStateAction<AtomicFilterElement | undefined>>,
        onAddSuccess?: () => void,
    }
) {
    const { t } = useTranslation();
    const { globalSetting } = useGlobalSettingContext();
    const { addCompositeFilters } = useFilterGroupContext();
    const { addAlert } = useAlertContext();
    const [filterGroupNote, setFilterGroupNote] = useState('');
    const [guideOpen, setGuideOpen] = useState(false);
    const filterContentValue = useRef<HTMLInputElement>(null);
    const channelValue = useRef<HTMLInputElement>(null);
    const channelName = useRef<HTMLInputElement>(null);

    const onFilterNoteChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
        setFilterGroupNote(event.target.value);
    }

    const onConditionChange = (value: FilterType) => {
        props.setFilterInput(l => l ? { ...l, type: value } : l);
    }

    const addFilter = useCallback(() => {
        if (typeof props.filterInput === 'undefined') return;
        if (filterContentValue.current === null) return;
        if (channelValue.current === null || channelName.current === null) return;

        const contentValueRef = filterContentValue.current;
        const _contentValue = contentValueRef.value;

        const channelValueRef = channelValue.current;
        const _channelValue = channelValueRef.value;

        const channelNameRef = channelName.current;
        const _channelName = channelNameRef.value;

        if (props.filterInput.category === 'badge') {
            props.filterInput.badgeName = _contentValue;
        } else {
            props.filterInput.value = _contentValue;
        }

        // 기본 모드에서 atomic 필터 type은 include로 고정. 사용자가 고른 type은 composite filterType.
        const filterType = props.filterInput.type;
        props.filterInput.type = 'include';

        const added = addCompositeFilters([{
            filterType: filterType,
            id: nanoid(),
            filterNote: filterGroupNote,
            filters: [props.filterInput],
            platform: globalSetting.platform,
            filterChannelId: _channelValue,
            filterChannelName: _channelName,
        }]);
        if (added) {
            setFilterGroupNote('');
            props.setFilterInput(defaultAtomicFilter());
            contentValueRef.value = '';
            channelValue.current.value = '';
            channelName.current.value = '';
            addAlert({ serverity: 'success', message: t('alert.filter_added') });
            props.onAddSuccess?.();
        }
    }, [props.filterInput, filterGroupNote, props.onAddSuccess])

    return (
        <Card className={s.simpleCard}>
            <div className={s.cardContent}>
                <BasicFilterInputForm
                    filterInput={props.filterInput}
                    setFilterInput={props.setFilterInput}
                    filterContentValue={filterContentValue}
                    channelValue={channelValue}
                    channelName={channelName}
                />
            </div>

            <Divider />

            <div className={s.cardActions}>
                {/* 조건 (filterType) — segmented toggle */}
                <FilterTypeSegmented
                    value={props.filterInput?.type ?? 'include'}
                    onChange={onConditionChange}
                />

                {/* 메모 (선택) */}
                <Field label={t('common.note_optional')}>
                    <TextInput
                        value={filterGroupNote}
                        onChange={onFilterNoteChanged}
                    />
                </Field>

                {/* 채널 섹션 — header에 help icon */}
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
                                defaultValue={props.filterInput?.filterChannelId}
                                ref={channelValue}
                            />
                        </Field>
                        <Field label={t('common.channel_name')}>
                            <TextInput
                                defaultValue={props.filterInput?.filterChannelName}
                                ref={channelName}
                            />
                        </Field>
                    </div>
                </div>

                {/* primary CTA */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button onClick={addFilter} variant="primary">
                        {t('common.add_filter')}
                    </Button>
                </div>
            </div>

            <ChannelIdGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />
        </Card>
    )
}

function BasicFilterInputForm(
    props: {
        filterInput: AtomicFilterElement | undefined,
        setFilterInput: React.Dispatch<React.SetStateAction<AtomicFilterElement | undefined>>,
        filterContentValue: React.RefObject<HTMLInputElement | null>,
        channelValue: React.RefObject<HTMLInputElement | null>,
        channelName: React.RefObject<HTMLInputElement | null>,
    }
) {
    const { globalSetting } = useGlobalSettingContext();
    const adapter = getAdapter(globalSetting.platform);
    const { t } = useTranslation();

    const selectorChanged = (newValue: FilterCategory | FilterType, selectorType: FilterSelectorType) => {

        props.setFilterInput(l => {
            if (!l) return l;
            const newL = { ...l };
            if (selectorType === 'category') {
                newL.category = newValue as FilterCategory;
            } else if (selectorType === 'type') {
                newL.type = newValue as FilterType;
            }
            return newL;
        });
    }

    const resetFilterInput = useCallback(() => {
        props.setFilterInput(defaultAtomicFilter());

        const filterContentRef = props.filterContentValue.current;
        const channelValueRef = props.channelValue.current;
        const channelNameRef = props.channelName.current;

        if (filterContentRef !== null) filterContentRef.value = '';
        if (channelValueRef !== null) channelValueRef.value = '';
        if (channelNameRef !== null) channelNameRef.value = '';
    }, []);

    useEffect(() => {
        if (!props.filterInput) return;
        if (props.filterInput.category === 'badge') {
            props.filterContentValue.current!.value = props.filterInput.badgeName ?? '';
        }
    }, [props.filterInput]);

    useEffect(() => {
        resetFilterInput();
    }, [globalSetting.platform])

    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            {
                props.filterInput && props.filterInput.category === 'badge' ? (
                    <>
                        <div className={s.badgeBox}>
                            <img
                                style={{ width: '20px', height: '20px' }}
                                src={adapter.getBadgeImageUrl(props.filterInput.value, '1x')}
                                srcSet={getBadgeSrcSet(adapter, props.filterInput.value)}
                            />
                        </div>
                        <Field label={t('common.badge_name')} className={s.grow}>
                            <TextInput
                                defaultValue={props.filterInput.badgeName}
                                ref={props.filterContentValue}
                            />
                        </Field>
                    </>
                ) : (
                    <>
                        <FilterCategorySelector
                            value={props.filterInput?.category ?? 'name'}
                            onChange={(v) => selectorChanged(v, 'category')}
                        />
                        <Field label={t('common.value')} className={s.grow}>
                            <TextInput
                                defaultValue={props.filterInput?.value}
                                ref={props.filterContentValue}
                            />
                        </Field>
                    </>
                )
            }
            <IconButton
                icon="restart_alt"
                onClick={resetFilterInput}
                label={t('common.reset')}
                style={{ flexShrink: 0 }}
            />
        </div>
    )
}
