import React, { useCallback, useEffect, useState } from "react";
import { GridColDef, GridRenderCellParams, GridRowId, GridToolbarContainer, GridToolbarProps, Toolbar } from "@mui/x-data-grid";
import { Box } from "@mui/material";
import { useTranslation } from "react-i18next";
import { styled } from "@mui/material/styles";
import Tooltip from "@mui/material/Tooltip";
import Avatar from "@mui/material/Avatar";
import Stack from "@mui/material/Stack";
import { ImportFilter, ExportFilter } from "./FilterIO";
import { chipColor, onArrayFilterTypeChipClick } from "../chip/FilterTypeChip";
import { CustomToolbarItemStyle } from "@/components/datagrid/toolbar";
import { useArrayFilterContext } from "@/context/ArrayFilter";
import { ArrayFilterInterface, ArrayFilterListInterface } from "../../interfaces/filter";
import RelaxedChip from "../chip/RelaxedChip";
import { useGlobalSettingContext } from "@/context/GlobalSetting";
import FilterDialog, { DialogMode, DialogType } from "./FilterDialog";
import RoundAddButton from '../common/RoundAddButton';
import { CustomDataGrid } from "../datagrid/customDataGrid";

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

export function ArrayFilterList() {
    const { globalSetting } = useGlobalSettingContext();
    const { arrayFilter, setArrayFilter, upsertArrayFilter, removeSubFilter, removeFilterField } = useArrayFilterContext();
    const [platformArrayFilter, setPlatformArrayFilter] = useState<ArrayFilterListInterface[]>(arrayFilter);
    const [selectionModel, setSelectionModel] = React.useState<Set<GridRowId>>(new Set());
    const [showDeleteButton, setShowDeleteButton] = React.useState(false);
    const { t } = useTranslation();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogType, setDialogType] = useState<DialogType>(null);
    const [dialogMode, setDialogMode] = useState<DialogMode>(null);
    const [selectedFilterList, setSelectedFilterList] = useState<ArrayFilterListInterface>();
    const [selectedFilterId, setSelectedFilterId] = useState<string | undefined>('');
    
    // 필터 수정 모달 열기 함수
    const openFilterDialog = ({
        type,
        filterList,
        selectedFilterId,
        mode = 'edit'
    }: {
        type: DialogType,
        filterList?: ArrayFilterListInterface,
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
                renderCell: (params: GridRenderCellParams<ArrayFilterListInterface, ArrayFilterInterface[]>) => {
                    if(!params.value) return null;

                    if(platformArrayFilter.length > 0 && platformArrayFilter[0].platform !== globalSetting.platform) return null;
    
                    const chips = params.value.map(af => {
                        let title = `${t(`filter.type.${af.category || ''}`)}: ${af.value}`;
                        let badgeAvatar;
                        if(af.category === 'badge'){
                            const badgeUUID = af.value;
                            title = af.badgeName || '';
                            badgeAvatar = (globalSetting.platform === 'twitch') ? (
                                <Avatar 
                                    alt={af.badgeName} 
                                    src={`https://static-cdn.jtvnw.net/badges/v1/${badgeUUID}/1`} 
                                    srcSet={`https://static-cdn.jtvnw.net/badges/v1/${badgeUUID}/1 1x,
                                    https://static-cdn.jtvnw.net/badges/v1/${badgeUUID}/2 2x,
                                    https://static-cdn.jtvnw.net/badges/v1/${badgeUUID}/3 4x`}
                                />
                            ) : (
                                <Avatar 
                                    alt={af.badgeName} 
                                    src={badgeUUID} 
                                />
                            )
                        }
                        return (
                            <Tooltip key={`${title}-${af.id}`} title={title} placement="top">
                                <RelaxedChip
                                    label={title}
                                    avatar={badgeAvatar}
                                    color={chipColor(af.type)}
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

                    if(!params.value) {
                        // Subtle chip for adding channel name
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

                    return (
                        <Tooltip key={params.row.filterChannelId} title={params.row.filterChannelId} placement="top">
                            <RelaxedChip
                                label={params.value}
                                color='secondary'
                                onClick={(e) => { 
                                    e.stopPropagation();
                                    openFilterDialog({
                                        type: 'channel',
                                        filterList: params.row,
                                        mode: 'edit'
                                    });
                                 }}
                                 onDelete={() => {
                                    removeFilterField(params.row.id, 'filterChannelId')
                                    removeFilterField(params.row.id, 'filterChannelName')
                                 }}
                            />
                        </Tooltip >
                    )
                }
            },
            {
                field: 'filterNote', headerName: "비고", flex: 0.2, display: 'flex',
                renderCell: (params: GridRenderCellParams<any, string>) => {
                    if(!params.value) {
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
                        <Tooltip key={params.value} title={params.value} placement="top">
                            <RelaxedChip
                                label={params.value}
                                color='secondary'
                                onClick={(e) => { 
                                    e.stopPropagation();
                                    openFilterDialog({
                                        type: 'note',
                                        filterList: params.row,
                                        mode: 'edit'
                                    });
                                }}
                                onDelete={() => {
                                    removeFilterField(params.row.id, 'filterNote');
                                }}
                            />
                        </Tooltip >
                    )
                }
            },
            {
                field: 'filterType', headerName: t('common.condition'), flex: 0.2, display: 'flex',
                renderCell: (params: GridRenderCellParams) => {
                    if (!params.value) return null;
    
                    return (
                        <RelaxedChip
                            label={t(`filter.category.${params.value}`)}
                            color={chipColor(params.value)}
                            onClick={(e) => {
                                e.stopPropagation();
                                onArrayFilterTypeChipClick(params, setArrayFilter);
                            }}
                        />
                    )
                }
            }
        ] as GridColDef[];
    }, [globalSetting.platform, platformArrayFilter]);

    useEffect(() => {
        console.log('ArrayFilterList arrayFilter: ', arrayFilter)
        localStorage.setItem('tbc-filter', JSON.stringify(arrayFilter));
    }, [arrayFilter]);

    useEffect(() => {
        setPlatformArrayFilter(arrayFilter.filter(af => af.platform === globalSetting.platform));
    }, [arrayFilter, globalSetting.platform]);

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
                rows={platformArrayFilter}
                columns={getColumns()}
                slots={{ toolbar: CustomToolbar }}
                showToolbar
                onRowSelectionModelChange={(selModel) => {
                    console.log('ArrayFilterList selectionModel: ', selModel);
                    
                    // v7의 새로운 selection model 처리
                    let actualSelectedCount = 0;
                    let actualSelectedIds = new Set<GridRowId>();

                    if (selModel.type === 'include') {
                        // include 타입: ids에 포함된 항목들의 개수
                        actualSelectedCount = selModel.ids.size;
                        actualSelectedIds = selModel.ids;
                    } else {
                        // exclude 타입: 전체에서 ids에 제외된 항목들을 뺀 개수
                        actualSelectedCount = platformArrayFilter.length - selModel.ids.size;
                        // exclude 타입에서는 선택된 항목들을 계산
                        actualSelectedIds = new Set(
                            platformArrayFilter
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

                    upsertArrayFilter(updatedData);
                }}
            />
        </>
    )
}

const DeleteButtonStyle = styled('div')({
    color: '#f44336'
})

function DeleteButton(props: { selectionModel: Set<GridRowId>, showDeleteButton: boolean }) {
    const { setArrayFilter } = useArrayFilterContext();

    if (!props.showDeleteButton) return null;

    return (
        <DeleteButtonStyle>
            <CustomToolbarItemStyle direction='row' onClick={() => { deleteSelectedFilter(setArrayFilter, props.selectionModel) }}>
                <span className="material-icons-round">delete</span>
                <span>선택 삭제</span>
            </CustomToolbarItemStyle>
        </DeleteButtonStyle>
    )
}

function deleteSelectedFilter(setRows: React.Dispatch<React.SetStateAction<ArrayFilterListInterface[]>>, selectionModel: Set<GridRowId>) {
    setRows(row => {
        const newRow = row.filter(r => {
            return !Array.from(selectionModel).includes(r.id);
        });
        return newRow;
    });
}