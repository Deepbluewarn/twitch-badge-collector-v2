import React, { useEffect, useState } from "react";
import { nanoid } from 'nanoid';
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
    DataGrid,
    GridColDef,
    GridRenderCellParams,
    GridRowId,
    Toolbar,
} from "@mui/x-data-grid";
import TextField from "@mui/material/TextField";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import { chipColor, onBadgeTypeChipClick } from "../chip/FilterTypeChip";
// import { CustomDataGrid } from "@/components/datagrid/customDataGrid";
import { BadgeInterface, BadgeUrls } from "../../interfaces/chat";
import { AtomicFilterElement, FilterType } from "../../interfaces/filter";
import { BadgeChannelType } from "../../interfaces/channel";
import { BadgeChannelNameContext, BadgeListChannelContext, useBadgeChannelNameContext, useBadgeListChannelContext } from "../../context/BadgeChannel";
import { useGlobalSettingContext } from "../../context/GlobalSetting";
import RelaxedChip from "../chip/RelaxedChip";
import { SettingInterface } from "@/interfaces/setting";
import { CustomDataGrid } from "../datagrid/customDataGrid";
import { getAdapter } from "@/platform";

function CustomToolbar(props: {
    onMultiBadgesSelect: () => void;
    selectionModel: Set<GridRowId>;
    setSelectionModel: React.Dispatch<React.SetStateAction<Set<GridRowId>>>;
    setShowAddButton: React.Dispatch<React.SetStateAction<boolean>>;
    showAddButton: boolean;
    badgeListChannel: BadgeChannelType;
    setBadgeListChannel: React.Dispatch<React.SetStateAction<BadgeChannelType>>;
    badgeChannelName: string;
    setBadgeChannelName: React.Dispatch<React.SetStateAction<string>>;
}) {
    const { globalSetting } = useGlobalSettingContext();
    const adapter = getAdapter(globalSetting.platform);
    const customToolbarContainer = adapter.supportsChannelBadgeQuery ? (<CustomToolbarContainer />) : null

    return (
        <BadgeListChannelContext.Provider value={{
            badgeListChannel: props.badgeListChannel,
            setBadgeListChannel: props.setBadgeListChannel
        }}>
            <BadgeChannelNameContext.Provider value={{
                badgeChannelName: props.badgeChannelName,
                setBadgeChannelName: props.setBadgeChannelName
            }}>
                <Box sx={{ p: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
                    <AddBadgeFilterButton
                        onMultiBadgesSelect={props.onMultiBadgesSelect}
                        selectionModel={props.selectionModel}
                        setSelectionModel={props.setSelectionModel}
                        setShowAddButton={props.setShowAddButton}
                        showAddButton={props.showAddButton} />
                    {customToolbarContainer}
                </Box>
            </BadgeChannelNameContext.Provider>
        </BadgeListChannelContext.Provider>
    );
}

export interface SelectedBadgeCallbacks {
    // 단일 배지 선택 시 호출
    onBadgeSelect?: (badge: BadgeInterface) => void;
    // 다중 배지 선택 후 추가 버튼 클릭 시 호출
    onMultiBadgesSelect?: (badges: BadgeInterface[]) => void;
    multiple?: boolean;
}

export default function BadgeList({
    onBadgeSelect,
    onMultiBadgesSelect,
    multiple = false // 기본값 설정
}: SelectedBadgeCallbacks) {
    const { globalSetting } = useGlobalSettingContext();
    const adapter = getAdapter(globalSetting.platform);
    const [badgesRow, setBadgesRows] = React.useState<BadgeInterface[]>([]);
    const [selectionModel, setSelectionModel] = React.useState<Set<GridRowId>>(new Set());
    const [showAddButton, setShowAddButton] = React.useState(false);
    const [badgeListChannel, setBadgeListChannel] = React.useState<BadgeChannelType>('global');
    const [badgeChannelName, setBadgeChannelName] = React.useState('');
    const { t } = useTranslation();

    const columns: GridColDef[] = [
        {
            field: 'badgeImage', headerName: t('common.badge'), flex: 0.1, display: 'flex',
            renderCell: (params: GridRenderCellParams<BadgeUrls>) => (
                <img
                    style={{width: '18px', height: '18px'}}
                    src={params.value?.badge_img_url_1x}
                    srcSet={`${params.value?.badge_img_url_1x} 1x, 
                            ${params.value?.badge_img_url_2x} 2x, 
                            ${params.value?.badge_img_url_4x} 4x`}
                />
            )
        },
        { field: 'channel', headerName: t('common.channel'), flex: 0.2, display: 'flex', },
        { field: 'note', headerName: t('common.note'), flex: 0.6, display: 'flex', },
        { field: 'badgeName', headerName: t('common.badge_name'), flex: 0.6, display: 'flex', },
        {
            field: 'filterType', headerName: t('common.condition'), flex: 0.2, display: 'flex',
            renderCell: (params: GridRenderCellParams<any, FilterType>) => {
                if (!params.value) return null;

                return (
                    <RelaxedChip
                        label={t(`filter.category.${params.value}`)}
                        color={chipColor(params.value)}
                        onClick={() => onBadgeTypeChipClick(params, setBadgesRows)}
                    />
                )
            }
        },
    ];

    // platform 분기 없이 단일 useQuery — adapter가 모든 플랫폼/스코프 처리.
    const channelScopeNeedsInput = adapter.supportsChannelBadgeQuery && badgeListChannel === 'channel';
    const { data: fetchedBadges, isFetching: loading } = useQuery({
        queryKey: ['badges', globalSetting.platform, badgeListChannel, badgeChannelName],
        queryFn: () => adapter.fetchBadges({
            scope: badgeListChannel === 'channel' ? 'channel' : 'global',
            channelLogin: badgeListChannel === 'channel' ? badgeChannelName : undefined,
        }),
        enabled: !channelScopeNeedsInput || badgeChannelName !== '',
    });

    const handleBadgeSelect = (id: GridRowId) => {
        if (typeof id === 'undefined' || !onBadgeSelect) return;

        const badge = badgesRow.find(badge => badge.id === id.toString());
        if (!badge) return;

        onBadgeSelect(badge);
    }

    // 다중 배지 선택 처리 함수
    const handleMultiBadgesSelect = () => {
        if (!onMultiBadgesSelect) return;

        // 현재 저장된 selectionModel을 사용하여 실제 선택된 배지 계산
        const selectedBadges = Array.from(selectionModel).map(id => 
            badgesRow.find(badge => badge.id === id)
        ).filter(badge => badge !== undefined) as BadgeInterface[];

        onMultiBadgesSelect(selectedBadges);

        setShowAddButton(false);
        setSelectionModel(new Set());
    }

    // adapter.fetchBadges가 BadgeInterface[]로 정규화해서 반환하므로
    // 별도 normalize 단계 없이 바로 state로 동기화. (chip 클릭으로 한 row의
    // filterType이 바뀌는 등 로컬 mutation을 허용하기 위해 state로 유지.)
    React.useEffect(() => {
        if (fetchedBadges) setBadgesRows(fetchedBadges);
    }, [fetchedBadges]);

    // CustomToolbar를 래핑하는 컴포넌트
    const WrappedCustomToolbar = () => (
        <CustomToolbar
            onMultiBadgesSelect={handleMultiBadgesSelect}
            selectionModel={selectionModel}
            setSelectionModel={setSelectionModel}
            setShowAddButton={setShowAddButton}
            showAddButton={showAddButton}
            badgeListChannel={badgeListChannel}
            setBadgeListChannel={setBadgeListChannel}
            badgeChannelName={badgeChannelName}
            setBadgeChannelName={setBadgeChannelName}
        />
    );

    return (
        <CustomDataGrid
            rows={badgesRow} 
            columns={columns}
            slots={{ toolbar: WrappedCustomToolbar }}
            showToolbar={multiple}
            loading={loading}
            onRowSelectionModelChange={(selectionModel, details) => {
                console.log('selectionModel" ', selectionModel)
                console.log('details" ', details)
                
                // v7의 새로운 selection model 처리
                let actualSelectedCount = 0;
                let actualSelectedIds = new Set<GridRowId>();

                if (selectionModel.type === 'include') {
                    // include 타입: ids에 포함된 항목들의 개수
                    actualSelectedCount = selectionModel.ids.size;
                    actualSelectedIds = selectionModel.ids;
                } else {
                    // exclude 타입: 전체에서 ids에 제외된 항목들을 뺀 개수
                    actualSelectedCount = badgesRow.length - selectionModel.ids.size;
                    // exclude 타입에서는 선택된 항목들을 계산
                    actualSelectedIds = new Set(
                        badgesRow
                            .filter(badge => !selectionModel.ids.has(badge.id))
                            .map(badge => badge.id)
                    );
                }

                setShowAddButton(multiple && actualSelectedCount > 0);
                setSelectionModel(actualSelectedIds);
                
                // 단일 선택 시 콜백 호출
                if (actualSelectedCount === 1) {
                    const selectedId = Array.from(actualSelectedIds)[0];
                    handleBadgeSelect(selectedId);
                }
            }}
            checkboxSelection={multiple}
        />
    )
}
function AddSelectedBadges(
    badgesRow: BadgeInterface[],
    setAfInputRow: React.Dispatch<React.SetStateAction<AtomicFilterElement[]>>,
    selectionModel: GridRowId[],
    setSelectionModel: React.Dispatch<React.SetStateAction<GridRowId[]>>,
    setShowAddButton: React.Dispatch<React.SetStateAction<boolean>>,
    platform: SettingInterface['platform']
) {
    setAfInputRow(list => {
        const newList: AtomicFilterElement[] = badgesRow.map(badge => {
            const badgeUUID = getAdapter(platform).getBadgeIdentity(badge.badgeImage.badge_img_url_1x);

            if (!selectionModel.includes(badge.id)) return;

            return {
                category: 'badge',
                id: nanoid(),
                type: badge.filterType,
                value: badgeUUID,
                badgeName: `${badge.channel}: ${badge.badgeName}`,
                badgeSetId: badge.badgeSetId,
                channelLogin: badge.channelLogin,
                channelId: badge.channelId,
            } as AtomicFilterElement;
        }).filter(r => typeof r !== 'undefined') as AtomicFilterElement[];

        return [...list, ...newList];
    });

    setShowAddButton(false);
    setSelectionModel([]);
}

function ChannelInput() {
    const { badgeListChannel, setBadgeListChannel } = useBadgeListChannelContext();
    const { badgeChannelName, setBadgeChannelName } = useBadgeChannelNameContext();
    const channelName = React.useRef('');
    const { t } = useTranslation();

    const onBCButtonClicked = () => {
        setBadgeListChannel(badgeListChannel === 'global' ? 'channel' : 'global');
    }

    const BadgeChannelButton = () => {
        return (
            <>
                <Button disabled={badgeListChannel === 'global'} onClick={onBCButtonClicked}>{t('common.global')}</Button>
                <Button disabled={badgeListChannel === 'channel'} onClick={onBCButtonClicked}>{t('common.channel')}</Button>
            </>
        )
    }
    const onSearchButtonClicked = () => {
        let noWhiteSpace = channelName.current;

        while(noWhiteSpace.includes(' ')) {
            noWhiteSpace = noWhiteSpace.replace(' ', '');
        }

        setBadgeChannelName(noWhiteSpace);
    }
    return (
        <Stack direction='row' sx={{justifyContent: 'flex-end'}}>
            <BadgeChannelButton />
            {
                badgeListChannel === 'channel' ?
                    (
                        <>
                            <TextField 
                                id="outlined-basic" 
                                label={t('common.channel_name')}
                                variant="outlined" 
                                size="small" 
                                onChange={(e) => {channelName.current = e.target.value}}
                            />
                            <Button onClick={onSearchButtonClicked}>
                                {t('common.search')}
                            </Button>
                        </>
                    ) : null
            }
        </Stack>
    )
}

function CustomToolbarContainer() {
    return (
        <Box sx={{
            flex: '1',
            margin: '4px'
        }}>
            <ChannelInput />
        </Box>
    )
}

function AddBadgeFilterButton(props: {
    showAddButton: boolean;
    onMultiBadgesSelect: () => void;
    selectionModel: Set<GridRowId>;
    setSelectionModel: React.Dispatch<React.SetStateAction<Set<GridRowId>>>;
    setShowAddButton: React.Dispatch<React.SetStateAction<boolean>>;
}) {
    const { t } = useTranslation();

    if (!props.showAddButton) return null;

    return (
        <Stack
            direction='row'
            onClick={props.onMultiBadgesSelect}
            sx={{
                alignItems: 'center',
                padding: '4px',
                cursor: 'pointer',
            }}
        >
            <span className="material-icons-round">add</span>
            <span>{t('common.add_selected')}</span>
        </Stack>
    )
}
