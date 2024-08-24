import { useTranslation } from 'react-i18next';
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select, { SelectProps } from '@mui/material/Select';
import {
    ArrayFilterCategory,
    FilterType
} from "../../interfaces/filter";

interface ArrayFilterTypeSelector extends SelectProps<ArrayFilterCategory> {
    nameFilterAvail?: boolean;
}
export type ArrayFilterSelectorType = 'category' | 'type';

export function ArrayFilterTypeSelector(props: SelectProps<FilterType>) {
    const { t } = useTranslation();

    return (
        <FormControl sx={{ minWidth: 120 }}>
            <InputLabel id="arrayFilterType">{t('common.condition')}</InputLabel>
            <Select
                labelId="arrayFilterType"
                label={t('common.condition')}
                size="small"
                {...props}
            >
                <MenuItem value='include'>{t('filter.category.include')}</MenuItem>
                <MenuItem value='exclude'>{t('filter.category.exclude')}</MenuItem>
                <MenuItem value='sleep'>{t('filter.category.sleep')}</MenuItem>
            </Select>
        </FormControl>
    )
}

export function FilterCategorySelector(props: SelectProps<ArrayFilterCategory>) {
    const { t } = useTranslation();

    return (
        <FormControl sx={{ minWidth: 120 }} size="small">
            <InputLabel id="filter-category-label">{t('common.category')}</InputLabel>
            <Select
                labelId="filter-category-label"
                className="filter-category"
                label={t('common.category')}
                {...props}
            >
                <MenuItem value='name'>{t('common.nickname')}</MenuItem>
                <MenuItem value='keyword'>{t('common.keyword')}</MenuItem>
            </Select>
        </FormControl>
    )
}
export function ArrayFilterCategorySelector(props: ArrayFilterTypeSelector) {
    const { t } = useTranslation();

    const {nameFilterAvail, ...rest} = props;

    return (
        <FormControl sx={{ minWidth: 120 }} size="small">
            <InputLabel id="filter-category-label">{t('common.category')}</InputLabel>
            <Select
                labelId="filter-category-label"
                className="filter-category"
                label={t('common.category')}
                {...rest}
            >
                <MenuItem disabled={props.nameFilterAvail} value='name'>{t('common.nickname')}</MenuItem>
                <MenuItem value='keyword'>{t('common.keyword')}</MenuItem>
            </Select>
        </FormControl>
    )
}
