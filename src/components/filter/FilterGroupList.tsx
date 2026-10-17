import React, { useMemo, useState } from "react";
import { useFilterGroupContext } from "@/context/FilterGroup";
import { CompositeFilterElement } from "../../interfaces/filter";
import { useGlobalSettingContext } from "@/context/GlobalSetting";
import FilterDialog, { DialogMode, DialogType } from "./FilterDialog";
import { getAdapter } from '@/platform';
import { rotateFilterType } from "../chip/FilterTypeChip";
import { FilterList, FilterListActions } from "./FilterList";

/** 지금 플랫폼의 필터 목록 + 필터 편집 대화상자. 목록 모양은 FilterList, 저장은 필터 그룹 context. */
export function FilterGroupList() {
    const { globalSetting } = useGlobalSettingContext();
    const adapter = getAdapter(globalSetting.platform);
    const { filterGroup, setFilterGroup, upsertCompositeFilter, removeSubFilter, removeFilterField } = useFilterGroupContext();
    const platformFilters = useMemo(() => filterGroup.filter(f => f.platform === globalSetting.platform), [filterGroup, globalSetting.platform]);

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
            <FilterList rows={platformFilters} adapter={adapter} actions={actions} />
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
