import React, { useEffect, useMemo, useRef, useState } from "react";
import { useFilterGroupContext } from "@/context/FilterGroup";
import { CompositeFilterElement } from "../../interfaces/filter";
import { useGlobalSettingContext } from "@/context/GlobalSetting";
import FilterDialog, { DialogMode, DialogType } from "./FilterDialog";
import { getAdapter } from '@/platform';
import { rotateFilterType } from "../chip/FilterTypeChip";
import { FilterList, FilterListActions } from "./FilterList";
import { EMPTY_TEST, FilterTesterPanel, TestInput, useFilterTest } from "./FilterTester";
import s from "./FilterGroupList.module.css";
import { Button, Select } from "@/ui";
import { fetchChzzkChannel, hasChzzkApiAccess } from "@/api/chzzk-channel";
import { useTranslation } from "react-i18next";

/** 지금 플랫폼의 필터 목록 + 필터 편집 대화상자. 목록 모양은 FilterList, 저장은 필터 그룹 context. */
export function FilterGroupList() {
    const { globalSetting } = useGlobalSettingContext();
    const adapter = getAdapter(globalSetting.platform);
    const { filterGroup, setFilterGroup, upsertCompositeFilter, removeSubFilter, removeFilterField } = useFilterGroupContext();
    const platformFilters = useMemo(() => filterGroup.filter(f => f.platform === globalSetting.platform), [filterGroup, globalSetting.platform]);

    // 채널별 보기 — 목록만 거른다(필터 시험은 늘 전체 필터로).
    const [channelView, setChannelView] = useState<string>(VIEW_ALL);
    const channels = useMemo(() => {
        const m = new Map<string, string>();
        platformFilters.forEach(f => { if (f.filterChannelId) m.set(f.filterChannelId, f.filterChannelName || f.filterChannelId); });
        return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
    }, [platformFilters]);
    useEffect(() => {
        if (channelView !== VIEW_ALL && channelView !== VIEW_NONE && !channels.some(c => c.value === channelView)) setChannelView(VIEW_ALL);
    }, [channels, channelView]);
    const visibleFilters = useMemo(() => channelView === VIEW_ALL ? platformFilters
        : platformFilters.filter(f => (f.filterChannelId || VIEW_NONE) === channelView), [platformFilters, channelView]);

    useChannelImages(globalSetting.platform, platformFilters, setFilterGroup);

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
            removeFilterField(row.id, 'filterChannelImage');
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
                <FilterList rows={visibleFilters} adapter={adapter} actions={actions}
                    test={testerOpen ? testResult.rows : undefined}
                    toolbarExtra={<>
                        {channels.length > 0 && (
                            <Select size="sm" value={channelView} onChange={setChannelView} aria-label={t('common.channel')}
                                options={[{ value: VIEW_ALL, label: t('filter_list.channel_all') }, { value: VIEW_NONE, label: t('filter_list.channel_none') }, ...channels]} />
                        )}
                        {!testerOpen && <Button size="sm" icon="science" onClick={() => setTesterOpen(true)}>{t('filter_test.button')}</Button>}
                    </>} />
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

const VIEW_ALL = '__all__';
const VIEW_NONE = '__none__';

/**
 * 채널 사진이 없는 치지직 필터(검색 전에 만든 것)에 사진을 채운다. 채널 검색 권한을 받은 뒤에만.
 * 한 번 물어본 채널은 이 페이지에서 다시 묻지 않는다(사진이 없는 채널도 있다).
 */
function useChannelImages(platform: string, filters: CompositeFilterElement[], setFilterGroup: ReturnType<typeof useFilterGroupContext>['setFilterGroup']) {
    const tried = useRef(new Set<string>());
    const missing = useMemo(() => platform !== 'chzzk' ? [] : [...new Set(filters
        .filter(f => f.filterChannelId && !f.filterChannelImage).map(f => f.filterChannelId!))]
        .filter(id => !tried.current.has(id)), [platform, filters]);
    const key = missing.join(',');
    useEffect(() => {
        if (!missing.length) return;
        let cancelled = false;
        (async () => {
            if (!(await hasChzzkApiAccess())) return;
            const images = new Map<string, string>();
            for (const id of missing) {
                tried.current.add(id);
                try {
                    const c = await fetchChzzkChannel(id);
                    if (c.imageUrl) images.set(id, c.imageUrl);
                } catch { /* 없는 채널 등 — 이름만 둔다 */ }
                if (cancelled) return;
            }
            if (!images.size) return;
            setFilterGroup(rows => rows.map(r => r.platform === 'chzzk' && r.filterChannelId && !r.filterChannelImage && images.has(r.filterChannelId)
                ? { ...r, filterChannelImage: images.get(r.filterChannelId) } : r));
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
}
