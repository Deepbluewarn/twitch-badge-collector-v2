import React, { useCallback, useEffect, useState } from "react";
import { GridColDef, GridRenderCellParams, GridRowId } from "@mui/x-data-grid";
import { Box } from "@mui/material";
import { useTranslation } from "react-i18next";
import { styled } from "@mui/material/styles";
import Tooltip from "@mui/material/Tooltip";
import Avatar from "@mui/material/Avatar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import BlockIcon from '@mui/icons-material/Block';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { ImportFilter, ExportFilter } from "./FilterIO";
import { chipColor, onFilterTypeChipClick } from "../chip/FilterTypeChip";
import { CustomToolbarItemStyle } from "@/components/datagrid/toolbar";
import { useFilterGroupContext } from "@/context/FilterGroup";
import { AtomicFilterElement, CompositeFilterElement, FilterType } from "../../interfaces/filter";
import RelaxedChip from "../chip/RelaxedChip";
import { useGlobalSettingContext } from "@/context/GlobalSetting";
import FilterDialog, { DialogMode, DialogType } from "./FilterDialog";
import RoundAddButton from '../common/RoundAddButton';
import { CustomDataGrid } from "../datagrid/customDataGrid";
import { getAdapter, getBadgeSrcSet } from '@/platform';

const ChipListStyle = styled(Stack)({
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    width: '100%',
    overflow: 'auto',
    lineHeight: '1.5',
    alignItems: 'center',

    '.chip-label-filterBadgeImage': {
        display: 'inline-block',
        verticalAlign: 'middle',
    },
    '.MuiChip-outlined': {
        maxWidth: '10rem',
    }
})

export function FilterGroupList() {
    const { globalSetting } = useGlobalSettingContext();
    const adapter = getAdapter(globalSetting.platform);
    const { filterGroup, setFilterGroup, upsertCompositeFilter, removeSubFilter, removeFilterField } = useFilterGroupContext();
    const [platformFilters, setPlatformFilters] = useState<CompositeFilterElement[]>(filterGroup);
    const [selectionModel, setSelectionModel] = React.useState<Set<GridRowId>>(new Set());
    const [showDeleteButton, setShowDeleteButton] = React.useState(false);
    const { t } = useTranslation();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogType, setDialogType] = useState<DialogType>(null);
    const [dialogMode, setDialogMode] = useState<DialogMode>(null);
    const [selectedFilterList, setSelectedFilterList] = useState<CompositeFilterElement>();
    const [selectedFilterId, setSelectedFilterId] = useState<string | undefined>('');
    
    // 필터 수정 모달 열기 함수
    const openFilterDialog = ({
        type,
        filterList,
        selectedFilterId,
        mode = 'edit'
    }: {
        type: DialogType,
        filterList?: CompositeFilterElement,
        selectedFilterId?: string,
        mode?: DialogMode
    }) => {
        setDialogType(type);
        setSelectedFilterList(filterList);
        setSelectedFilterId(selectedFilterId);
        setDialogOpen(true);
        setDialogMode(mode);
    };

    const getColumns = useCallback(() => {
        return [
            { 
                field: 'filters', headerName: t('common.filter'), flex: 0.6, display: 'flex',
                renderCell: (params: GridRenderCellParams<CompositeFilterElement, AtomicFilterElement[]>) => {
                    if(!params.value) return null;

                    if(platformFilters.length > 0 && platformFilters[0].platform !== globalSetting.platform) return null;
    
                    const chips = params.value.map(af => {
                        let title = `${t(`filter.type.${af.category || ''}`)}: ${af.value}`;
                        let badgeAvatar;
                        if(af.category === 'badge'){
                            const badgeUUID = af.value;
                            title = af.badgeName || '';
                            badgeAvatar = (
                                <Avatar
                                    alt={af.badgeName}
                                    src={adapter.getBadgeImageUrl(badgeUUID, '1x')}
                                    srcSet={getBadgeSrcSet(adapter, badgeUUID)}
                                />
                            )
                        }
                        return (
                            <Tooltip key={`${title}-${af.id}`} title={title} placement="top">
                                <RelaxedChip
                                    label={title}
                                    avatar={badgeAvatar}
                                    color={chipColor(af.type)}
                                    variant="outlined"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openFilterDialog({
                                            type: 'filter',
                                            filterList: params.row,
                                            selectedFilterId: af.id,
                                            mode: 'edit'
                                        });
                                     }}
                                     onDelete={() => {
                                        removeSubFilter(params.row.id, af.id);
                                     }}
                                />
                            </Tooltip >
                        )
                    });
    
                    return (
                        <ChipListStyle direction='row'>
                            {chips}
                            <RoundAddButton
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openFilterDialog({
                                        type: 'filter',
                                        mode: 'add',
                                        filterList: params.row,
                                    });
                                }}
                            />
                        </ChipListStyle>
                    )
                }
            },
            {
                field: 'filterChannelName', headerName: "채널", flex: 0.2, display: 'flex',
                renderCell: (params: GridRenderCellParams<any, string>) => {
                    if (!params.value) {
                        return (
                            <RoundAddButton
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openFilterDialog({
                                        type: 'channel',
                                        filterList: params.row,
                                        mode: 'add'
                                    });
                                }}
                            />
                        )
                    }
                    // chip 대신 텍스트 + delete 아이콘 — 데이터 셀에 적합한 lightweight 표현
                    return (
                        <TextCell
                            label={params.value}
                            tooltip={params.row.filterChannelId}
                            onClick={(e) => {
                                e.stopPropagation();
                                openFilterDialog({
                                    type: 'channel',
                                    filterList: params.row,
                                    mode: 'edit'
                                });
                            }}
                            onDelete={(e) => {
                                e.stopPropagation();
                                removeFilterField(params.row.id, 'filterChannelId');
                                removeFilterField(params.row.id, 'filterChannelName');
                            }}
                        />
                    )
                }
            },
            {
                field: 'filterNote', headerName: "메모", flex: 0.2, display: 'flex',
                renderCell: (params: GridRenderCellParams<any, string>) => {
                    if (!params.value) {
                        return (
                            <RoundAddButton
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openFilterDialog({
                                        type: 'note',
                                        filterList: params.row,
                                        mode: 'add'
                                    });
                                }}
                            />
                        )
                    }
                    return (
                        <TextCell
                            label={params.value}
                            tooltip={params.value}
                            onClick={(e) => {
                                e.stopPropagation();
                                openFilterDialog({
                                    type: 'note',
                                    filterList: params.row,
                                    mode: 'edit'
                                });
                            }}
                            onDelete={(e) => {
                                e.stopPropagation();
                                removeFilterField(params.row.id, 'filterNote');
                            }}
                        />
                    )
                }
            },
            {
                field: 'filterType', headerName: t('common.condition'), flex: 0.18, display: 'flex',
                renderCell: (params: GridRenderCellParams) => {
                    if (!params.value) return null;
                    return (
                        <ConditionLabel
                            value={params.value as FilterType}
                            label={t(`filter.category.${params.value}`)}
                            onClick={(e) => {
                                e.stopPropagation();
                                onFilterTypeChipClick(params, setFilterGroup);
                            }}
                        />
                    )
                }
            }
        ] as GridColDef[];
    }, [globalSetting.platform, platformFilters]);

    useEffect(() => {
        setPlatformFilters(filterGroup.filter(af => af.platform === globalSetting.platform));
    }, [filterGroup, globalSetting.platform]);

    function CustomToolbar() {
        return (
            <Box sx={{ p: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
                <ImportFilter />
                <ExportFilter />
                <DeleteButton selectionModel={selectionModel} showDeleteButton={showDeleteButton} />
            </Box>
        );
    }

    return (
        <>
            <CustomDataGrid
                rows={platformFilters}
                columns={getColumns()}
                slots={{ toolbar: CustomToolbar }}
                showToolbar
                onRowSelectionModelChange={(selModel) => {

                    // v7의 새로운 selection model 처리
                    let actualSelectedCount = 0;
                    let actualSelectedIds = new Set<GridRowId>();

                    if (selModel.type === 'include') {
                        // include 타입: ids에 포함된 항목들의 개수
                        actualSelectedCount = selModel.ids.size;
                        actualSelectedIds = selModel.ids;
                    } else {
                        // exclude 타입: 전체에서 ids에 제외된 항목들을 뺀 개수
                        actualSelectedCount = platformFilters.length - selModel.ids.size;
                        // exclude 타입에서는 선택된 항목들을 계산
                        actualSelectedIds = new Set(
                            platformFilters
                                .filter(filter => !selModel.ids.has(filter.id))
                                .map(filter => filter.id)
                        );
                    }

                    setSelectionModel(actualSelectedIds);
                    setShowDeleteButton(actualSelectedCount > 0);
                }}
                checkboxSelection
            />
            <FilterDialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                type={dialogType}
                mode={dialogMode}
                selectedFilterList={selectedFilterList}
                filterId={selectedFilterId}
                onSave={(type, updatedData) => {
                    if (!updatedData) return;

                    upsertCompositeFilter(updatedData);
                }}
            />
        </>
    )
}

const DeleteButtonStyle = styled('div')({
    color: '#f44336'
})

function DeleteButton(props: { selectionModel: Set<GridRowId>, showDeleteButton: boolean }) {
    const { setFilterGroup } = useFilterGroupContext();

    if (!props.showDeleteButton) return null;

    return (
        <DeleteButtonStyle>
            <CustomToolbarItemStyle direction='row' onClick={() => { deleteSelectedFilter(setFilterGroup, props.selectionModel) }}>
                <span className="material-icons-round">delete</span>
                <span>선택 삭제</span>
            </CustomToolbarItemStyle>
        </DeleteButtonStyle>
    )
}

function deleteSelectedFilter(setRows: React.Dispatch<React.SetStateAction<CompositeFilterElement[]>>, selectionModel: Set<GridRowId>) {
    setRows(row => {
        const newRow = row.filter(r => {
            return !Array.from(selectionModel).includes(r.id);
        });
        return newRow;
    });
}

/**
 * 채널/메모 셀 — chip 대신 텍스트 + hover 시 미니 delete 버튼.
 * chip은 시각 무게가 너무 무거워서 데이터 그리드에서 산만함.
 */
function TextCell({
    label, tooltip, onClick, onDelete,
}: {
    label: string;
    tooltip?: string;
    onClick: (e: React.MouseEvent) => void;
    onDelete: (e: React.MouseEvent) => void;
}) {
    const content = (
        <Stack
            direction="row"
            alignItems="center"
            gap={0.5}
            onClick={onClick}
            sx={{
                cursor: 'pointer',
                width: '100%',
                py: 0.25,
                px: 0.5,
                borderRadius: 1,
                '&:hover': {
                    bgcolor: 'action.hover',
                    '& .tbcv2-cell-delete': { opacity: 1 },
                },
            }}
        >
            <Typography
                variant="body2"
                sx={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}
            >
                {label}
            </Typography>
            <IconButton
                size="small"
                onClick={onDelete}
                className="tbcv2-cell-delete"
                aria-label="삭제"
                sx={{ opacity: 0, transition: 'opacity 0.15s', p: 0.25 }}
            >
                <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
        </Stack>
    );
    return tooltip ? <Tooltip title={tooltip} placement="top">{content}</Tooltip> : content;
}

/**
 * 조건 라벨 — chip 대신 아이콘 + 색있는 텍스트. include/exclude 의미 색상 유지하되
 * 배경 fill 없이 inline.
 */
function ConditionLabel({
    value, label, onClick,
}: {
    value: FilterType;
    label: string;
    onClick: (e: React.MouseEvent) => void;
}) {
    const Icon = value === 'include' ? CheckIcon : value === 'exclude' ? BlockIcon : VisibilityOffIcon;
    const color =
        value === 'include' ? 'success.main' :
        value === 'exclude' ? 'error.main' :
        'text.secondary';
    return (
        <Stack
            direction="row"
            alignItems="center"
            gap={0.5}
            onClick={onClick}
            sx={{
                cursor: 'pointer',
                color,
                py: 0.25,
                px: 0.5,
                borderRadius: 1,
                '&:hover': { bgcolor: 'action.hover' },
            }}
        >
            <Icon sx={{ fontSize: 16 }} />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>{label}</Typography>
        </Stack>
    );
}