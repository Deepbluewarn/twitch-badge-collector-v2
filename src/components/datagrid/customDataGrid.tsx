import { DataGrid, DataGridProps, GridCellParams } from "@mui/x-data-grid";
import { koKR, enUS } from "@mui/x-data-grid/locales";
import Box from "@mui/material/Box";
import { useTranslation } from "react-i18next";
import { FilterType } from "@/interfaces/filter";

export function filterTypeClassName(params: GridCellParams<any, FilterType> | FilterType) {
    let filterType = (params as GridCellParams<any, FilterType>).value || (params as FilterType);

    return `filter-type-${filterType}`;
}

const onTypeCellClick = (params: GridCellParams, event: React.MouseEvent) => {
    // event.preventDefault();
    if (params.field === 'filterType') {
        event.stopPropagation();
    }
}

export function CustomDataGrid(props: DataGridProps) {
    const { i18n } = useTranslation();
    const locale = i18n.language === 'ko' ? koKR : enUS;

    return (
        <Box sx={{ height: '27rem' }}>
            <DataGrid
                {...props}
                sx={{ "height": '27rem', minWidth: '40rem' }}
                localeText={locale.components.MuiDataGrid.defaultProps.localeText}
                getRowHeight={() => 'auto'}
                onCellClick={onTypeCellClick}
                pageSizeOptions={[6]}
                disableColumnFilter
                initialState={{
                    pagination: {
                        paginationModel: { page: 0, pageSize: 6 }
                    }
                }}
            />
        </Box>

    )
}
