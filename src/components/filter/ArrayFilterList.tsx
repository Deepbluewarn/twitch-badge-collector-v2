import React, { useCallback, useEffect, useState } from "react";
import { GridColDef, GridRenderCellParams, GridRowId, GridToolbarContainer, GridToolbarFilterButton } from "@mui/x-data-grid";
import { useTranslation } from "react-i18next";
import { styled } from "@mui/material/styles";
import Tooltip from "@mui/material/Tooltip";
import Avatar from "@mui/material/Avatar";
import Stack from "@mui/material/Stack";
import { ImportFilter, ExportFilter } from "./FilterIO";
import { CustomDataGrid } from "../datagrid/customDataGrid";
import { chipColor, onArrayFilterTypeChipClick } from "../chip/FilterTypeChip";
import { CustomToolbarItemStyle } from "../datagrid/toolbar";
import { useArrayFilterContext } from "../../context/ArrayFilter";
import { ArrayFilterInterface, ArrayFilterListInterface } from "../../interfaces/filter";
import RelaxedChip from "../chip/RelaxedChip";
import { useGlobalSettingContext } from "../../context/GlobalSetting";

const ChipListStyle = styled(Stack)({
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    width: '100%',
    overflow: 'auto',
    lineHeight: '1.5',

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
    const { arrayFilter, setArrayFilter } = useArrayFilterContext();
    const [platformArrayFilter, setPlatformArrayFilter] = useState<ArrayFilterListInterface[]>(arrayFilter);
    const [selectionModel, setSelectionModel] = React.useState<GridRowId[]>([]);
    const [showDeleteButton, setShowDeleteButton] = React.useState(false);
    const { t } = useTranslation();

    const getColumns = useCallback(() => {
        return [
            { 
                field: 'filters', headerName: t('common.filter'), flex: 0.6, 
                renderCell: (params: GridRenderCellParams<any, ArrayFilterInterface[]>) => {
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
                            <Tooltip key={`${title}-${af.id}`} title={title}>
                                <RelaxedChip
                                    label={title}
                                    avatar={badgeAvatar}
                                    color={chipColor(af.type)}
                                />
                            </Tooltip >
                            
                        )
                    });
    
                    return (
                        <ChipListStyle direction='row'>
                            {chips}
                        </ChipListStyle>
                    )
                }
            },
            {
                field: 'filterNote', headerName: "비고", flex: 0.2,
                renderCell: (params: GridRenderCellParams<any, string>) => {
                    if(!params.value) return null;
    
                    return (
                        <Tooltip key={params.value} title={params.value}>
                            <RelaxedChip
                                label={params.value}
                                color='secondary'
                            />
                        </Tooltip >
                    )
                }
            },
            {
                field: 'filterType', headerName: t('common.condition'), flex: 0.2,
                renderCell: (params: GridRenderCellParams) => {
                    if (!params.value) return null;
    
                    return (
                        <RelaxedChip
                            label={t(`filter.category.${params.value}`)}
                            color={chipColor(params.value)}
                            onClick={() => onArrayFilterTypeChipClick(params, setArrayFilter)}
                        />
                    )
                }
            }
        ] as GridColDef[];
    }, [globalSetting.platform, platformArrayFilter]);

    useEffect(() => {
        localStorage.setItem('tbc-filter', JSON.stringify(arrayFilter));
    }, [arrayFilter]);

    useEffect(() => {
        setPlatformArrayFilter(arrayFilter.filter(af => af.platform === globalSetting.platform));
    }, [arrayFilter, globalSetting.platform]);

    return (
        <CustomDataGrid 
            rows={platformArrayFilter}
            columns={getColumns()}
            components={{ Toolbar: CustomToolbar }}
            componentsProps={{ 
                toolbar: {
                    selectionModel: selectionModel, 
                    showDeleteButton: showDeleteButton,
                }
            }}
            onRowSelectionModelChange={(ids) => {
                setShowDeleteButton(ids.length > 0);
                setSelectionModel(ids);
            }}
            rowSelectionModel={selectionModel}
        />
    )
}

function CustomToolbar(props: {
    selectionModel: GridRowId[], 
    showDeleteButton: boolean,
}) {
    return (
        <GridToolbarContainer>
            <GridToolbarFilterButton />
            <ImportFilter />
            <ExportFilter />
            <DeleteButton selectionModel={props.selectionModel} showDeleteButton={props.showDeleteButton} />
        </GridToolbarContainer>
    );
}

const DeleteButtonStyle = styled('div')({
    color: '#f44336'
})

function DeleteButton(props: { selectionModel: GridRowId[], showDeleteButton: boolean }) {
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

function deleteSelectedFilter(setRows: React.Dispatch<React.SetStateAction<ArrayFilterListInterface[]>>, selectionModel: GridRowId[]) {
    setRows(row => {
        const newRow = row.filter(r => {
            return !selectionModel.includes(r.id);
        });
        return newRow;
    });
}