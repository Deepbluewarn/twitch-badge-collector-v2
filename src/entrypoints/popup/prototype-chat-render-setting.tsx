/**
 * PROTOTYPE — 버릴 코드. prototype/chat-render-setting 브랜치에만 둔다.
 *
 * 질문: 팝업 일반 설정의 "채팅 표시 방식"(원본 / 템플릿)을 비개발자에게 어떻게 설명하고,
 *       템플릿 설정 페이지로 자연스럽게 유도할까?
 * 계획: 일반 설정 화면의 그 한 줄 자리에 시안 4개를 바꿔 끼운다. 하단 막대(← →)나
 *       ?variant=A|B|C|D 로 전환. dev 빌드에서만 보이고, 고른 값은 실제 설정에 저장하지 않는다.
 */
import React, { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Radio from '@mui/material/Radio';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { renderChzzkChat } from '@/render/chzzk-render';
import { TEMPLATE_SAMPLES } from '@/render/template-samples';
import { useStoredTemplates } from '@/render/template-store';
import '@/render/chzzk-chat.css';

type Mode = 'native' | 'template';
interface VariantProps { mode: Mode; setMode: (m: Mode) => void; openTemplate: () => void }

const openTemplatePage = () =>
    browser.tabs.create({ url: browser.runtime.getURL('/setting.html?initialPath=template') });

// ─── 공용 소품: 가짜 채팅 한 줄 ──────────────────────────────────────────────

/** 치지직 원본처럼 보이는 가짜 채팅 (실제 치지직 HTML은 팝업에서 못 가져온다). */
function FakeNativeChat({ name = '고양이집사', text = '오늘 방송 재밌다' }: { name?: string; text?: string }) {
    return (
        <Box sx={{ fontSize: 12, lineHeight: '18px', px: 0.75, py: 0.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <Box component="span" sx={{ display: 'inline-block', width: 12, height: 12, borderRadius: '3px', bgcolor: '#7b5cff', verticalAlign: '-2px', mr: 0.5 }} />
            <Box component="span" sx={{ color: '#5aa9ff', fontWeight: 600, mr: 0.5 }}>{name}</Box>
            <span>{text}</span>
        </Box>
    );
}

/** 확장이 직접 그린 것 같은 가짜 채팅 (모양이 조금 다르다는 걸 보여주려고 일부러 차이를 둔다). */
function FakeTemplateChat({ name = '고양이집사', text = '오늘 방송 재밌다' }: { name?: string; text?: string }) {
    return (
        <Box sx={{ fontSize: 12, lineHeight: '18px', px: 0.75, py: 0.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderLeft: '2px solid #00ffa3' }}>
            <Box component="span" sx={{ color: '#00c37f', fontWeight: 700, mr: 0.5 }}>{name}</Box>
            <span>{text}</span>
        </Box>
    );
}

// ─── A. 미니 시연 카드 ────────────────────────────────────────────────────────

/** 꾸밀 수 있다는 걸 보여주는 예시 모양들 (말풍선, 형광펜). */
function FakeBubbleChat({ name = '방장대리', text = '공지 확인해주세요' }: { name?: string; text?: string }) {
    return (
        <Box sx={{ fontSize: 12, lineHeight: '18px', px: 0.75, py: 0.25 }}>
            <Box component="span" sx={{ fontWeight: 700, mr: 0.5, color: '#ff7ab6' }}>{name}</Box>
            <Box component="span" sx={{ px: 0.75, py: '1px', borderRadius: 8, bgcolor: 'rgba(255,122,182,0.15)' }}>{text}</Box>
        </Box>
    );
}

function VariantA({ mode, setMode, openTemplate }: VariantProps) {
    const card = (m: Mode, title: string, line: string, demo: React.ReactNode) => (
        <Box
            onClick={() => setMode(m)}
            sx={{
                p: 1, borderRadius: 1.5, cursor: 'pointer', border: 2,
                borderColor: mode === m ? 'primary.main' : 'divider',
                bgcolor: mode === m ? 'action.selected' : 'transparent',
            }}
        >
            <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="body2" fontWeight={700}>{title}</Typography>
                <Radio size="small" checked={mode === m} sx={{ p: 0 }} />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75, lineHeight: 1.3 }}>{line}</Typography>
            <Box sx={{ borderRadius: 1, bgcolor: 'action.hover', py: 0.25 }}>{demo}</Box>
        </Box>
    );
    return (
        <Stack spacing={1}>
            <Typography variant="body2">모아보기 채팅 모양 (치지직)</Typography>
            {card('native', '기본', '치지직 채팅창과 똑같은 모양으로 보여줍니다. 채팅을 바로 찾지 못하면 잠깐 커스텀 모양으로 먼저 보여줘요.', <>
                <FakeNativeChat />
                <FakeNativeChat name="방장대리" text="공지 확인해주세요" />
            </>)}
            {card('template', '커스텀', '원하는 모양으로 직접 꾸며서 보여줍니다.', <>
                <FakeTemplateChat />
                <FakeBubbleChat />
            </>)}
            {mode === 'template' && (
                <Button size="small" variant="text" onClick={openTemplate} sx={{ alignSelf: 'flex-start', textTransform: 'none' }}>
                    모양 꾸미러 가기 →
                </Button>
            )}
        </Stack>
    );
}

// ─── B. 질문형 + 펼쳐보기 ─────────────────────────────────────────────────────

function VariantB({ mode, setMode, openTemplate }: VariantProps) {
    const [open, setOpen] = useState(false);
    const option = (m: Mode, title: string, chips: string[], extra?: React.ReactNode) => (
        <Box onClick={() => setMode(m)} sx={{ display: 'flex', gap: 0.5, cursor: 'pointer', py: 0.5 }}>
            <Radio size="small" checked={mode === m} sx={{ p: 0.25, alignSelf: 'flex-start' }} />
            <Box sx={{ flex: 1 }}>
                <Typography variant="body2" fontWeight={mode === m ? 700 : 400}>{title}</Typography>
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.25, flexWrap: 'wrap', rowGap: 0.5 }}>
                    {chips.map(c => <Chip key={c} label={c} size="small" sx={{ height: 20, fontSize: 11 }} />)}
                </Stack>
                {extra}
            </Box>
        </Box>
    );
    return (
        <Box>
            <Typography variant="body2" fontWeight={700}>모아보기 채팅, 어떻게 보여드릴까요?</Typography>
            <Typography variant="caption" color="text.secondary">치지직에서만 적용돼요</Typography>
            {option('native', '기본', ['🪞 치지직과 같은 모양'],
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.3 }}>
                    치지직 채팅을 바로 찾지 못하면 잠깐 커스텀 모양으로 먼저 보여줘요. (모아보기에서 작은 점이 붙은 채팅)
                </Typography>)}
            {option('template', '커스텀', ['🎨 원하는 모양으로 꾸미기', '✨ 모양이 바뀌는 깜빡임 없음'],
                mode === 'template' && (
                    <Button size="small" onClick={e => { e.stopPropagation(); openTemplate(); }} sx={{ mt: 0.5, px: 0, textTransform: 'none' }}>
                        ✏️ 모양 꾸미러 가기
                    </Button>
                ))}
            <Button size="small" color="inherit" onClick={() => setOpen(o => !o)} sx={{ px: 0, mt: 0.5, fontSize: 11, color: 'text.secondary', textTransform: 'none' }}>
                {open ? '▾' : '▸'} 어떻게 다른가요?
            </Button>
            <Collapse in={open}>
                <Box component="ol" sx={{ m: 0, pl: 2.5, fontSize: 12, color: 'text.secondary', '& li': { mb: 0.5 } }}>
                    <li><b>기본</b>은 치지직 채팅창에 뜬 채팅을 똑같은 모양으로 옮겨 와요. 아주 가끔, 잠깐 다른 모양이었다가 바뀔 수 있어요.</li>
                    <li><b>커스텀</b>은 내가 정한 모양으로 그려요. 처음엔 깔끔한 기본 꾸밈으로 시작하고, 글자색·배지·말풍선 등을 원하는 대로 바꿀 수 있어요.</li>
                </Box>
            </Collapse>
        </Box>
    );
}

// ─── C. 한 줄 + 비교표 ────────────────────────────────────────────────────────

function VariantC({ mode, setMode, openTemplate }: VariantProps) {
    const [open, setOpen] = useState(false);
    const rows: [string, string, string][] = [
        ['모양', '치지직과 같음', '내가 꾸민 모양'],
        ['꾸미기', '안 됨', '글자색·배지·말풍선 등'],
        ['채팅을 못 찾으면', '잠깐 커스텀 모양으로', '-'],
    ];
    return (
        <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                <Stack direction="row" alignItems="center" sx={{ minWidth: 0 }}>
                    <Typography variant="body2">모아보기 채팅 모양 (치지직)</Typography>
                    <IconButton size="small" onClick={() => setOpen(o => !o)} sx={{ p: 0.25 }}>
                        <HelpOutlineIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                </Stack>
                <ToggleButtonGroup
                    value={mode} exclusive size="small" onChange={(_e, v: Mode | null) => v && setMode(v)}
                    sx={{ '& .MuiToggleButton-root': { px: 1, py: 0.25, textTransform: 'none', fontSize: 12 } }}
                >
                    <ToggleButton value="native">기본</ToggleButton>
                    <ToggleButton value="template">커스텀</ToggleButton>
                </ToggleButtonGroup>
            </Stack>
            <Collapse in={open}>
                <Box sx={{ mt: 1, p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
                    <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, '& td, & th': { py: 0.4, px: 0.5, textAlign: 'left', verticalAlign: 'top' }, '& th': { fontWeight: 700 } }}>
                        <thead><tr><th /><th>기본</th><th>커스텀</th></tr></thead>
                        <tbody>{rows.map(r => <tr key={r[0]}><td style={{ opacity: 0.7 }}>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td></tr>)}</tbody>
                    </Box>
                    <Button size="small" variant="outlined" fullWidth onClick={openTemplate} sx={{ mt: 1, textTransform: 'none' }}>
                        커스텀 모양 꾸미기
                    </Button>
                </Box>
            </Collapse>
        </Box>
    );
}

// ─── D. 미리보기 중심 (템플릿 쪽은 실제 렌더러 + 저장된 사용자 템플릿) ─────────

function VariantD({ mode, setMode, openTemplate }: VariantProps) {
    const templates = useStoredTemplates();
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const box = ref.current;
        if (!box || mode !== 'template') return;
        box.replaceChildren(...TEMPLATE_SAMPLES.chat.slice(0, 2).map(s => renderChzzkChat(s.chat, { templates })));
    }, [mode, templates]);
    return (
        <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="body2">모아보기 채팅 모양 (치지직)</Typography>
                <ToggleButtonGroup
                    value={mode} exclusive size="small" onChange={(_e, v: Mode | null) => v && setMode(v)}
                    sx={{ '& .MuiToggleButton-root': { px: 1, py: 0.25, textTransform: 'none', fontSize: 12 } }}
                >
                    <ToggleButton value="native">기본</ToggleButton>
                    <ToggleButton value="template">커스텀</ToggleButton>
                </ToggleButtonGroup>
            </Stack>
            <Box sx={{ mt: 0.75, borderRadius: 1, border: 1, borderColor: 'divider', overflow: 'hidden' }}>
                <Typography sx={{ fontSize: 10, px: 1, pt: 0.5, color: 'text.secondary' }}>미리보기 · 모아보기</Typography>
                {mode === 'native'
                    ? <Box sx={{ py: 0.5 }}><FakeNativeChat /><FakeNativeChat name="방장대리" text="공지 확인해주세요" /></Box>
                    : <Box ref={ref} className="tbcv2_chatTime_on" sx={{ py: 0.25, '& .tbc-chat': { fontSize: 12, py: '2px' } }} />}
                <Typography sx={{ fontSize: 11, px: 1, pb: 0.75, color: 'text.secondary', lineHeight: 1.3 }}>
                    {mode === 'native'
                        ? '치지직 채팅창과 똑같은 모양으로 보여줍니다. 채팅을 바로 찾지 못하면 잠깐 커스텀 모양으로 먼저 보여줘요.'
                        : '지금 설정된 커스텀 모양이에요. 원하는 대로 바꿀 수 있어요.'}
                </Typography>
                {mode === 'template' && (
                    <Button size="small" fullWidth onClick={openTemplate} sx={{ borderRadius: 0, borderTop: 1, borderColor: 'divider', textTransform: 'none' }}>
                        이 모양 꾸미기 →
                    </Button>
                )}
            </Box>
        </Box>
    );
}

// ─── 전환 막대 ────────────────────────────────────────────────────────────────

const VARIANTS = [
    { key: 'A', name: '미리보기 카드', C: VariantA },
    { key: 'B', name: '질문형 + 펼쳐보기', C: VariantB },
    { key: 'C', name: '한 줄 + 비교표', C: VariantC },
    { key: 'D', name: '미리보기 중심', C: VariantD },
] as const;

export default function ChatRenderSettingPrototype() {
    const initial = new URLSearchParams(location.search).get('variant')?.toUpperCase();
    const [i, setI] = useState(Math.max(0, VARIANTS.findIndex(v => v.key === initial)));
    // 고른 값은 실제 설정에 저장하지 않는다 — 시안 비교용 임시 상태.
    const [mode, setMode] = useState<Mode>('native');
    const go = (d: number) => setI(x => (x + d + VARIANTS.length) % VARIANTS.length);

    useEffect(() => {
        const u = new URL(location.href);
        u.searchParams.set('variant', VARIANTS[i].key);
        history.replaceState(null, '', u);
    }, [i]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const el = document.activeElement as HTMLElement | null;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
            if (e.key === 'ArrowLeft') go(-1);
            if (e.key === 'ArrowRight') go(1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const V = VARIANTS[i].C;
    return (
        <>
            <Box sx={{ outline: '1px dashed', outlineColor: 'warning.main', outlineOffset: 4, borderRadius: 1 }}>
                <V mode={mode} setMode={setMode} openTemplate={openTemplatePage} />
            </Box>
            <Box
                sx={{
                    position: 'fixed', bottom: 6, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: 99,
                    bgcolor: '#111', color: '#fff', fontSize: 11, boxShadow: 4, whiteSpace: 'nowrap',
                }}
            >
                <Box component="button" onClick={() => go(-1)} sx={{ all: 'unset', cursor: 'pointer', px: 0.5 }}>←</Box>
                <span>{VARIANTS[i].key} ({VARIANTS[i].name}) · 선택: {mode === 'native' ? '원본' : '템플릿'}</span>
                <Box component="button" onClick={() => go(1)} sx={{ all: 'unset', cursor: 'pointer', px: 0.5 }}>→</Box>
            </Box>
        </>
    );
}
