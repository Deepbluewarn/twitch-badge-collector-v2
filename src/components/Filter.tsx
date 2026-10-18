import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterGroupList } from './filter/FilterGroupList';
import { ImportFilter, ExportFilter } from './filter/FilterIO';
import { useGlobalSettingContext } from '../context/GlobalSetting';
import { SettingInterface } from '@/interfaces/setting';
import SocialFooter from './SocialFooter';
import FilterAddDialog from './filter/FilterAddDialog';
import { Button, Card, Stack, Tabs } from '@/ui';

export default function Filter() {
    const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();
    const { t } = useTranslation();
    const [addOpen, setAddOpen] = useState(false);

    React.useEffect(() => {
        document.title = `${t('setting.filter_setting')}- TBC`;
    }, []);

    return (
        <>
            {/* 페이지 중앙 정렬 — 카드는 자연 크기, 양옆/위아래 여백을 가져 가운데 자리. */}
            <Stack gap={16} justify="center" style={{ minHeight: '100vh', maxWidth: 1080, width: '100%', margin: '0 auto', padding: 16 }}>
                <Card style={{ display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
                    <Tabs<SettingInterface['platform']>
                        value={globalSetting.platform}
                        onChange={platform => dispatchGlobalSetting({ type: 'SET_PLATFORM', payload: platform })}
                        items={[
                            { value: 'twitch', label: t('platform.twitch') },
                            { value: 'chzzk', label: t('platform.chzzk') },
                        ]}
                    />
                    <Stack gap={16} style={{ padding: 16 }}>
                        <Stack dir="row" justify="space-between" align="center" gap={16} wrap>
                            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em' }}>
                                {t('setting.filter.filter_list')}
                            </h1>
                            <Stack dir="row" gap={8} align="center" justify="flex-end" wrap>
                                <ImportFilter />
                                <ExportFilter />
                                <Button variant="primary" icon="add" onClick={() => setAddOpen(true)}>
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
    );
}
