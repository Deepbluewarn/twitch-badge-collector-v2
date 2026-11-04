/**
 * 필터 기본(simple) 모드 — 단일 atomic 필터로 composite 그룹 하나 추가.
 * advanced 모드(FilterInputFormList)와 layout 통일:
 *   - 본문: atomic 필터 입력 (카테고리/배지 + 값)
 *   - 액션: 조건(Toggle) → 메모 → 채널 섹션(help 포함) → 초기화, 필터 추가
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
import { ChannelInput, EMPTY_CHANNEL, type ChannelValue } from './ChannelInput';
import { NicknameInput } from './NicknameInput';
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
    const [channel, setChannel] = useState<ChannelValue>(EMPTY_CHANNEL);

    // 폼 전체(카테고리, 내용, 채널)를 비운다. 배지를 고른 뒤 닉네임이나 키워드로 돌아가는 길도 이것뿐이다.
    const resetFilterInput = useCallback(() => {
        props.setFilterInput(defaultAtomicFilter());
        if (filterContentValue.current !== null) filterContentValue.current.value = '';
        setChannel(EMPTY_CHANNEL);
    }, []);

    useEffect(() => {
        resetFilterInput();
    }, [globalSetting.platform]);

    const onFilterNoteChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
        setFilterGroupNote(event.target.value);
    }

    const onConditionChange = (value: FilterType) => {
        props.setFilterInput(l => l ? { ...l, type: value } : l);
    }

    const addFilter = useCallback(() => {
        if (typeof props.filterInput === 'undefined') return;
        // 닉네임 칸은 filterInput에 바로 쓴다. 배지 이름과 키워드 칸만 ref로 읽는다.
        const contentValueRef = filterContentValue.current;
        if (props.filterInput.category === 'badge') {
            if (contentValueRef === null) return;
            props.filterInput.badgeName = contentValueRef.value;
        } else if (props.filterInput.category === 'keyword') {
            if (contentValueRef === null) return;
            props.filterInput.value = contentValueRef.value;
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
            filterChannelId: channel.id,
            filterChannelName: channel.name,
            filterChannelImage: channel.image,
        }]);
        if (added) {
            setFilterGroupNote('');
            props.setFilterInput(defaultAtomicFilter());
            if (contentValueRef) contentValueRef.value = '';
            setChannel(EMPTY_CHANNEL);
            addAlert({ serverity: 'success', message: t('alert.filter_added') });
            props.onAddSuccess?.();
        }
    }, [props.filterInput, filterGroupNote, props.onAddSuccess, channel])

    return (
        <Card className={s.simpleCard}>
            <div className={s.cardContent}>
                <BasicFilterInputForm
                    filterInput={props.filterInput}
                    setFilterInput={props.setFilterInput}
                    filterContentValue={filterContentValue}
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
                    <ChannelInput platform={globalSetting.platform} value={channel} onChange={setChannel} row />
                </div>

                {/* primary CTA, 그 왼쪽에 폼 전체 초기화 */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <Button onClick={resetFilterInput} variant="text">
                        {t('common.reset')}
                    </Button>
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
                // 키워드 칸에 적던 글자는 이어 가고, 고른 사람은 닉네임 조건에만 붙는다
                newL.value = props.filterContentValue.current?.value ?? newL.value;
                delete newL.userId;
                delete newL.userImage;
            } else if (selectorType === 'type') {
                newL.type = newValue as FilterType;
            }
            return newL;
        });
    }

    useEffect(() => {
        if (!props.filterInput) return;
        if (props.filterInput.category === 'badge') {
            props.filterContentValue.current!.value = props.filterInput.badgeName ?? '';
        }
    }, [props.filterInput]);

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
                        <Field label={t('common.value')} className={s.grow}
                            hint={globalSetting.platform === 'chzzk' && props.filterInput?.category === 'name' ? t('user_search.hint') : undefined}>
                            {props.filterInput?.category === 'name' ? (
                                <NicknameInput
                                    platform={globalSetting.platform}
                                    value={props.filterInput}
                                    onChange={v => props.setFilterInput(l => l ? { ...l, ...v } : l)}
                                />
                            ) : (
                                <TextInput
                                    defaultValue={props.filterInput?.value}
                                    ref={props.filterContentValue}
                                />
                            )}
                        </Field>
                    </>
                )
            }
        </div>
    )
}
