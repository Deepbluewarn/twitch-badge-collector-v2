import React, { useEffect, useState } from 'react';
import { BroadcastChannel } from 'broadcast-channel';
import { useTranslation } from 'react-i18next';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import BadgeList from './filter/BadgeList';
import { ArrayFilterInterface, ArrayFilterMessageInterface } from '../interfaces/filter';
import useChatInfoObjects from '../hooks/useChannelInfo';
import { useArrayFilterContext } from '../context/ArrayFilter';
import FilterInputFormList from './filter/FilterInputFormList';
import FilterInputForm from './filter/FilterInputForm';
import { ArrayFilterList } from './filter/ArrayFilterList';
import { useGlobalSettingContext } from '../context/GlobalSetting';
import Chip from '@mui/material/Chip';
import { Button, Paper } from '@mui/material';
import { SettingInterface } from '@/interfaces/setting';
import { ChannelInfoContext } from '@/context/ChannelInfoContext';
import SocialFooter from './SocialFooter';
import { getDefaultArrayFilter } from '@/utils/utils-common';
import { setBadgeInSimpleFilter, setMultipleBadgesInFilterArray } from './filter/utils/badge-utils';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ChannelIdGuideDialog from './filter/dialog/ChannelIdGuideDialog';

export default function Filter() {
    const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();
    const [advancedFilter, setAdvancedFilter] = React.useState(globalSetting.advancedFilter);
    const { arrayFilter } = useArrayFilterContext();
    const { channelInfoObject, dispatchChannelInfo, channel, setChannel, User } = useChatInfoObjects();
    const [filterInput, setFilterInput] = React.useState<ArrayFilterInterface | undefined>(getDefaultArrayFilter());
    const [filterInputList, setFilterInputList] = React.useState<ArrayFilterInterface[]>([]);
    const filterInputListRef = React.useRef<ArrayFilterInterface[]>([]);
    const filterBroadcastChannel = React.useRef<BroadcastChannel<ArrayFilterMessageInterface>>(new BroadcastChannel('ArrayFilter'));
    const messageId = React.useRef(''); // id 는 extension 에서 생성.
    const { t } = useTranslation();
    const [guideOpen, setGuideOpen] = useState(false);

    const onPlatformChipClick = (platform: SettingInterface['platform']) => {
        dispatchGlobalSetting({ type: 'SET_PLATFORM', payload: platform });
    }

    React.useEffect(() => {
        document.title = `${t('setting.filter_setting')}- TBC`;
    }, []);

    React.useEffect(() => {
        const msg = {
            from: 'filter',
            filter: arrayFilter,
            msgId: messageId.current
        }

        filterBroadcastChannel.current.postMessage(msg);
    }, [arrayFilter]);

    useEffect(() => {
        setAdvancedFilter(() => globalSetting.advancedFilter);
    }, [globalSetting]);

    return (
        <ChannelInfoContext.Provider value={{ channelInfoObject, dispatchChannelInfo, channel, setChannel, User }}>
            <Stack spacing={2} sx={{ 
                    minHeight: '0',
                    margin: '16px',
                }}
            >
                <Card
                    sx={{
                        padding: '16px',
                        flex: '1',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'auto',
                        border: '4px solid',
                        borderColor: globalSetting.platform === 'twitch' ? '#9147ff' : '#00ffa3e6',
                        minWidth: '720px',
                        maxWidth: '1080px',
                    }}
                    className="card"
                    variant='outlined'
                >
                    <Stack
                        spacing={2}
                        sx={{
                            flex: '1 1 auto',
                        }}
                    >
                        <Typography variant="h6">
                            {t('setting.filter.select_platform')}
                        </Typography>

                        <Paper sx={{ p: 1, m: 0 }}>
                            <Stack direction='row' gap={1}>
                                <Chip label='트위치' color={globalSetting.platform === 'twitch' ? 'primary' : 'default'} onClick={() => {onPlatformChipClick('twitch')}} clickable />
                                <Chip label='치지직' color={globalSetting.platform === 'chzzk' ? 'primary' : 'default'} onClick={() => {onPlatformChipClick('chzzk')}} clickable />
                            </Stack>
                        </Paper>
                        
                        <Typography variant="h6">
                            {t('setting.filter.filter_list')}
                        </Typography>

                        <ArrayFilterList />

                        <Stack direction={'row'} justifyContent={'space-between'} alignItems={'flex-end'}>
                            <Stack gap={2}> 
                                <Typography variant="h6">
                                    {t('setting.filter.filter_add')}
                                </Typography>
                                {
                                    advancedFilter === 'on' ?
                                        (
                                            <Typography variant='subtitle2'>
                                                {t('setting.filter.filter_add_subtitle')}
                                            </Typography>
                                        ) : null
                                }
                            </Stack>

                            <Stack direction="row" alignItems="center" spacing={1}>
                                <InfoOutlinedIcon color="primary" />
                                <Typography variant="body2" color="textSecondary">
                                    채널 별 필터 설정이 가능합니다.
                                </Typography>
                                <Button size="small" onClick={() => { setGuideOpen(true) }}>자세히 보기</Button>
                            </Stack>
                        </Stack>
                        {
                            advancedFilter === 'on' ? (
                                <FilterInputFormList
                                    afInputRow={filterInputList}
                                    setAfInputRow={setFilterInputList}
                                    filterInputListRef={filterInputListRef}
                                />
                            ) : (
                                <FilterInputForm
                                    filterInput={filterInput}
                                    setFilterInput={setFilterInput}
                                />
                            )
                        }

                        <Typography variant="h6">
                            {t('setting.filter.select_badges')}
                        </Typography>

                        <BadgeList
                            multiple={globalSetting.advancedFilter === 'on'}
                            onBadgeSelect={(badge) => {
                                setBadgeInSimpleFilter(badge, globalSetting.platform, setFilterInput);
                            }}
                            onMultiBadgesSelect={(badges) => {
                                setMultipleBadgesInFilterArray(badges, globalSetting.platform, setFilterInputList);
                            }}
                        />
                    </Stack>
                </Card>
                <SocialFooter />
            </Stack>
            {/* <EncorageDonationDialog open={dialogOpen} onClose={() => {setDialogOpen(false)}}/> */}
            <ChannelIdGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />
        </ChannelInfoContext.Provider>
    )
}