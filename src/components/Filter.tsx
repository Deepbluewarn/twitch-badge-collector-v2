import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import { FilterGroupList } from './filter/FilterGroupList';
import { ImportFilter, ExportFilter } from './filter/FilterIO';
import { useGlobalSettingContext } from '../context/GlobalSetting';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Button from '@mui/material/Button';
import AddIcon from '@mui/icons-material/Add';
import { SettingInterface } from '@/interfaces/setting';
import SocialFooter from './SocialFooter';
import FilterAddDialog from './filter/FilterAddDialog';

export default function Filter() {
    const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();
    const { t } = useTranslation();
    const [addOpen, setAddOpen] = useState(false);

    const onPlatformChange = (_e: React.SyntheticEvent, platform: SettingInterface['platform']) => {
        dispatchGlobalSetting({ type: 'SET_PLATFORM', payload: platform });
    }

    React.useEffect(() => {
        document.title = `${t('setting.filter_setting')}- TBC`;
    }, []);

    return (
        <>
            {/* 페이지 중앙 정렬 — Card는 자연 크기, 양옆/위아래 여백을 가져 가운데 자리. */}
            <Stack
                spacing={2}
                sx={{
                    minHeight: '100vh',
                    maxWidth: 1080,
                    width: '100%',
                    margin: '0 auto',
                    padding: 2,
                    boxSizing: 'border-box',
                    justifyContent: 'center',
                }}
            >
                <Card
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}
                    className="card"
                    variant="outlined"
                >
                    {/* 플랫폼 Tabs — scrollable이라 사용자 정의 플랫폼이 추가돼도(고급 모드) N개까지 깨지지 않음.
                        모양(노란 밑줄·굵은 글자)은 테마. */}
                    <Tabs
                        value={globalSetting.platform}
                        onChange={onPlatformChange}
                        variant="scrollable"
                        scrollButtons="auto"
                        allowScrollButtonsMobile
                        sx={{ borderBottom: 1, borderColor: 'divider', '& .MuiTab-root': { minWidth: 120 } }}
                    >
                        <Tab value="twitch" label={t('platform.twitch')} />
                        <Tab value="chzzk" label={t('platform.chzzk')} />
                    </Tabs>

                    <Stack
                        spacing={2}
                        sx={{
                            padding: '16px',
                        }}
                    >
                        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
                            <Typography variant="h6">
                                {t('setting.filter.filter_list')}
                            </Typography>
                            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" justifyContent="flex-end">
                                <ImportFilter />
                                <ExportFilter />
                                <Button
                                    variant="contained"
                                    startIcon={<AddIcon />}
                                    onClick={() => setAddOpen(true)}
                                >
                                    {t('setting.filter.filter_add')}
                                </Button>
                            </Stack>
                        </Stack>

                        <FilterGroupList />
                    </Stack>
                </Card>
                <SocialFooter />
            </Stack>
            <FilterAddDialog open={addOpen} onClose={() => setAddOpen(false)} />
        </>
    )
}