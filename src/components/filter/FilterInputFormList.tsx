/**
 * 필터 고급 모드를 위한 컴포넌트입니다.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import { SelectChangeEvent } from '@mui/material/Select';
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Paper from '@mui/material/Paper';
import {
    AtomicFilterElement,
    FilterCategory,
    FilterType
} from "../../interfaces/filter";
import { useFilterGroupContext } from '../../context/ArrayFilter';
import { nanoid } from 'nanoid';
import { AdvancedFilterCategorySelector, FilterSelectorType, FilterTypeSelector } from './ArrayFilterComponents';
import Divider from '@mui/material/Divider';
import CustomTextField from '../TextField/CustomTextField';
import { useGlobalSettingContext } from '../../context/GlobalSetting';

export default function FilterInputFormList(
    props: {
        afInputRow: AtomicFilterElement[],
        setAfInputRow: React.Dispatch<React.SetStateAction<AtomicFilterElement[]>>,
        filterInputListRef: React.MutableRefObject<AtomicFilterElement[]>
    }
) {
    const { globalSetting } = useGlobalSettingContext();
    const { addCompositeFilters } = useFilterGroupContext();
    const [filterGroupType, setFilterGroupType] = React.useState<FilterType>('include');
    const [filterGroupNote, setFilterGroupNote] = useState('');
    const [nameFilterAvail, setNameFilterAvail] = React.useState(false);
    const [channelId, setChannelId] = useState('');
    const [channelName, setChannelName] = useState('');

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
    const onArrayFilterTypeChanged = (event: SelectChangeEvent<FilterType>) => {
        setFilterGroupType(event.target.value as FilterType);
    }
    const onArrayFilterNoteChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
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
        }
    }, [filterGroupType, filterGroupNote, globalSetting.platform, channelId, channelName]);

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
        <Card variant="outlined" sx={{ overflow: 'visible' }}>
            <CardContent sx={{ display: 'flex', minHeight: '22rem' }}>
                {
                    props.afInputRow.length > 0 ? (
                        <Stack spacing={2} sx={{ width: '100%' }}>
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
                        </Stack>

                    ) : (
                        <Stack justifyContent='center' alignItems='center' sx={{ 'width': '100%' }}>
                            <Typography color='textSecondary' variant="subtitle1" gutterBottom>
                                {t('common.add_filter_elements')}
                            </Typography>
                        </Stack>
                    )
                }
            </CardContent>

            <Divider />
            <CardActions sx={{ padding: '16px' }}>
                <Stack
                    direction='row'
                    justifyContent='space-between'
                    sx={{ width: '100%' }}
                >
                    <Button onClick={addFilterInputForm}>
                        {t('common.add_filter_element')}
                    </Button>
                    <Stack direction={'row'} gap={1}>
                        <Stack gap={1}>
                            <Stack direction={'row'} gap={1}>
                                <CustomTextField
                                    value={filterGroupNote}
                                    label={t('필터 설명을 추가하세요')}
                                    onChange={onArrayFilterNoteChanged}
                                />
                                <FilterTypeSelector
                                    labelId="filterGroupType"
                                    value={filterGroupType}
                                    onChange={onArrayFilterTypeChanged}
                                />
                            </Stack>

                            <Stack direction={'row'} gap={1}>
                                <CustomTextField
                                    value={channelId}
                                    label={'채널 ID'}
                                    onChange={(e) => setChannelId(e.target.value)}
                                />
                                <CustomTextField
                                    value={channelName}
                                    label={'채널 이름'}
                                    onChange={(e) => setChannelName(e.target.value)}
                                />
                            </Stack>
                        </Stack>
                        <Button
                            disabled={props.afInputRow.length === 0}
                            onClick={addFilter}
                            variant='contained'
                        >
                            {t('common.add_filter')}
                        </Button>
                    </Stack>
                </Stack>
            </CardActions>
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

    const selectorChanged = (event: SelectChangeEvent<FilterCategory | FilterType>, selectorType: FilterSelectorType) => {
        const newValue = event.target.value;

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

    const removeList = (event: React.MouseEvent<HTMLElement>, id: string) => {
        props.setInputList(list => list.filter(l => l.id !== id));
    }

    return (
        <Stack direction='row' spacing={1}>
            {
                props.value.category === 'badge' ? (
                    <>
                        <Paper 
                            variant="outlined" 
                            sx={{ 
                                minWidth: 120,
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center'
                            }}
                        >
                            {globalSetting.platform === 'twitch' ? (
                                <img
                                    src={`https://static-cdn.jtvnw.net/badges/v1/${props.value.value}/1`}
                                    srcSet={
                                        `https://static-cdn.jtvnw.net/badges/v1/${props.value.value}/1 1x, 
                            https://static-cdn.jtvnw.net/badges/v1/${props.value.value}/2 2x, 
                            https://static-cdn.jtvnw.net/badges/v1/${props.value.value}/3 4x`}
                                />
                            ) : (
                                <img
                                    style={{ width: '18px', height: '18px' }}
                                    src={props.value.value}
                                />
                            )}
                            
                        </Paper>

                        <CustomTextField
                            label={t('common.badge_name')}
                            defaultValue={props.value.badgeName}
                            onChange={inputChanged}
                        />
                    </>
                ) : (
                    <>
                        <AdvancedFilterCategorySelector 
                            value={props.value.category}
                            onChange={(e) => selectorChanged(e, 'category')}
                            nameFilterAvail={props.nameFilterAvail}
                        />

                        <CustomTextField
                            label={t('common.value')}
                            defaultValue={props.value.value}
                            onChange={inputChanged}
                        />
                    </>
                )
            }

            <FilterTypeSelector
                labelId="filter-type-label"
                value={props.value.type}
                onChange={(e) => selectorChanged(e, 'type')}
            />

            <Button onClick={(e) => removeList(e, props.value.id)}>{t('common.remove')}</Button>
        </Stack>
    )
}