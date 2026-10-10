import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useTheme } from '@mui/material/styles';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { linter, type Diagnostic } from '@codemirror/lint';
import { useGlobalSettingContext } from '@/context/GlobalSetting';
import { setChzzkCustomTemplate } from '@/reducer/setting';
import { DEFAULT_CHZZK_TEMPLATES, renderChzzkChat, type ChzzkTemplates } from '@/render/chzzk-render';
import type { ChzzkChatKind } from '@/render/chzzk-chat-view';
import { TEMPLATE_KINDS, saveTemplates, useStoredTemplates, validateTemplate } from '@/render/template-store';
import { TEMPLATE_FIELDS, TEMPLATE_SAMPLES } from '@/render/template-samples';
import { getPlatformConfig } from '@/platform/host-selectors';
import SocialFooter from './SocialFooter';

/** 오류 위치(index)를 사람이 읽는 줄·칸으로. */
function lineCol(src: string, index: number) {
    const before = src.slice(0, index).split('\n');
    return { line: before.length, col: before[before.length - 1].length + 1 };
}

/** 값 종류에 맞는 사용 예. 문구(i18n)에 넣으면 i18next가 {{ }}를 먹어서 여기서 만든다. */
function usageOf(name: string): string {
    if (name === 'messageHtml') return '{{{messageHtml}}}';
    if (name === 'badges') return '{{#badges}}<img src="{{url}}">{{/badges}}';
    if (['hasMessage', 'cleanbot', 'blinded', 'anonymous', 'donation.mission', 'verifiedIconUrl'].includes(name)) {
        return `{{#${name}}}…{{/${name}}}`;
    }
    return `{{${name}}}`;
}

/**
 * 템플릿 문법 오류를 편집기 안에 밑줄로. 오류 위치의 태그(`{{…}}`) 하나를 덮는다.
 * HTML 자체의 오류는 보지 않는다 — 렌더러가 브라우저 파서로 관대하게 처리한다.
 */
const templateLinter = linter(view => {
    const src = view.state.doc.toString();
    const r = validateTemplate(src);
    if (r.ok) return [];
    const from = Math.min(r.index, src.length);
    const close = src.indexOf('}}', from);
    const to = close >= 0 ? Math.min(close + (src[close + 2] === '}' ? 3 : 2), src.length) : Math.min(from + 1, src.length);
    const d: Diagnostic = { from, to: Math.max(to, from), severity: 'error', message: r.message };
    return [d];
}, { delay: 150 });

const EDITOR_EXTENSIONS = [html(), templateLinter, EditorView.lineWrapping];

const SYNTAX_HELP: { code: string; key: string }[] = [
    { code: '{{값}}', key: 'help_var' },
    { code: '{{{messageHtml}}}', key: 'help_raw' },
    { code: '{{#값}}…{{/값}}', key: 'help_section' },
    { code: '{{^값}}…{{/값}}', key: 'help_inverted' },
];

/** 렌더러가 만든 요소를 그대로 붙인다 — 이미 sanitize된 요소다. */
function Preview({ kind, template, dark }: { kind: ChzzkChatKind; template: string; dark: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    const verifiedIconUrl = getPlatformConfig('chzzk').constants?.verifiedBadgeImageUrl as string | undefined;

    useEffect(() => {
        const box = ref.current;
        if (!box) return;
        box.replaceChildren();
        for (const { label, chat } of TEMPLATE_SAMPLES[kind]) {
            const caption = document.createElement('div');
            caption.className = 'tbc-template-preview-caption';
            caption.textContent = label;
            box.append(caption, renderChzzkChat(chat, { templates: { [kind]: template }, verifiedIconUrl }));
        }
    }, [kind, template, verifiedIconUrl]);

    return (
        <Box
            ref={ref}
            // 렌더러 CSS가 쓰는 클래스: theme_dark(닉네임 색), tbcv2_chatTime_on(시각 표시)
            className={`tbcv2_chatTime_on ${dark ? 'theme_dark' : ''}`}
            sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: dark ? '#141517' : '#ffffff',
                color: dark ? '#e6e6e6' : '#141517',
                border: 1,
                borderColor: 'divider',
                minHeight: 160,
                '& .tbc-template-preview-caption': { fontSize: 11, opacity: 0.5, mt: 1, mb: 0.25, px: '6px' },
            }}
        />
    );
}

export default function TemplateSetting() {
    const { t } = useTranslation();
    const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();
    const stored = useStoredTemplates();
    const [kind, setKind] = useState<ChzzkChatKind>('chat');
    const [drafts, setDrafts] = useState<ChzzkTemplates>(DEFAULT_CHZZK_TEMPLATES);
    const [dark, setDark] = useState(true);
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const loadedRef = useRef(false);

    useEffect(() => { document.title = `${t('template.title')} - TBC`; }, []);

    // 저장된 값이 처음 들어오면 편집 중인 값을 채운다. 이후 외부 변경으로 편집 중인 걸 덮지 않는다.
    useEffect(() => {
        if (loadedRef.current) return;
        loadedRef.current = true;
        setDrafts({ ...DEFAULT_CHZZK_TEMPLATES, ...stored });
    }, [stored]);

    const current = { ...DEFAULT_CHZZK_TEMPLATES, ...stored };
    const dirty = TEMPLATE_KINDS.some(k => drafts[k] !== current[k]);
    const validations = useMemo(
        () => Object.fromEntries(TEMPLATE_KINDS.map(k => [k, validateTemplate(drafts[k])])) as Record<ChzzkChatKind, ReturnType<typeof validateTemplate>>,
        [drafts],
    );
    const allValid = TEMPLATE_KINDS.every(k => validations[k].ok);
    const v = validations[kind];
    const custom = globalSetting.chzzkCustomTemplate === 'on';
    const muiTheme = useTheme();

    const onSave = async () => {
        // 기본값과 같은 종류는 저장하지 않는다 — 나중에 기본 템플릿이 바뀌면 그대로 따라가게.
        const toStore = Object.fromEntries(TEMPLATE_KINDS.filter(k => drafts[k] !== DEFAULT_CHZZK_TEMPLATES[k]).map(k => [k, drafts[k]]));
        await saveTemplates(toStore);
        setSavedAt(Date.now());
    };

    return (
        <Stack spacing={2} sx={{ maxWidth: 1080, width: '100%', margin: '0 auto', p: 2, boxSizing: 'border-box' }}>
            <Card variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h6">{t('template.title')}</Typography>
                <FormControlLabel
                    sx={{ mt: 1 }}
                    control={
                        <Switch
                            checked={custom}
                            onChange={(_e, on) => dispatchGlobalSetting(setChzzkCustomTemplate(on ? 'on' : 'off'))}
                        />
                    }
                    label={t('template.use_custom')}
                />
                <Typography variant="body2" color="text.secondary">
                    {custom ? t('template.use_custom_hint_on') : t('template.use_custom_hint_off')}
                </Typography>
            </Card>

            <Card variant="outlined" sx={{ p: 2 }}>
                <Tabs value={kind} onChange={(_e, k: ChzzkChatKind) => setKind(k)} sx={{ mb: 2 }}>
                    {TEMPLATE_KINDS.map(k => (
                        <Tab key={k} value={k} label={`${t(`template.kinds.${k}`)}${validations[k].ok ? '' : ' ⚠'}`} />
                    ))}
                </Tabs>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ border: 1, borderColor: v.ok ? 'divider' : 'error.main', borderRadius: 1, overflow: 'hidden', fontSize: 13 }}>
                            <CodeMirror
                                // 탭마다 편집 기록(실행 취소)을 따로 두려고 key로 다시 만든다.
                                key={kind}
                                value={drafts[kind]}
                                onChange={val => setDrafts(d => ({ ...d, [kind]: val }))}
                                extensions={EDITOR_EXTENSIONS}
                                theme={muiTheme.palette.mode === 'dark' ? 'dark' : 'light'}
                                minHeight="280px"
                                basicSetup={{ foldGutter: false, highlightActiveLine: false }}
                            />
                        </Box>
                        {!v.ok && (
                            <Alert severity="error" sx={{ mt: 1 }}>
                                {t('template.error', { ...lineCol(drafts[kind], v.index), message: v.message })}
                            </Alert>
                        )}
                        <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="center">
                            <Button variant="contained" onClick={onSave} disabled={!dirty || !allValid}>
                                {t('template.save')}
                            </Button>
                            <Button
                                variant="outlined"
                                onClick={() => setDrafts(d => ({ ...d, [kind]: DEFAULT_CHZZK_TEMPLATES[kind] }))}
                                disabled={drafts[kind] === DEFAULT_CHZZK_TEMPLATES[kind]}
                            >
                                {t('template.reset')}
                            </Button>
                            <Typography variant="caption" color="text.secondary">
                                {dirty ? t('template.unsaved') : savedAt ? t('template.saved') : ''}
                            </Typography>
                        </Stack>
                    </Box>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                            <Typography variant="subtitle2">{t('template.preview')}</Typography>
                            <ToggleButtonGroup size="small" exclusive value={dark ? 'dark' : 'light'} onChange={(_e, m) => m && setDark(m === 'dark')}>
                                <ToggleButton value="dark">{t('template.preview_dark')}</ToggleButton>
                                <ToggleButton value="light">{t('template.preview_light')}</ToggleButton>
                            </ToggleButtonGroup>
                        </Stack>
                        {/* 문법 오류 중엔 저장된(또는 기본) 템플릿으로 보여준다 — 렌더러와 같은 대체 규칙 */}
                        <Preview kind={kind} template={v.ok ? drafts[kind] : current[kind]} dark={dark} />
                    </Box>
                </Stack>
            </Card>

            <Card variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('template.fields_title')}</Typography>
                <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, '& td': { py: 0.5, pr: 2, verticalAlign: 'top' }, '& code': { fontFamily: 'ui-monospace, Menlo, Consolas, monospace' } }}>
                    <tbody>
                        {SYNTAX_HELP.map(h => (
                            <tr key={h.key}><td><code>{h.code}</code></td><td>{t(`template.${h.key}`)}</td></tr>
                        ))}
                        <tr><td colSpan={2}><Typography variant="caption" color="text.secondary">{t('template.help_safety')}</Typography></td></tr>
                        {TEMPLATE_FIELDS.filter(f => !f.kinds || f.kinds.includes(kind)).map(f => (
                            // i18next는 키의 '.'을 계층으로 읽어서 문구 키는 '_'로 바꿔 둔다.
                            <tr key={f.name}><td><code>{usageOf(f.name)}</code></td><td>{t(`template.fields.${f.name.replace('.', '_')}`)}</td></tr>
                        ))}
                    </tbody>
                </Box>
            </Card>

            <SocialFooter />
        </Stack>
    );
}
