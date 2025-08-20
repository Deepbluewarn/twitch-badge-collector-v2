/**
 * 필터 기본 모드를 위한 컴포넌트입니다.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useMediaQuery from '@mui/material/useMediaQuery';
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import { SelectChangeEvent } from '@mui/material/Select';
import { TextFieldProps } from "@mui/material/TextField";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Paper from '@mui/material/Paper';
import {
    ArrayFilterInterface,
    ArrayFilterCategory,
    FilterType
} from "../../interfaces/filter";
import { useArrayFilterContext } from '../../context/ArrayFilter';
import { nanoid } from 'nanoid';
import { ArrayFilterSelectorType, ArrayFilterTypeSelector, FilterCategorySelector } from './ArrayFilterComponents';
import { useGlobalSettingContext } from '../../context/GlobalSetting';
import { getDefaultArrayFilter } from '@utils/utils-common';
import CustomTextField from '@components/TextField/CustomTextField';

export default function FilterInputForm(
    props: {
    filterInput: ArrayFilterInterface,
    setFilterInput: React.Dispatch<React.SetStateAction<ArrayFilterInterface>>,
}
) {

    const { t } = useTranslation();
    const matches = useMediaQuery('(min-width:600px)');
    const { globalSetting } = useGlobalSettingContext();
    const { addArrayFilter } = useArrayFilterContext();
    const [arrayFilterNote, setArrayFilterNote] = useState('');
    const filterContentValue = useRef<TextFieldProps>(null);
    const channelValue = useRef<TextFieldProps>(null);
    const channelName = useRef<TextFieldProps>(null);

    const onArrayFilterNoteChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
        setArrayFilterNote(event.target.value);
    }

    const addFilter = useCallback(() => {
        if(typeof props.filterInput === 'undefined') return;
        if(filterContentValue.current === null) return;
        if(channelValue.current === null || channelName.current === null) return;

        const contentValueRef = filterContentValue.current;
        const _contentValue = contentValueRef?.value as string;

        const channelValueRef = channelValue.current;
        const _channelValue = channelValueRef?.value as string;

        const channelNameRef = channelName.current;
        const _channelName = channelNameRef?.value as string;

        if(props.filterInput.category === 'badge'){
            props.filterInput.badgeName = _contentValue;
        }else{
            props.filterInput.value = _contentValue;
        }

        // 기본 모드에서 필터 요소의 타입은 include로 고정되어 있습니다.
        const filterType = props.filterInput.type;
        props.filterInput.type = 'include';
        
        const added = addArrayFilter([{
            filterType: filterType,
            id: nanoid(),
            filterNote: arrayFilterNote,
            filters: [props.filterInput],
            platform: globalSetting.platform,
            filterChannelId: _channelValue,
            filterChannelName: _channelName,
        }]);
        if (added) {
            setArrayFilterNote('');
            props.setFilterInput(getDefaultArrayFilter());
            contentValueRef.value = '';
        }
    }, [props.filterInput, arrayFilterNote])

    return (
        <Card variant="outlined" sx={{ overflow: 'visible' }}>
            <CardContent>
                <BasicFilterInputForm 
                    filterInput={props.filterInput}
                    setFilterInput={props.setFilterInput}
                    filterContentValue={filterContentValue}
                    channelValue={channelValue}
                    channelName={channelName}
                />
            </CardContent>
            <CardActions sx={{ padding: '16px' }}>
                <Stack
                    direction='row'
                    justifyContent='space-between'
                    sx={{ width: '100%' }}
                >
                    <Stack direction={matches ? 'row' : 'column'} gap={1} sx={{width: '100%'}}>
                        <CustomTextField
                            value={arrayFilterNote}
                            label={t('필터 설명을 추가하세요')}
                            onChange={onArrayFilterNoteChanged}
                        />
                        <Button
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

function BasicFilterInputForm(
    props: {
    filterInput: ArrayFilterInterface,
    setFilterInput: React.Dispatch<React.SetStateAction<ArrayFilterInterface>>,
    filterContentValue: React.MutableRefObject<TextFieldProps | null>,
    channelValue: React.MutableRefObject<TextFieldProps | null>,
    channelName: React.MutableRefObject<TextFieldProps | null>,
}
){
    const {globalSetting} = useGlobalSettingContext();
    const { t } = useTranslation();

    const selectorChanged = (event: SelectChangeEvent<ArrayFilterCategory | FilterType>, selectorType: ArrayFilterSelectorType) => {
        const newValue = event.target.value;

        props.setFilterInput(l => {
            const newL = { ...l };
            if (selectorType === 'category') {
                newL.category = newValue as ArrayFilterCategory;
            } else if (selectorType === 'type') {
                newL.type = newValue as FilterType;
            }
            return newL;
        });
    }

    const resetFilterInput = useCallback(() => {
        props.setFilterInput(getDefaultArrayFilter());

        const filterContentRef = props.filterContentValue.current;
        const channelValueRef = props.channelValue.current;
        const channelNameRef = props.channelName.current;

        if(filterContentRef !== null) {
            filterContentRef.value = '';
        };
        if(channelValueRef !== null) {
            channelValueRef.value = '';
        };
        if(channelNameRef !== null) {
            channelNameRef.value = '';
        };
    }, []);

    useEffect(() => {
        // 선택한 배지의 이름을 TextInput 에 자동으로 입력.
        if(props.filterInput.category === 'badge'){
            props.filterContentValue.current!.value = props.filterInput.badgeName;
        }
    }, [props.filterInput]);

    useEffect(() => {
        resetFilterInput();
    }, [globalSetting.platform])

    return (
        <Stack direction='row' spacing={1}>
            {
                props.filterInput.category === 'badge' ? (
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
                            {
                                globalSetting.platform === 'twitch' ? (
                                    <img
                                        style={{ width: '18px', height: '18px' }}
                                        src={`https://static-cdn.jtvnw.net/badges/v1/${props.filterInput.value}/1`}
                                        srcSet={
                                            `https://static-cdn.jtvnw.net/badges/v1/${props.filterInput.value}/1 1x, 
                            https://static-cdn.jtvnw.net/badges/v1/${props.filterInput.value}/2 2x, 
                            https://static-cdn.jtvnw.net/badges/v1/${props.filterInput.value}/3 4x`}
                                    />
                                ) : (
                                    <img
                                        style={{ width: '18px', height: '18px' }}
                                        src={props.filterInput.value}
                                    />
                                )
                            }
                            
                        </Paper>

                        <CustomTextField
                            label={t('common.badge_name')}
                            defaultValue={props.filterInput.badgeName}
                            inputRef={props.filterContentValue}
                        />
                    </>
                ) : (
                    <>
                        <FilterCategorySelector 
                            value={props.filterInput.category}
                            onChange={(e) => selectorChanged(e, 'category')}
                        />

                        <CustomTextField
                            label={t('common.value')}
                            defaultValue={props.filterInput.value}
                            inputRef={props.filterContentValue}
                        />
                    </>
                )
            }

            <CustomTextField
                label={'채널 ID'}
                defaultValue={props.filterInput.filterChannelId}
                inputRef={props.channelValue}
            />

            <CustomTextField
                label={'채널 이름'}
                defaultValue={props.filterInput.filterChannelName}
                inputRef={props.channelName}
            />

            <ArrayFilterTypeSelector
                labelId="filter-type-label"
                value={props.filterInput.type}
                onChange={(e) => selectorChanged(e, 'type')}
            />

            <Button variant='contained' onClick={resetFilterInput}>초기화</Button>
        </Stack>
    )
}
