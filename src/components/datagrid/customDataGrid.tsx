import React from "react";
import Box from "@mui/material/Box";
import { DataGrid, DataGridProps, GridCellParams, koKR, enUS, MuiEvent } from "@mui/x-data-grid";
import { useTranslation } from "react-i18next";
import { FilterType } from "../../interfaces/filter";

export function filterTypeClassName(params: GridCellParams<FilterType> | FilterType) {
    let filterType = (params as GridCellParams<FilterType>).value || (params as FilterType);

    return `filter-type-${filterType}`;
}

const onTypeCellClick = (params: GridCellParams, event: MuiEvent<React.MouseEvent>) => {
    event.defaultMuiPrevented = params.field === 'filterType';
}

export function CustomDataGrid(props: DataGridProps) {
    const { i18n } = useTranslation();
    const locale = i18n.language === 'ko' ? koKR : enUS;
    
    return (
        <Box sx={{height: '27rem'}}>
            <DataGrid {...props} componentsProps={props.componentsProps}
                localeText={locale.components.MuiDataGrid.defaultProps.localeText}
                sx={{ "height": '27rem' }}
                getRowHeight={() => 'auto'}
                onCellClick={onTypeCellClick}
                pageSize={6}
                rowsPerPageOptions={[6]}
                checkboxSelection={true}
            />
        </Box>
    )
}