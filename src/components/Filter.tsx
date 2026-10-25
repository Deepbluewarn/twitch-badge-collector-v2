import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterGroupList } from './filter/FilterGroupList';
import { ImportFilter, ExportFilter } from './filter/FilterIO';
import { useGlobalSettingContext } from '../context/GlobalSetting';
import { SettingInterface } from '@/interfaces/setting';
import FilterAddDialog from './filter/FilterAddDialog';
import { Button, Segmented } from '@/ui';
import { SectionTitle, SettingRow, SettingsCard } from './settings/SettingsUI';
import s from './Filter.module.css';

/** 필터 설정 — 플랫폼은 설정 줄, 목록은 제목 오른쪽 동작 버튼 + 카드. 플랫폼 색은 포인트로만(선택 칸, 카드 위 띠, 제목 옆 칩). */
export default function Filter() {
    const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();
    const { t } = useTranslation();
    const [addOpen, setAddOpen] = useState(false);
    const platform = globalSetting.platform;

    React.useEffect(() => {
        document.title = `${t('setting.filter_setting')}- TBC`;
    }, []);

    const option = (p: SettingInterface['platform']) => ({
        value: p,
        label: <span className={s.option}><i data-platform={p} />{t(`platform.${p}`)}</span>,
    });

    return (
        <div className={s.page} data-platform={platform}>
            <SettingsCard>
                <SettingRow label={t('setting.filter.platform')}>
                    <Segmented<SettingInterface['platform']> size="sm" value={platform} className={s.platformSeg} label={t('setting.filter.platform')}
                        onChange={p => dispatchGlobalSetting({ type: 'SET_PLATFORM', payload: p })}
                        options={[option('twitch'), option('chzzk')]} />
                </SettingRow>
            </SettingsCard>
            <SectionTitle actions={<>
                <ImportFilter size="sm" />
                <ExportFilter size="sm" />
                <Button size="sm" variant="primary" icon="add" onClick={() => setAddOpen(true)}>{t('setting.filter.filter_add')}</Button>
            </>}>
                {t('setting.filter.filter_list')}
                <span className={s.platformChip}><i data-platform={platform} />{t(`platform.${platform}`)}</span>
            </SectionTitle>
            <SettingsCard className={s.list}><FilterGroupList /></SettingsCard>
            <FilterAddDialog open={addOpen} onClose={() => setAddOpen(false)} />
        </div>
    );
}
