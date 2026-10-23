/**
 * 필터 추가 전용 Dialog. 기존엔 Filter.tsx 페이지 안에 inline으로 폼+배지가 박혀있어
 * "이 폼이 추가용인지 위 항목 편집용인지" 헷갈렸음. 명시적 모달로 분리.
 * 좌: 입력 폼 / 우: 배지 picker (900px 미만에선 위아래).
 */
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, Icon, IconButton, Stack, Switch } from '@/ui';
import { AtomicFilterElement } from '@/interfaces/filter';
import { defaultAtomicFilter } from '@/utils/utils-common';
import { useGlobalSettingContext } from '@/context/GlobalSetting';
import { setAdvancedFilter } from '@/reducer/setting';
import FilterInputForm from './FilterInputForm';
import FilterInputFormList from './FilterInputFormList';
import BadgeList from './BadgeList';
import ChannelIdGuideDialog from './dialog/ChannelIdGuideDialog';
import { setBadgeInSimpleFilter, setMultipleBadgesInFilterArray } from './utils/badge-utils';
import s from './FilterAddDialog.module.css';

interface Props {
    open: boolean;
    onClose: () => void;
}

export default function FilterAddDialog({ open, onClose }: Props) {
    const { t } = useTranslation();
    const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();
    const advancedFilter = globalSetting.advancedFilter;

    // 키트 Dialog는 onClose가 바뀔 때마다 첫 입력에 초점을 다시 준다 — 바뀌지 않는 함수로 넘긴다.
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const close = useCallback(() => onCloseRef.current(), []);

    // Dialog가 열린 동안 쓰는 입력 상태.
    const [filterInput, setFilterInput] = useState<AtomicFilterElement | undefined>(defaultAtomicFilter());
    const [filterInputList, setFilterInputList] = useState<AtomicFilterElement[]>([]);
    const filterInputListRef = useRef<AtomicFilterElement[]>([]);
    const [guideOpen, setGuideOpen] = useState(false);

    return (
        <Dialog
            open={open}
            onClose={close}
            width="lg"
            title={t('setting.filter.filter_add')}
            bodyClassName={s.body}
            headerExtra={
                <Stack dir="row" align="center" gap={8}>
                    <Switch
                        checked={advancedFilter === 'on'}
                        onChange={(checked) => dispatchGlobalSetting(setAdvancedFilter(checked ? 'on' : 'off'))}
                        label={t('setting.filter_mode.advanced')}
                    />
                    <IconButton icon="close" label={t('common.close')} size="sm" onClick={close} />
                </Stack>
            }
            actions={<Button onClick={close}>{t('common.close')}</Button>}
        >
            <div className={s.split}>
                {/* 좌측: 폼 영역. 스크롤은 안쪽 카드 본문이 맡고, 메모/채널/필터 추가는 아래에 고정. */}
                <div className={s.left}>
                    <div className={s.hintRow}>
                        <Icon name="info" />
                        <span className={s.hintText}>{t('filter_dialog.per_channel_hint')}</span>
                        <Button variant="text" size="sm" onClick={() => setGuideOpen(true)}>{t('common.details')}</Button>
                    </div>

                    {advancedFilter === 'on' ? (
                        <FilterInputFormList
                            afInputRow={filterInputList}
                            setAfInputRow={setFilterInputList}
                            filterInputListRef={filterInputListRef}
                            onAddSuccess={close}
                        />
                    ) : (
                        <FilterInputForm
                            filterInput={filterInput}
                            setFilterInput={setFilterInput}
                            onAddSuccess={close}
                        />
                    )}
                </div>

                {/* 우측: 배지 picker */}
                <div className={s.right}>
                    <div className={s.sectionHead}>
                        <h3 className={s.sectionTitle}>{t('setting.filter.select_badges')}</h3>
                        {/* 배지 사이트의 배지 일람 — 치지직만 있다 */}
                        {globalSetting.platform === 'chzzk' && (
                            <a className={s.siteLink} href="https://badgecollector.dev/badges/" target="_blank" rel="noreferrer">
                                {t('setting.filter.badge_catalog')} ↗
                            </a>
                        )}
                    </div>
                    <div style={{ flex: 1, minHeight: 0 }}>
                        <BadgeList
                            multiple={advancedFilter === 'on'}
                            onBadgeSelect={(badge) => {
                                setBadgeInSimpleFilter(badge, globalSetting.platform, setFilterInput);
                            }}
                            onMultiBadgesSelect={(badges) => {
                                setMultipleBadgesInFilterArray(badges, globalSetting.platform, setFilterInputList);
                            }}
                        />
                    </div>
                </div>
            </div>
            <ChannelIdGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />
        </Dialog>
    );
}
