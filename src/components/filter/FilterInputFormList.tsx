/**
 * 필터 고급 모드를 위한 컴포넌트입니다.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import FilterListIcon from '@mui/icons-material/FilterList';
import AddIcon from '@mui/icons-material/Add';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CheckIcon from '@mui/icons-material/Check';
import BlockIcon from '@mui/icons-material/Block';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ChannelIdGuideDialog from './dialog/ChannelIdGuideDialog';
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
import { useFilterGroupContext } from '../../context/FilterGroup';
import { nanoid } from 'nanoid';
import { AdvancedFilterCategorySelector, FilterSelectorType, FilterTypeSelector } from './FilterComponents';
import Divider from '@mui/material/Divider';
import CustomTextField from '../TextField/CustomTextField';
import { useGlobalSettingContext } from '../../context/GlobalSetting';
import { getAdapter, getBadgeSrcSet } from '@/platform';
import { useAlertContext } from '@/context/Alert';

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
    const onFilterTypeChanged = (event: SelectChangeEvent<FilterType>) => {
        setFilterGroupType(event.target.value as FilterType);
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
        <Card
            variant="outlined"
            sx={{
                bgcolor: 'background.default',
                // 부모 flex column 안에서 shrink 당하면 Card overflow:hidden (MUI 기본)에
                // 내용 잘림. flexShrink:0으로 content 크기 유지 → column이 overflow:auto로 스크롤.
                flexShrink: 0,
            }}
        >
            <CardContent sx={{ display: 'flex' }}>
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
                        <Stack
                            justifyContent='center'
                            alignItems='center'
                            spacing={1.5}
                            sx={{ width: '100%', minHeight: '18rem' }}
                        >
                            <Box
                                sx={{
                                    width: 56,
                                    height: 56,
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: 'action.hover',
                                    color: 'text.secondary',
                                }}
                            >
                                <FilterListIcon fontSize="medium" />
                            </Box>
                            <Typography color='textSecondary' variant="subtitle1">
                                {t('common.add_filter_elements')}
                            </Typography>
                            <Typography color='text.disabled' variant="caption" sx={{ textAlign: 'center', maxWidth: 280 }}>
                                아래 <b>+ 필터 요소 추가</b> 또는 배지를 클릭해서 시작하세요.
                            </Typography>
                        </Stack>
                    )
                }
            </CardContent>

            <Divider />
            <CardActions sx={{ p: 2, display: 'block' }}>
                <Stack spacing={1.75}>
                    {/* 조건(filterType) toggle + "필터 요소 추가" 버튼을 같은 행에 — 같이 폼 영역
                        편집 액션이라 시각적으로 가까이. 조건 색상은 chipColor와 동일 의미. */}
                    <Stack direction="row" alignItems="flex-end" spacing={1.5} flexWrap="wrap" useFlexGap>
                        <Box>
                            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.75, display: 'block' }}>
                                {t('common.condition')}
                            </Typography>
                            <ToggleButtonGroup
                                value={filterGroupType}
                                exclusive
                                size="small"
                                onChange={(_e, v) => {
                                    if (v) onFilterTypeChanged({ target: { value: v } } as any);
                                }}
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
                        <Button
                            onClick={addFilterInputForm}
                            variant="outlined"
                            size="small"
                            startIcon={<AddIcon />}
                            sx={{ height: 38, ml: 'auto' }}
                        >
                            {t('common.add_filter_element')}
                        </Button>
                    </Stack>

                    <CustomTextField
                        value={filterGroupNote}
                        label="메모 (선택)"
                        onChange={onFilterNoteChanged}
                        fullWidth
                    />

                    {/* 채널 섹션: optional + 모르는 사람 위해 inline help icon */}
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
                                value={channelId}
                                label={'채널 ID'}
                                onChange={(e) => setChannelId(e.target.value)}
                                sx={{ flex: 1 }}
                            />
                            <CustomTextField
                                value={channelName}
                                label={'채널 이름'}
                                onChange={(e) => setChannelName(e.target.value)}
                                sx={{ flex: 1 }}
                            />
                        </Stack>
                    </Box>

                    {/* primary CTA: 우측 하단에 명확하게 */}
                    <Stack direction="row" justifyContent="flex-end">
                        <Button
                            disabled={props.afInputRow.length === 0}
                            onClick={addFilter}
                            variant='contained'
                            size="medium"
                        >
                            {t('common.add_filter')}
                        </Button>
                    </Stack>
                </Stack>
            </CardActions>
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
                            <img
                                style={{ width: '18px', height: '18px' }}
                                src={adapter.getBadgeImageUrl(props.value.value, '1x')}
                                srcSet={getBadgeSrcSet(adapter, props.value.value)}
                            />
                            
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