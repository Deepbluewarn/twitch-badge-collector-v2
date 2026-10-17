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
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { linter, type Diagnostic } from '@codemirror/lint';
import { useGlobalSettingContext } from '@/context/GlobalSetting';
import { setChzzkCustomTemplate } from '@/reducer/setting';
import { renderChzzkChat } from '@/render/chzzk-render';
import { DEFAULT_CHZZK_TEMPLATES, DEFAULT_LOOK, LOOK_LAYOUTS, LOOK_SIZES, buildTemplates, detectLook, type ChzzkTemplates, type TemplateLook } from '@/render/chzzk-templates';
import type { ChzzkChatKind } from '@/render/chzzk-chat-view';
import { TEMPLATE_KINDS, saveTemplates, useStoredTemplatesState, validateTemplate, type TemplateValidation } from '@/render/template-store';
import { TEMPLATE_FIELDS, TEMPLATE_SAMPLES } from '@/render/template-samples';
import { getPlatformConfig } from '@/platform/host-selectors';
import SocialFooter from './SocialFooter';
import i18n from '@/translate/i18n';

/** 오류 위치(index)를 사람이 읽는 줄·칸으로. */
function lineCol(src: string, index: number) {
    const before = src.slice(0, index).split('\n');
    return { line: before.length, col: before[before.length - 1].length + 1 };
}

/** 문법 오류 설명. 편집기 linter는 React 밖이라 i18n 인스턴스를 직접 쓴다. */
function errorText(v: Extract<TemplateValidation, { ok: false }>) {
    return i18n.t(`template.errors.${v.code}`, { ...v.params, interpolation: { escapeValue: false } });
}

/** 값 종류에 맞는 사용 예. 문구(i18n)에 넣으면 i18next가 {{ }}를 먹어서 여기서 만든다. */
function usageOf(name: string): string {
    if (name === 'messageHtml') return '{{{messageHtml}}}';
    if (name === 'nickStyle') return 'style="{{nickStyle}}"';
    if (name === 'nickEffect') return 'class="tbc-chat-nick--{{nickEffect}}"';
    if (name === 'badges') return '{{#badges}}<img src="{{url}}">{{/badges}}';
    if (['hasMessage', 'cleanbot', 'blinded', 'anonymous', 'donation.mission', 'verifiedIconUrl', 'gift.toChannel'].includes(name)) {
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
    const d: Diagnostic = { from, to: Math.max(to, from), severity: 'error', message: errorText(r) };
    return [d];
}, { delay: 150 });

const EDITOR_EXTENSIONS = [html(), templateLinter, EditorView.lineWrapping];

const SYNTAX_HELP: { code: string; key: string }[] = [
    { code: '{{value}}', key: 'help_var' },
    { code: '{{{messageHtml}}}', key: 'help_raw' },
    { code: '{{#value}}…{{/value}}', key: 'help_section' },
    { code: '{{^value}}…{{/value}}', key: 'help_inverted' },
];

/** 렌더러가 만든 요소를 그대로 붙인다 — 이미 sanitize된 요소다. */
function Preview({ kind, template, dark }: { kind: ChzzkChatKind; template: string; dark: boolean }) {
    const { t } = useTranslation();
    const ref = useRef<HTMLDivElement>(null);
    const verifiedIconUrl = getPlatformConfig('chzzk').constants?.verifiedBadgeImageUrl as string | undefined;

    useEffect(() => {
        const box = ref.current;
        if (!box) return;
        box.replaceChildren();
        for (const { label, chat } of TEMPLATE_SAMPLES[kind]) {
            const caption = document.createElement('div');
            caption.className = 'tbc-template-preview-caption';
            caption.textContent = t(`template.samples.${label}`);
            box.append(caption, renderChzzkChat(chat, { templates: { [kind]: template }, verifiedIconUrl }));
        }
    }, [kind, template, verifiedIconUrl, t]);

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

/** 모양 선택 한 줄. value가 null이면(직접 고친 템플릿) 아무것도 선택하지 않은 채로 보인다. */
function LookRow<T extends string>({ label, value, options, onChange }: {
    label: string;
    value: T | null;
    options: { value: T; label: string }[];
    onChange: (v: T) => void;
}) {
    return (
        <>
            <Typography variant="body2" color="text.secondary">{label}</Typography>
            <ToggleButtonGroup size="small" exclusive value={value} onChange={(_e, v: T | null) => v && onChange(v)} aria-label={label}>
                {options.map(o => <ToggleButton key={o.value} value={o.value} sx={{ px: 2 }}>{o.label}</ToggleButton>)}
            </ToggleButtonGroup>
        </>
    );
}

/** 누르면 편집기 커서 자리에 넣는 코드 조각. */
function Code({ children, onClick }: { children: string; onClick: () => void }) {
    return (
        <Button
            size="small"
            onClick={onClick}
            sx={{ textTransform: 'none', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 12, fontWeight: 400, justifyContent: 'flex-start', px: 0.75, minWidth: 0, textAlign: 'left' }}
        >
            {children}
        </Button>
    );
}

export default function TemplateSetting() {
    const { t } = useTranslation();
    const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();
    const { templates: stored, loaded } = useStoredTemplatesState();
    const [kind, setKind] = useState<ChzzkChatKind>('chat');
    const [drafts, setDrafts] = useState<ChzzkTemplates>(DEFAULT_CHZZK_TEMPLATES);
    const [dark, setDark] = useState(true);
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const loadedRef = useRef(false);
    const editorRef = useRef<ReactCodeMirrorRef>(null);

    useEffect(() => { document.title = `${t('template.title')} - TBC`; }, []);

    // 저장된 값이 처음 들어오면 편집 중인 값을 채운다. 이후 외부 변경으로 편집 중인 걸 덮지 않는다.
    useEffect(() => {
        if (!loaded || loadedRef.current) return;
        loadedRef.current = true;
        const initial = { ...DEFAULT_CHZZK_TEMPLATES, ...stored };
        setDrafts(initial);
        // 직접 고친 템플릿이면 편집기를 펼친 채로 연다 — 모양 선택으로는 표현이 안 된다.
        if (!detectLook(initial)) setEditorOpen(true);
    }, [stored, loaded]);

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
    const look = useMemo(() => detectLook(drafts), [drafts]);

    // 직접 고친 상태에서 하나를 고르면 나머지는 기본 모양에서 시작한다.
    const pickLook = (change: Partial<TemplateLook>) => setDrafts(buildTemplates({ ...(look ?? DEFAULT_LOOK), ...change }));

    const insertField = (text: string) => {
        const view = editorRef.current?.view;
        if (!view) return;
        view.dispatch(view.state.replaceSelection(text));
        view.focus();
    };

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

            {/* 저장된 값을 읽기 전엔 기본 템플릿을 저장된 것처럼 보이지 않게 그리지 않는다 */}
            {loaded && <>
            <Card variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('template.look_title')}</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'center', columnGap: 2, rowGap: 1 }}>
                    <LookRow
                        label={t('template.look_layout')}
                        value={look?.layout ?? null}
                        options={LOOK_LAYOUTS.map(l => ({ value: l, label: t(`template.layout_${l}`) }))}
                        onChange={layout => pickLook({ layout })}
                    />
                    <LookRow
                        label={t('template.look_badges')}
                        value={look ? (look.badges ? 'show' : 'hide') : null}
                        options={[{ value: 'show', label: t('template.badges_show') }, { value: 'hide', label: t('template.badges_hide') }]}
                        onChange={v => pickLook({ badges: v === 'show' })}
                    />
                    <LookRow
                        label={t('template.look_size')}
                        value={look?.size ?? null}
                        options={LOOK_SIZES.map(z => ({ value: z, label: t(`template.size_${z}`) }))}
                        onChange={size => pickLook({ size })}
                    />
                </Box>
                {!look && <Alert severity="info" role="status" sx={{ mt: 1.5 }}>{t('template.look_custom')}</Alert>}

                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 2, mb: 1 }}>
                    <Tabs value={kind} onChange={(_e, k: ChzzkChatKind) => setKind(k)} variant="scrollable" scrollButtons="auto">
                        {TEMPLATE_KINDS.map(k => (
                            <Tab key={k} value={k} label={`${t(`template.kinds.${k}`)}${validations[k].ok ? '' : ' ⚠'}`} />
                        ))}
                    </Tabs>
                    <ToggleButtonGroup size="small" exclusive value={dark ? 'dark' : 'light'} onChange={(_e, m) => m && setDark(m === 'dark')}>
                        <ToggleButton value="dark">{t('template.preview_dark')}</ToggleButton>
                        <ToggleButton value="light">{t('template.preview_light')}</ToggleButton>
                    </ToggleButtonGroup>
                </Stack>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    {editorOpen && (
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Box sx={{ border: 1, borderColor: v.ok ? 'divider' : 'error.main', borderRadius: 1, overflow: 'hidden', fontSize: 13 }}>
                                <CodeMirror
                                    ref={editorRef}
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
                                    {t('template.error', { ...lineCol(drafts[kind], v.index), message: errorText(v), interpolation: { escapeValue: false } })}
                                </Alert>
                            )}
                            <Button
                                size="small"
                                sx={{ mt: 1 }}
                                onClick={() => setDrafts(d => ({ ...d, [kind]: DEFAULT_CHZZK_TEMPLATES[kind] }))}
                                disabled={drafts[kind] === DEFAULT_CHZZK_TEMPLATES[kind]}
                            >
                                {t('template.reset_kind', { kind: t(`template.kinds.${kind}`) })}
                            </Button>
                        </Box>
                    )}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        {/* 문법 오류 중엔 저장된(또는 기본) 템플릿으로 보여준다 — 렌더러와 같은 대체 규칙 */}
                        <Preview kind={kind} template={v.ok ? drafts[kind] : current[kind]} dark={dark} />
                    </Box>
                </Stack>

                <Stack direction="row" spacing={1} sx={{ mt: 2 }} alignItems="center">
                    <Button variant="contained" onClick={onSave} disabled={!dirty || !allValid}>
                        {t('template.save')}
                    </Button>
                    <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                        {dirty ? t('template.unsaved') : savedAt ? t('template.saved') : ''}
                    </Typography>
                    <Button size="small" onClick={() => setEditorOpen(o => !o)} aria-expanded={editorOpen}>
                        {editorOpen ? t('template.edit_html_close') : t('template.edit_html')}
                    </Button>
                </Stack>
            </Card>

            {editorOpen && (
                <Card variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="subtitle2">{t('template.fields_title')}</Typography>
                    <Typography variant="caption" color="text.secondary">{t('template.insert_hint')}</Typography>
                    <Box component="table" sx={{ mt: 1, borderCollapse: 'collapse', width: '100%', fontSize: 13, '& td': { py: 0.25, pr: 2, verticalAlign: 'middle' } }}>
                        <tbody>
                            {SYNTAX_HELP.map(h => (
                                <tr key={h.key}><td><Code onClick={() => insertField(h.code)}>{h.code}</Code></td><td>{t(`template.${h.key}`)}</td></tr>
                            ))}
                            <tr><td colSpan={2}><Typography variant="caption" color="text.secondary">{t('template.help_safety')}</Typography></td></tr>
                            {TEMPLATE_FIELDS.filter(f => !f.kinds || f.kinds.includes(kind)).map(f => (
                                // i18next는 키의 '.'을 계층으로 읽어서 문구 키는 '_'로 바꿔 둔다.
                                <tr key={f.name}>
                                    <td><Code onClick={() => insertField(usageOf(f.name))}>{usageOf(f.name)}</Code></td>
                                    <td>{t(`template.fields.${f.name.replace('.', '_')}`)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </Box>
                </Card>
            )}
            </>}

            <SocialFooter />
        </Stack>
    );
}
