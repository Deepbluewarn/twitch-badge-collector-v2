/**
 * 필터 기본(simple) 모드 — 단일 atomic 필터로 composite 그룹 하나 추가.
 * advanced 모드(FilterInputFormList)와 layout 통일:
 *   - 본문: atomic 필터 입력 (카테고리/배지 + 값 + 초기화)
 *   - 액션: 조건(Toggle) → 메모 → 채널 섹션(help 포함) → 필터 추가
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import { SelectChangeEvent } from '@mui/material/Select';
import { TextFieldProps } from "@mui/material/TextField";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CheckIcon from '@mui/icons-material/Check';
import BlockIcon from '@mui/icons-material/Block';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import {
    AtomicFilterElement,
    FilterCategory,
    FilterType
} from "../../interfaces/filter";
import { useFilterGroupContext } from '../../context/FilterGroup';
import { nanoid } from 'nanoid';
import { FilterSelectorType, FilterCategorySelector } from './FilterComponents';
import { useGlobalSettingContext } from '../../context/GlobalSetting';
import { defaultAtomicFilter } from '@/utils/utils-common';
import CustomTextField from '@/components/TextField/CustomTextField';
import { getAdapter, getBadgeSrcSet } from '@/platform';
import ChannelIdGuideDialog from './dialog/ChannelIdGuideDialog';

export default function FilterInputForm(
    props: {
        filterInput: AtomicFilterElement | undefined,
        setFilterInput: React.Dispatch<React.SetStateAction<AtomicFilterElement | undefined>>,
    }
) {
    const { t } = useTranslation();
    const { globalSetting } = useGlobalSettingContext();
    const { addCompositeFilters } = useFilterGroupContext();
    const [filterGroupNote, setFilterGroupNote] = useState('');
    const [guideOpen, setGuideOpen] = useState(false);
    const filterContentValue = useRef<TextFieldProps>(null);
    const channelValue = useRef<TextFieldProps>(null);
    const channelName = useRef<TextFieldProps>(null);

    const onFilterNoteChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
        setFilterGroupNote(event.target.value);
    }

    const onConditionChange = (_e: React.MouseEvent<HTMLElement>, value: FilterType | null) => {
        if (!value) return;
        props.setFilterInput(l => l ? { ...l, type: value } : l);
    }

    const addFilter = useCallback(() => {
        if (typeof props.filterInput === 'undefined') return;
        if (filterContentValue.current === null) return;
        if (channelValue.current === null || channelName.current === null) return;

        const contentValueRef = filterContentValue.current;
        const _contentValue = contentValueRef?.value as string;

        const channelValueRef = channelValue.current;
        const _channelValue = channelValueRef?.value as string;

        const channelNameRef = channelName.current;
        const _channelName = channelNameRef?.value as string;

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
        }
    }, [props.filterInput, filterGroupNote])

    return (
        <Card
            variant="outlined"
            sx={{
                bgcolor: 'background.default',
                // simple 모드: 짧은 content. column 내 vertical center (my:auto) +
                // shrink 차단(overflow:hidden로 잘리는 거 방지).
                my: 'auto',
                flexShrink: 0,
            }}
        >
            <CardContent>
                <BasicFilterInputForm
                    filterInput={props.filterInput}
                    setFilterInput={props.setFilterInput}
                    filterContentValue={filterContentValue}
                    channelValue={channelValue}
                    channelName={channelName}
                />
            </CardContent>

            <Divider />

            <CardActions sx={{ p: 2, display: 'block' }}>
                <Stack spacing={1.75}>
                    {/* 조건 (filterType) — segmented toggle */}
                    <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.75, display: 'block' }}>
                            {t('common.condition')}
                        </Typography>
                        <ToggleButtonGroup
                            value={props.filterInput?.type ?? 'include'}
                            exclusive
                            size="small"
                            onChange={onConditionChange}
                            sx={{
                                '& .MuiToggleButton-root': {
                                    px: 2,
                                    textTransform: 'none',
                                    gap: 0.5,
                                },
                                '& .MuiToggleButton-root.Mui-selected[value="include"]': {
                                    color: 'success.main',
                                    bgcolor: (theme) => theme.palette.success.main + '20',
                                },
                                '& .MuiToggleButton-root.Mui-selected[value="exclude"]': {
                                    color: 'error.main',
                                    bgcolor: (theme) => theme.palette.error.main + '20',
                                },
                            }}
                        >
                            <ToggleButton value="include">
                                <CheckIcon sx={{ fontSize: 18 }} />
                                {t('filter.category.include')}
                            </ToggleButton>
                            <ToggleButton value="exclude">
                                <BlockIcon sx={{ fontSize: 18 }} />
                                {t('filter.category.exclude')}
                            </ToggleButton>
                            <ToggleButton value="sleep">
                                <VisibilityOffIcon sx={{ fontSize: 18 }} />
                                {t('filter.category.sleep')}
                            </ToggleButton>
                        </ToggleButtonGroup>
                    </Box>

                    {/* 메모 (선택) */}
                    <CustomTextField
                        value={filterGroupNote}
                        label="메모 (선택)"
                        onChange={onFilterNoteChanged}
                        fullWidth
                    />

                    {/* 채널 섹션 — header에 help icon */}
                    <Box>
                        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.75 }}>
                            <Typography variant="caption" color="text.secondary">
                                특정 채널에서만 적용 (선택)
                            </Typography>
                            <IconButton
                                size="small"
                                onClick={() => setGuideOpen(true)}
                                aria-label="채널 ID 안내"
                                sx={{ p: 0.25 }}
                            >
                                <HelpOutlineIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Stack>
                        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
                            <CustomTextField
                                label="채널 ID"
                                defaultValue={props.filterInput?.filterChannelId}
                                inputRef={channelValue}
                                sx={{ flex: 1 }}
                            />
                            <CustomTextField
                                label="채널 이름"
                                defaultValue={props.filterInput?.filterChannelName}
                                inputRef={channelName}
                                sx={{ flex: 1 }}
                            />
                        </Stack>
                    </Box>

                    {/* primary CTA */}
                    <Stack direction="row" justifyContent="flex-end">
                        <Button onClick={addFilter} variant="contained">
                            {t('common.add_filter')}
                        </Button>
                    </Stack>
                </Stack>
            </CardActions>

            <ChannelIdGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />
        </Card>
    )
}

function BasicFilterInputForm(
    props: {
        filterInput: AtomicFilterElement | undefined,
        setFilterInput: React.Dispatch<React.SetStateAction<AtomicFilterElement | undefined>>,
        filterContentValue: React.MutableRefObject<TextFieldProps | null>,
        channelValue: React.MutableRefObject<TextFieldProps | null>,
        channelName: React.MutableRefObject<TextFieldProps | null>,
    }
) {
    const { globalSetting } = useGlobalSettingContext();
    const adapter = getAdapter(globalSetting.platform);
    const { t } = useTranslation();

    const selectorChanged = (event: SelectChangeEvent<FilterCategory | FilterType>, selectorType: FilterSelectorType) => {
        const newValue = event.target.value;

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
            props.filterContentValue.current!.value = props.filterInput.badgeName;
        }
    }, [props.filterInput]);

    useEffect(() => {
        resetFilterInput();
    }, [globalSetting.platform])

    return (
        <Stack direction="row" spacing={1} alignItems="center">
            {
                props.filterInput && props.filterInput.category === 'badge' ? (
                    <>
                        <Paper
                            variant="outlined"
                            sx={{
                                minWidth: 64,
                                height: 40,
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                flexShrink: 0,
                            }}
                        >
                            <img
                                style={{ width: '20px', height: '20px' }}
                                src={adapter.getBadgeImageUrl(props.filterInput.value, '1x')}
                                srcSet={getBadgeSrcSet(adapter, props.filterInput.value)}
                            />
                        </Paper>
                        <CustomTextField
                            label={t('common.badge_name')}
                            defaultValue={props.filterInput.badgeName}
                            inputRef={props.filterContentValue}
                            sx={{ flex: 1 }}
                        />
                    </>
                ) : (
                    <>
                        <FilterCategorySelector
                            value={props.filterInput?.category}
                            onChange={(e) => selectorChanged(e, 'category')}
                        />
                        <CustomTextField
                            label={t('common.value')}
                            defaultValue={props.filterInput?.value}
                            inputRef={props.filterContentValue}
                            sx={{ flex: 1 }}
                        />
                    </>
                )
            }
            <IconButton
                onClick={resetFilterInput}
                aria-label="초기화"
                size="small"
                sx={{ flexShrink: 0 }}
            >
                <RestartAltIcon />
            </IconButton>
        </Stack>
    )
}
