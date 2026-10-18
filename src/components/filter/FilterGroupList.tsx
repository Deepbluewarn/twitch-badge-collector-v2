import React, { useMemo, useState } from "react";
import { useFilterGroupContext } from "@/context/FilterGroup";
import { CompositeFilterElement } from "../../interfaces/filter";
import { useGlobalSettingContext } from "@/context/GlobalSetting";
import FilterDialog, { DialogMode, DialogType } from "./FilterDialog";
import { getAdapter } from '@/platform';
import { rotateFilterType } from "../chip/FilterTypeChip";
import { FilterList, FilterListActions } from "./FilterList";
import { EMPTY_TEST, FilterTesterPanel, TestInput, useFilterTest } from "./FilterTester";
import s from "./FilterGroupList.module.css";
import { Button } from "@/ui";
import { useTranslation } from "react-i18next";

/** 지금 플랫폼의 필터 목록 + 필터 편집 대화상자. 목록 모양은 FilterList, 저장은 필터 그룹 context. */
export function FilterGroupList() {
    const { globalSetting } = useGlobalSettingContext();
    const adapter = getAdapter(globalSetting.platform);
    const { filterGroup, setFilterGroup, upsertCompositeFilter, removeSubFilter, removeFilterField } = useFilterGroupContext();
    const platformFilters = useMemo(() => filterGroup.filter(f => f.platform === globalSetting.platform), [filterGroup, globalSetting.platform]);

    const { t } = useTranslation();
    const [testerOpen, setTesterOpen] = useState(false);
    // 시험 입력은 닫아도 남겨 둔다 — 필터를 고치고 다시 열어 같은 채팅으로 확인하게.
    const [testInput, setTestInput] = useState<TestInput>(EMPTY_TEST);
    const testResult = useFilterTest(testInput, platformFilters, adapter);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogType, setDialogType] = useState<DialogType>(null);
    const [dialogMode, setDialogMode] = useState<DialogMode>(null);
    const [selectedFilterList, setSelectedFilterList] = useState<CompositeFilterElement>();
    const [selectedFilterId, setSelectedFilterId] = useState<string | undefined>('');

    const openFilterDialog = (type: DialogType, filterList: CompositeFilterElement, mode: DialogMode, filterId?: string) => {
        setDialogType(type);
        setSelectedFilterList(filterList);
        setSelectedFilterId(filterId);
        setDialogMode(mode);
        setDialogOpen(true);
    };

    const actions: FilterListActions = {
        editAtom: (row, atomId) => openFilterDialog('filter', row, 'edit', atomId),
        addAtom: (row) => openFilterDialog('filter', row, 'add'),
        removeAtom: (row, atomId) => removeSubFilter(row.id, atomId),
        editChannel: (row) => openFilterDialog('channel', row, row.filterChannelName ? 'edit' : 'add'),
        removeChannel: (row) => {
            removeFilterField(row.id, 'filterChannelId');
            removeFilterField(row.id, 'filterChannelName');
        },
        editNote: (row) => openFilterDialog('note', row, row.filterNote ? 'edit' : 'add'),
        removeNote: (row) => removeFilterField(row.id, 'filterNote'),
        rotateType: (row) => setFilterGroup(rows => rows.map(r => (r.id === row.id ? { ...r, filterType: rotateFilterType(r.filterType) } : r))),
        setColor: (row, color) => upsertCompositeFilter({ ...row, markerColor: color }),
        deleteMany: (ids) => setFilterGroup(rows => rows.filter(r => !ids.has(r.id))),
    };

    return (
        <>
            <div className={`${s.layout} ${testerOpen ? s.testing : ''}`}>
                <FilterList rows={platformFilters} adapter={adapter} actions={actions}
                    test={testerOpen ? testResult.rows : undefined}
                    toolbarExtra={!testerOpen && <Button size="sm" icon="science" onClick={() => setTesterOpen(true)}>{t('filter_test.button')}</Button>} />
                {testerOpen && (
                    <FilterTesterPanel input={testInput} onInput={setTestInput} result={testResult} rules={platformFilters} adapter={adapter} onClose={() => setTesterOpen(false)} />
                )}
            </div>
            <FilterDialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                type={dialogType}
                mode={dialogMode}
                selectedFilterList={selectedFilterList}
                filterId={selectedFilterId}
                onSave={(_type, updatedData) => {
                    if (!updatedData) return;
                    upsertCompositeFilter(updatedData);
                }}
            />
        </>
    );
}
