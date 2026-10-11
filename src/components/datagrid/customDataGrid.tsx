import { DataGrid, DataGridProps, GridCellParams } from "@mui/x-data-grid";
import { koKR, enUS, ruRU, ukUA, jaJP, esES, ptBR, deDE, frFR, zhCN, zhTW } from "@mui/x-data-grid/locales";
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

const GRID_LOCALES: Record<string, typeof enUS> = {
    en: enUS, ko: koKR, ru: ruRU, uk: ukUA, ja: jaJP, es: esES, 'pt-BR': ptBR, de: deDE, fr: frFR, 'zh-CN': zhCN, 'zh-TW': zhTW,
};

export function CustomDataGrid(props: DataGridProps) {
    const { i18n } = useTranslation();
    const locale = GRID_LOCALES[i18n.resolvedLanguage ?? 'en'] ?? enUS;

    return (
        <Box sx={{ height: '40rem' }}>
            <DataGrid
                {...props}
                sx={{
                    height: '40rem',
                    // 셀/행 구분선이 기본 divider 색만으로는 라이트 모드에서 너무 흐림 →
                    // text.secondary의 약한 alpha로 보강.
                    '--DataGrid-rowBorderColor': (theme) => theme.palette.mode === 'light'
                        ? 'rgba(15, 16, 20, 0.12)'
                        : 'rgba(255, 255, 255, 0.12)',
                    '& .MuiDataGrid-cell': {
                        borderColor: (theme) => theme.palette.mode === 'light'
                            ? 'rgba(15, 16, 20, 0.10)'
                            : 'rgba(255, 255, 255, 0.10)',
                    },
                    '& .MuiDataGrid-columnHeader': {
                        borderColor: (theme) => theme.palette.mode === 'light'
                            ? 'rgba(15, 16, 20, 0.18)'
                            : 'rgba(255, 255, 255, 0.18)',
                    },
                    '& .MuiDataGrid-columnHeaders': {
                        borderBottomColor: (theme) => theme.palette.mode === 'light'
                            ? 'rgba(15, 16, 20, 0.18)'
                            : 'rgba(255, 255, 255, 0.18)',
                    },
                    ...(props.sx || {}),
                }}
                localeText={locale.components.MuiDataGrid.defaultProps.localeText}
                getRowHeight={() => 'auto'}
                onCellClick={onTypeCellClick}
                pageSizeOptions={[10]}
                disableColumnFilter
                initialState={{
                    pagination: {
                        paginationModel: { page: 0, pageSize: 10 }
                    }
                }}
            />
        </Box>
    )
}
