import { Chip, ChipProps } from "@mui/material";
import { GridCellParams } from "@mui/x-data-grid";
import { BadgeInterface } from "../../interfaces/chat";
import { ArrayFilterListInterface, FilterType, TypeArr } from "../../interfaces/filter";

export function onArrayFilterTypeChipClick(params: GridCellParams<any, FilterType>,
    setRows: React.Dispatch<React.SetStateAction<ArrayFilterListInterface[]>>) {
    if (params.field === 'filterType' && typeof params.value !== 'undefined') {
        const newType = rotateFilterType(params.value);

        setRows((rows) => {
            return rows.map(({ filterType, ...rows }) => ({
                ...rows,
                filterType: rows.id === params.id ? newType : filterType
            }));
        });
    }
}
export function onBadgeTypeChipClick(params: GridCellParams<any, FilterType>,
    setRows: React.Dispatch<React.SetStateAction<BadgeInterface[]>>) {
    if (params.field === 'filterType' && typeof params.value !== 'undefined') {
        const newType = rotateFilterType(params.value);

        setRows((rows) => {
            return rows.map(({ filterType, ...rows }) => ({
                ...rows,
                filterType: rows.id === params.id ? newType : filterType
            }))
        });
    }
}

export function rotateFilterType(current: FilterType) {
    const current_index = TypeArr.indexOf(current);
    if (current_index === -1) return TypeArr[0];

    const nextIndex = (current_index + 1) % TypeArr.length;
    return TypeArr[nextIndex] as FilterType;
}
export function chipColor(type: FilterType) {
    return type === 'include' ? 'success' : type === 'exclude' ? 'error' : 'default';
}
export default function FilterTypeChip(props: ChipProps) {
    return (
        <Chip {...props} size="small" color="error" />
    )
}