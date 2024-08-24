import React, { useEffect, useState } from "react";
import { nanoid } from 'nanoid';
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
    GridColDef,
    GridRenderCellParams,
    GridRowId,
    GridToolbarContainer,
    GridToolbarFilterButton,
} from "@mui/x-data-grid";
import TextField from "@mui/material/TextField";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import { badgeUuidFromURL } from "../../utils/utils-common";
import { chipColor, onBadgeTypeChipClick } from "../chip/FilterTypeChip";
import { CustomDataGrid } from "../datagrid/customDataGrid";
import { BadgeInterface, BadgeUrls } from "../../interfaces/chat";
import { ArrayFilterInterface, FilterType } from "../../interfaces/filter";
import { BadgeChannelType } from "../../interfaces/channel";
import { BadgeChannelNameContext, BadgeListChannelContext, useBadgeChannelNameContext, useBadgeListChannelContext } from "../../context/BadgeChannel";
import { useTwitchAPIContext } from "../../context/TwitchAPIContext";
import { Version } from "../../interfaces/api/twitchAPI";
import { useGlobalSettingContext } from "../../context/GlobalSetting";
import RelaxedChip from "../chip/RelaxedChip";
import { useChzzkAPIContext } from "../../context/ChzzkAPIContext";
import { SettingInterface } from "@interfaces/setting";

function CustomToolbar(props: {
    setAfInputRow: React.Dispatch<React.SetStateAction<ArrayFilterInterface[]>>,
    badgesRow: BadgeInterface[],
    selectionModel: GridRowId[],
    setSelectionModel: React.Dispatch<React.SetStateAction<GridRowId[]>>,
    setShowAddButton: React.Dispatch<React.SetStateAction<boolean>>,
    showAddButton: boolean
    badgeListChannel: BadgeChannelType,
    setBadgeListChannel: React.Dispatch<React.SetStateAction<BadgeChannelType>>,
    badgeChannelName: string,
    setBadgeChannelName: React.Dispatch<React.SetStateAction<string>>,
}) {
    const { globalSetting } = useGlobalSettingContext();
    const customToolbarContainer = globalSetting.platform === 'twitch' ? (<CustomToolbarContainer />) : null

    return (
        <BadgeListChannelContext.Provider value={{
            badgeListChannel: props.badgeListChannel,
            setBadgeListChannel: props.setBadgeListChannel
        }}>
            <BadgeChannelNameContext.Provider value={{
                badgeChannelName: props.badgeChannelName,
                setBadgeChannelName: props.setBadgeChannelName
            }}>
                <GridToolbarContainer>
                    <GridToolbarFilterButton />
                    <AddBadgeFilterButton
                        badgesRow={props.badgesRow}
                        setAfInputRow={props.setAfInputRow}
                        selectionModel={props.selectionModel}
                        setSelectionModel={props.setSelectionModel}
                        setShowAddButton={props.setShowAddButton}
                        showAddButton={props.showAddButton} />
                    {customToolbarContainer}
                </GridToolbarContainer>
            </BadgeChannelNameContext.Provider>
        </BadgeListChannelContext.Provider>
    );
}

export default function BadgeList(props: {
    setAfInputRow: React.Dispatch<React.SetStateAction<ArrayFilterInterface[]>>
    setFilterInput: React.Dispatch<React.SetStateAction<ArrayFilterInterface>>
}) {
    const { globalSetting } = useGlobalSettingContext();
    const [advancedFilter, setAdvancedFilter] = useState(globalSetting.advancedFilter);
    const [badgesRow, setBadgesRows] = React.useState<BadgeInterface[]>([]);
    const [selectionModel, setSelectionModel] = React.useState<GridRowId[]>([]);
    const [showAddButton, setShowAddButton] = React.useState(false);
    const [badgeListChannel, setBadgeListChannel] = React.useState<BadgeChannelType>('global');
    const [badgeChannelName, setBadgeChannelName] = React.useState('');
    const [userId, setUserId] = React.useState('');
    const [loading, setLoading] = React.useState(true);
    const { t } = useTranslation();
    const twitchAPI = useTwitchAPIContext();
    const chzzkAPI = useChzzkAPIContext();

    const columns: GridColDef[] = [
        {
            field: 'badgeImage', headerName: t('common.badge'), flex: 0.1, renderCell: (params: GridRenderCellParams<BadgeUrls>) => (
                <img
                    style={{width: '18px', height: '18px'}}
                    src={params.value?.badge_img_url_1x}
                    srcSet={`${params.value?.badge_img_url_1x} 1x, 
                            ${params.value?.badge_img_url_2x} 2x, 
                            ${params.value?.badge_img_url_4x} 4x`}
                />
            )
        },
        { field: 'channel', headerName: t('common.channel'), flex: 0.2 },
        { field: 'note', headerName: t('common.note'), flex: 0.6 },
        { field: 'badgeName', headerName: t('common.badge_name'), flex: 0.6 },
        {
            field: 'filterType', headerName: t('common.condition'), flex: 0.2,
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

    const {data: User} = useQuery(
        ['User', badgeChannelName, globalSetting.platform],
        () => twitchAPI.fetchUser('login', badgeChannelName),
        {
            enabled: badgeChannelName !== '' && globalSetting.platform === 'twitch'
        }
    );

    const {data: GlobalBadges, isSuccess: isGBSuccess, fetchStatus: GBFetchStatus} = useQuery(
        ['GlobalBadges', badgeListChannel, globalSetting.platform],
        () => twitchAPI.fetchGlobalChatBadges(),
        {
            enabled: badgeListChannel === 'global' && globalSetting.platform === 'twitch'
        }
    )

    const {data: ChannelChatBadges, isSuccess: isCBSuccess, fetchStatus: CBFetchStatus} = useQuery(
        ['ChannelChatBadges', badgeListChannel, userId, globalSetting.platform],
        () => twitchAPI.fetchChannelChatBadges(userId),
        {
            enabled: badgeListChannel === 'channel' && userId !== '' && globalSetting.platform === 'twitch'
        }
    )

    const {data: ChzzkBadges, isSuccess: isChzzkSuccess, fetchStatus: ChzzkFetchStatus} = useQuery(
        ['ChzzkBadges', globalSetting.platform],
        async () => chzzkAPI.fetchBadges(),
        {
            enabled: globalSetting.platform === 'chzzk'
        }
    )

    const updateFilterInput = (id: GridRowId) => {
        if(typeof id === 'undefined') return;
        
        const badge = badgesRow.find(badge => badge.id === id.toString());
        if (!badge) return;

        const badgeUUID = 
            globalSetting.platform === 'twitch' ? 
                badgeUuidFromURL(badge.badgeImage.badge_img_url_1x) : 
                badge.badgeImage.badge_img_url_1x;

        props.setFilterInput({
            category: 'badge',
            id: nanoid(),
            type: badge.filterType,
            value: badgeUUID,
            badgeName: `${badge.channel}: ${badge.badgeName}`
        });
    }

    React.useEffect(() => {
        if(!GlobalBadges) return;
    
        const badgesArray = badgesToArray(GlobalBadges);
    
        const badgesRow: BadgeInterface[] = badgesArray.map(badge => {
            return {
                id: `${badge.image_url_1x}-${badge.description}-${badge.key}`,
                badgeImage: {
                    badge_img_url_1x: badge.image_url_1x,
                    badge_img_url_2x: badge.image_url_2x,
                    badge_img_url_4x: badge.image_url_4x,
                },
                channel: 'Global',
                note: badge.description,
                badgeName: badge.title,
                filterType: 'include'
            } as BadgeInterface;
        });
        setLoading(false);
        setBadgesRows(badgesRow);
    }, [GlobalBadges]);    

    React.useEffect(() => {
        if(!User || User.data.length === 0) return;

        setUserId(User.data[0].id);
    }, [User]);

    React.useEffect(() => {
        if(!ChannelChatBadges || (!User || User.data.length === 0)) return;

        const badgesArray = badgesToArray(ChannelChatBadges);
        const channelName = User.data[0].display_name;

        const badgesRow: BadgeInterface[] = badgesArray.map(badge => {
            return {
                id: `${badge.image_url_1x}-${badge.description}-${badge.key}`,
                badgeImage: {
                    badge_img_url_1x: badge.image_url_1x,
                    badge_img_url_2x: badge.image_url_2x,
                    badge_img_url_4x: badge.image_url_4x,
                },
                channel: channelName,
                note: badge.description,
                badgeName: badge.title,
                filterType: 'include'
            } as BadgeInterface;
        });
        setBadgesRows(badgesRow);
    }, [ChannelChatBadges, User]);

    React.useEffect(() => {
        if(GBFetchStatus === 'fetching' || CBFetchStatus === 'fetching' || ChzzkFetchStatus === 'fetching') {
            setLoading(true);
        }else if(GBFetchStatus === 'idle' || CBFetchStatus === 'idle' || ChzzkFetchStatus === 'idle') {
            setLoading(false);
        }
    }, [GBFetchStatus, CBFetchStatus, ChzzkFetchStatus]);

    useEffect(() => {
        if(!ChzzkBadges) return;

        const badgesRow: BadgeInterface[] = ChzzkBadges.map(badge => {
            return {
                id: badge.id,
                badgeImage: {
                    badge_img_url_1x: badge.image,
                    badge_img_url_2x: badge.image,
                    badge_img_url_4x: badge.image,
                },
                channel: 'Global',
                note: badge.name,
                badgeName: badge.name,
                filterType: 'include'
            } as BadgeInterface;
        });
        setBadgesRows(badgesRow);
    }, [ChzzkBadges]);

    useEffect(() => {
        setAdvancedFilter(globalSetting.advancedFilter);
    }, [globalSetting])

    return (
        <CustomDataGrid rows={badgesRow} columns={columns}
            components={{ Toolbar: CustomToolbar }}
            loading={loading}
            componentsProps={{
                toolbar: {
                    badgesRow,
                    setAfInputRow: props.setAfInputRow,
                    selectionModel, setSelectionModel,
                    showAddButton, setShowAddButton,
                    badgeListChannel, setBadgeListChannel,
                    badgeChannelName, setBadgeChannelName,
                    platform: globalSetting.platform
                }
            }}
            onRowSelectionModelChange={(ids) => {
                setShowAddButton(advancedFilter === 'on' && ids.length > 0);
                setSelectionModel(ids);
                updateFilterInput(ids[0]);
            }}
            rowSelectionModel={selectionModel}
            checkboxSelection={advancedFilter === 'on'}
        />
    )
}
function badgesToArray(badges: Map<string, Version>) {
    const res = [];

    for (let [key, version] of badges) {
        let badgeInfo = {
            ...version,
            set_id: key, // The key of the map is used as the set_id
            type: "", // type 정보가 없으므로 빈 문자열로 설정
            key: "", // key 정보가 없으므로 빈 문자열로 설정
            click_action: "", // click_action 정보가 없으므로 빈 문자열로 설정
            last_updated: null, // last_updated 정보가 없으므로 null로 설정
        }

        res.push(badgeInfo);
    }

    return res;
}

function AddSelectedBadges(
    badgesRow: BadgeInterface[],
    setAfInputRow: React.Dispatch<React.SetStateAction<ArrayFilterInterface[]>>,
    selectionModel: GridRowId[],
    setSelectionModel: React.Dispatch<React.SetStateAction<GridRowId[]>>,
    setShowAddButton: React.Dispatch<React.SetStateAction<boolean>>,
    platform: SettingInterface['platform']
) {
    setAfInputRow(list => {
        const newList: ArrayFilterInterface[] = badgesRow.map(badge => {
            const badgeUUID = 
            platform === 'twitch' ? 
                badgeUuidFromURL(badge.badgeImage.badge_img_url_1x) : 
                badge.badgeImage.badge_img_url_1x;

            if (!selectionModel.includes(badge.id)) return;

            return {
                category: 'badge',
                id: nanoid(),
                type: badge.filterType,
                value: badgeUUID,
                badgeName: `${badge.channel}: ${badge.badgeName}`
            } as ArrayFilterInterface;
        }).filter(r => typeof r !== 'undefined') as ArrayFilterInterface[];

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
    badgesRow: BadgeInterface[],
    setAfInputRow: React.Dispatch<React.SetStateAction<ArrayFilterInterface[]>>,
    selectionModel: GridRowId[],
    setSelectionModel: React.Dispatch<React.SetStateAction<GridRowId[]>>,
    setShowAddButton: React.Dispatch<React.SetStateAction<boolean>>,
    showAddButton: boolean
}) {

    if (!props.showAddButton) return null;

    const { t } = useTranslation();
    const { globalSetting } = useGlobalSettingContext();

    return (
        <Stack
            direction='row'
            onClick={() => {
                AddSelectedBadges(
                    props.badgesRow,
                    props.setAfInputRow,
                    props.selectionModel,
                    props.setSelectionModel,
                    props.setShowAddButton,
                    globalSetting.platform,
                )
            }}
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
