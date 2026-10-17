import { useTranslation } from 'react-i18next';
import { Field, Segmented, Select } from '@/ui';
import {
    FilterCategory,
    FilterType
} from "../../interfaces/filter";
import s from './FilterAddDialog.module.css';

export type FilterSelectorType = 'category' | 'type';

type SelectorProps<T> = {
    value: T;
    onChange: (value: T) => void;
};

export function FilterTypeSelector({ value, onChange }: SelectorProps<FilterType>) {
    const { t } = useTranslation();

    return (
        <Field label={t('common.condition')}>
            <Select<FilterType>
                value={value}
                onChange={onChange}
                style={{ minWidth: 120 }}
                options={[
                    { value: 'include', label: t('filter.category.include') },
                    { value: 'exclude', label: t('filter.category.exclude') },
                    { value: 'sleep', label: t('filter.category.sleep') },
                ]}
            />
        </Field>
    )
}

export function FilterCategorySelector({ value, onChange }: SelectorProps<FilterCategory>) {
    const { t } = useTranslation();

    return (
        <Field label={t('common.category')}>
            <Select<FilterCategory>
                className="filter-category"
                value={value}
                onChange={onChange}
                style={{ minWidth: 120 }}
                options={[
                    { value: 'name', label: t('common.nickname') },
                    { value: 'keyword', label: t('common.keyword') },
                ]}
            />
        </Field>
    )
}

/** 고급 모드: 닉네임 요소는 하나만. 다른 줄에 이미 닉네임이 있으면 닉네임 항목을 비활성으로. */
export function AdvancedFilterCategorySelector({ value, onChange, nameFilterAvail }: SelectorProps<FilterCategory> & {
    nameFilterAvail?: boolean;
}) {
    const { t } = useTranslation();
    const options: { value: FilterCategory; label: string; disabled?: boolean }[] = [
        { value: 'name', label: t('common.nickname'), disabled: nameFilterAvail && value !== 'name' },
        { value: 'keyword', label: t('common.keyword') },
    ];

    return (
        <Field label={t('common.category')}>
            <Select<FilterCategory>
                className="filter-category"
                value={value}
                onChange={onChange}
                style={{ minWidth: 120 }}
                options={options}
            />
        </Field>
    )
}

/** 포함 / 제외 / 꺼짐 토글 묶음 — 고른 칸은 상태 색. */
export function FilterTypeSegmented({ value, onChange }: SelectorProps<FilterType>) {
    const { t } = useTranslation();

    return (
        <Field label={t('common.condition')}>
            <Segmented<FilterType>
                className={s.typeSeg}
                label={t('common.condition')}
                value={value}
                onChange={onChange}
                options={[
                    { value: 'include', icon: 'check', label: t('filter.category.include') },
                    { value: 'exclude', icon: 'block', label: t('filter.category.exclude') },
                    { value: 'sleep', icon: 'visibility_off', label: t('filter.category.sleep') },
                ]}
            />
        </Field>
    )
}
