import React from "react";
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
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import { BadgeInterface, BadgeUrls } from "../../interfaces/chat";
import { ArrayFilterInterface, FilterType } from "../../interfaces/filter";
import { badgeUuidFromURL } from "../../utils";
import { chipColor, onBadgeTypeChipClick } from "../chip/FilterTypeChip";
import { CustomDataGrid } from "../datagrid/customDataGrid";
import { BadgeChannelType } from "../../interfaces/channel";
import { BadgeChannelNameContext, BadgeListChannelContext, useBadgeChannelNameContext, useBadgeListChannelContext } from "../../context/BadgeChannel";
import { useTwitchAPIContext } from "../../context/TwitchAPIContext";
import { UDGlobalChatBadges } from "../../interfaces/twitchAPI";

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
    setBadgeChannelName: React.Dispatch<React.SetStateAction<string>>
}) {

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
                    <CustomToolbarContainer />
                </GridToolbarContainer>
            </BadgeChannelNameContext.Provider>
        </BadgeListChannelContext.Provider>
    );
}

export default function BadgeList(props: {
    setAfInputRow: React.Dispatch<React.SetStateAction<ArrayFilterInterface[]>>
}) {
    const [badgesRow, setBadgesRows] = React.useState<BadgeInterface[]>([]);
    const [selectionModel, setSelectionModel] = React.useState<GridRowId[]>([]);
    const [showAddButton, setShowAddButton] = React.useState(false);
    const [badgeListChannel, setBadgeListChannel] = React.useState<BadgeChannelType>('global');
    const [badgeChannelName, setBadgeChannelName] = React.useState('');
    const [userId, setUserId] = React.useState('');
    const [loading, setLoading] = React.useState(true);
    const { t } = useTranslation();
    const twitchAPI = useTwitchAPIContext();

    const columns: GridColDef[] = [
        {
            field: 'badgeImage', headerName: t('common.badge'), flex: 0.1, renderCell: (params: GridRenderCellParams<BadgeUrls>) => (
                <img
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
            renderCell: (params: GridRenderCellParams<FilterType>) => {
                if (!params.value) return null;

                return (
                    <Chip
                        label={t(`filter.category.${params.value}`)}
                        color={chipColor(params.value)}
                        onClick={() => onBadgeTypeChipClick(params, setBadgesRows)}
                    />
                )
            }
        },
    ];

    const {data: User} = useQuery(
        ['User', badgeChannelName],
        () => twitchAPI.fetchUser('login', badgeChannelName),
        {
            enabled: badgeChannelName !== ''
        }
    );

    const {data: UDGlobalBadges, isSuccess: isGBSuccess, fetchStatus: GBFetchStatus} = useQuery(
        ['UDGlobalBadges', badgeListChannel],
        () => twitchAPI.fetchUDGlobalChatBadges(),
        {
            enabled: badgeListChannel === 'global'
        }
    );

    const {data: UDChannelChatBadges, isSuccess: isCBSuccess, fetchStatus: CBFetchStatus} = useQuery(
        ['UDChannelChatBadges', badgeListChannel, userId],
        () => twitchAPI.fetchUDChannelChatBadges(userId),
        {
            enabled: badgeListChannel === 'channel' && userId !== ''
        }
    );

    React.useEffect(() => {
        if(!UDGlobalBadges) return;

        const badgesArray = badgesToArray(UDGlobalBadges);

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
    }, [UDGlobalBadges]);

    React.useEffect(() => {
        if(!User) return;

        setUserId(User.data[0].id);
    }, [User]);

    React.useEffect(() => {
        if(!UDChannelChatBadges || !User) return;

        const badgesArray = badgesToArray(UDChannelChatBadges);
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
    }, [UDChannelChatBadges, User]);

    React.useEffect(() => {
        if(GBFetchStatus === 'fetching' || CBFetchStatus === 'fetching') {
            setLoading(true);
        }else if(GBFetchStatus === 'idle' || CBFetchStatus === 'idle') {
            setLoading(false);
        }
    }, [GBFetchStatus, CBFetchStatus]);

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
                    badgeChannelName, setBadgeChannelName
                }
            }}
            onSelectionModelChange={(ids) => {
                setShowAddButton(ids.length > 0);
                setSelectionModel(ids);
            }}
            selectionModel={selectionModel}
        />
    )
}

function badgesToArray(badges: UDGlobalChatBadges) {
    const badgeSets = badges.badge_sets;
    const res = [];

    for (let [type, versions] of Object.entries(badgeSets)) {
        for (let [key, versionObj] of Object.entries(versions)) {
            for (let [key, value] of Object.entries(versionObj)) {
                value.type = type;
                value.key = key;

                if (type === 'subscriber') {
                    let tier: number = 0;
                    if (key.length <= 2) {
                        tier = 1;
                    } else if (key.length === 4 && key[0] === '2') {
                        tier = 2;
                    } else if (key.length === 4 && key[0] === '3') {
                        tier = 3;
                    }
                    value.tier = tier;
                }

                res.push(value)
            }
        }
    }
    return res;
}

function AddSelectedBadges(
    badgesRow: BadgeInterface[],
    setAfInputRow: React.Dispatch<React.SetStateAction<ArrayFilterInterface[]>>,
    selectionModel: GridRowId[],
    setSelectionModel: React.Dispatch<React.SetStateAction<GridRowId[]>>,
    setShowAddButton: React.Dispatch<React.SetStateAction<boolean>>,
) {
    setAfInputRow(list => {
        const newList: ArrayFilterInterface[] = badgesRow.map(badge => {
            const badgeUUID = badgeUuidFromURL(badge.badgeImage.badge_img_url_1x);

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
        const noWhiteSpace = channelName.current.replaceAll(' ', '');

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

    return (
        <Stack
            direction='row'
            onClick={() => {
                AddSelectedBadges(
                    props.badgesRow,
                    props.setAfInputRow,
                    props.selectionModel,
                    props.setSelectionModel,
                    props.setShowAddButton
                )
            }}
            sx={{
                alignItems: 'center',
                padding: '4px'
            }}
        >
            <span className="material-icons-round">add</span>
            <span>{t('common.add_selected')}</span>
        </Stack>
    )
}
