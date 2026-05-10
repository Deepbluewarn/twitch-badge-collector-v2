/**
 * 필터 추가 전용 Dialog. 기존엔 Filter.tsx 페이지 안에 inline으로 폼+배지가 박혀있어
 * "이 폼이 추가용인지 위 항목 편집용인지" 헷갈렸음. 명시적 모달로 분리.
 *
 * 단계 분리:
 *  - Step 2 (이번): 기존 FilterInputForm/List + BadgeList를 Dialog로 옮김.
 *    내부 layout은 기존과 동일.
 *  - Step 3 (다음): Dialog 내부 split layout + 배지 picker 재설계.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { AtomicFilterElement } from '@/interfaces/filter';
import { defaultAtomicFilter } from '@/utils/utils-common';
import { useGlobalSettingContext } from '@/context/GlobalSetting';
import { setAdvancedFilter } from '@/reducer/setting';
import FilterInputForm from './FilterInputForm';
import FilterInputFormList from './FilterInputFormList';
import BadgeList from './BadgeList';
import ChannelIdGuideDialog from './dialog/ChannelIdGuideDialog';
import { setBadgeInSimpleFilter, setMultipleBadgesInFilterArray } from './utils/badge-utils';

interface Props {
    open: boolean;
    onClose: () => void;
}

export default function FilterAddDialog({ open, onClose }: Props) {
    const { t } = useTranslation();
    const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();
    const advancedFilter = globalSetting.advancedFilter;

    // Dialog가 열린 동안만 살아있는 입력 상태. 닫힐 때 초기화는 Dialog unmount로 자연 처리.
    const [filterInput, setFilterInput] = useState<AtomicFilterElement | undefined>(defaultAtomicFilter());
    const [filterInputList, setFilterInputList] = useState<AtomicFilterElement[]>([]);
    const filterInputListRef = useRef<AtomicFilterElement[]>([]);
    const [guideOpen, setGuideOpen] = useState(false);

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth={false}
            fullWidth
            // 닫혔다 다시 열릴 때 입력 상태 초기화되도록 unmount.
            keepMounted={false}
            // Material 원칙: 모달은 page보다 한 단계 위 surface(=background.paper).
            // 안쪽 form Card는 default(약간 어두운)로 inset 느낌.
            PaperProps={{
                sx: {
                    width: '1100px',
                    maxWidth: '95vw',
                    height: '70vh',
                    maxHeight: '70vh',
                    bgcolor: 'background.paper',
                    backgroundImage: 'none', // MUI 기본 elevation overlay 제거 (이미 paper가 surface 역할)
                    border: 1,
                    borderColor: 'divider',
                },
            }}
            slotProps={{
                backdrop: {
                    sx: {
                        backdropFilter: 'blur(6px)',
                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    },
                },
            }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1, py: 1.5, gap: 2 }}>
                <span>{t('setting.filter.filter_add')}</span>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <FormControlLabel
                        control={
                            <Switch
                                size="small"
                                checked={advancedFilter === 'on'}
                                onChange={(e) => dispatchGlobalSetting(setAdvancedFilter(e.target.checked ? 'on' : 'off'))}
                            />
                        }
                        label={t('setting.filter_mode.advanced')}
                        slotProps={{ typography: { variant: 'body2' } }}
                        sx={{ mr: 0 }}
                    />
                    <IconButton onClick={onClose} size="small" aria-label="close">
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Stack>
            </DialogTitle>
            <DialogContent dividers sx={{ p: 0, overflow: 'hidden' }}>
                {/* 반응형 split: md(900px+)에선 좌우, 그 이하에선 위아래 stack.
                    column 모드에선 좌측 폼이 자라서 우측 배지 영역을 밀어내지 않도록
                    좌측에 maxHeight를 주고 내부 스크롤 처리. */}
                <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    sx={{ height: '100%', overflow: 'hidden' }}
                >
                    {/* 좌측: 폼 영역 (input + 안내). flex column으로 안의 Card가 남은 높이 채움. */}
                    <Box
                        sx={{
                            flex: { xs: '0 0 auto', md: '0 0 560px' },
                            maxHeight: { xs: '50%', md: 'none' },
                            p: 2,
                            display: 'flex',
                            flexDirection: 'column',
                            minHeight: 0,
                            overflow: 'hidden',
                        }}
                    >
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, flexShrink: 0 }}>
                            <InfoOutlinedIcon color="primary" fontSize="small" />
                            <Typography variant="body2" color="textSecondary" sx={{ flex: 1 }}>
                                채널 별 필터 설정이 가능합니다.
                            </Typography>
                            <Button size="small" onClick={() => setGuideOpen(true)}>자세히</Button>
                        </Stack>

                        {/* Card가 남은 높이를 채우도록 — 내부 form 영역이 dialog 높이만큼 시원하게. */}
                        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', '& > *': { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } }}>
                            {advancedFilter === 'on' ? (
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
                            )}
                        </Box>
                    </Box>

                    <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />
                    <Divider sx={{ display: { xs: 'block', md: 'none' } }} />

                    {/* 우측: 배지 picker */}
                    <Box
                        sx={{
                            flex: 1,
                            minHeight: 0,
                            overflow: 'auto',
                            p: 2,
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
                            {t('setting.filter.select_badges')}
                        </Typography>
                        <Box sx={{ flex: 1, minHeight: 0 }}>
                            <BadgeList
                                multiple={advancedFilter === 'on'}
                                onBadgeSelect={(badge) => {
                                    setBadgeInSimpleFilter(badge, globalSetting.platform, setFilterInput);
                                }}
                                onMultiBadgesSelect={(badges) => {
                                    setMultipleBadgesInFilterArray(badges, globalSetting.platform, setFilterInputList);
                                }}
                            />
                        </Box>
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>닫기</Button>
            </DialogActions>
            <ChannelIdGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />
        </Dialog>
    );
}
