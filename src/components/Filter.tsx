import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import { FilterGroupList } from './filter/FilterGroupList';
import { useGlobalSettingContext } from '../context/GlobalSetting';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Button from '@mui/material/Button';
import AddIcon from '@mui/icons-material/Add';
import { SettingInterface } from '@/interfaces/setting';
import SocialFooter from './SocialFooter';
import FilterAddDialog from './filter/FilterAddDialog';
import { getAdapter } from '@/platform';

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
                    {/* 플랫폼 Tabs — scrollable이라 사용자 정의 플랫폼이 추가돼도(고급 모드)
                        N개까지 깨지지 않음. 활성 탭 indicator는 해당 플랫폼 brand color. */}
                    <Tabs
                        value={globalSetting.platform}
                        onChange={onPlatformChange}
                        variant="scrollable"
                        scrollButtons="auto"
                        allowScrollButtonsMobile
                        sx={{
                            borderBottom: 1,
                            borderColor: 'divider',
                            '& .MuiTabs-indicator': {
                                backgroundColor: getAdapter(globalSetting.platform).brandColor,
                                height: 3,
                            },
                            '& .MuiTab-root': {
                                fontSize: '0.95rem',
                                fontWeight: 500,
                                textTransform: 'none',
                                minWidth: 120,
                            },
                            '& .Mui-selected': {
                                color: 'text.primary',
                            },
                        }}
                    >
                        <Tab value="twitch" label={getAdapter('twitch').displayName} />
                        <Tab value="chzzk" label={getAdapter('chzzk').displayName} />
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
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={() => setAddOpen(true)}
                            >
                                {t('setting.filter.filter_add')}
                            </Button>
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