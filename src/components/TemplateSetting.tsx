import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Notice, Segmented, Switch, Tabs } from '@/ui';
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
import s from './TemplateSetting.module.css';

/** 페이지 테마(<html data-theme>)가 어두운지. 바뀌면 따라간다. */
function useDocumentDark(): boolean {
    const read = () => document.documentElement.dataset.theme === 'dark';
    const [dark, setDark] = useState(read);
    useEffect(() => {
        const obs = new MutationObserver(() => setDark(read()));
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        setDark(read());
        return () => obs.disconnect();
    }, []);
    return dark;
}

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
        <div
            ref={ref}
            // 렌더러 CSS가 쓰는 클래스: theme_dark(닉네임 색), tbcv2_chatTime_on(시각 표시)
            className={`tbcv2_chatTime_on ${dark ? 'theme_dark' : ''} ${s.preview} ${dark ? s.previewDark : s.previewLight}`}
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
            <span className={s.label}>{label}</span>
            <Segmented size="sm" value={value} options={options} onChange={onChange} label={label} />
        </>
    );
}

/** 누르면 편집기 커서 자리에 넣는 코드 조각. */
function Code({ children, onClick }: { children: string; onClick: () => void }) {
    return (
        <button type="button" className={s.code} onClick={onClick}>
            {children}
        </button>
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
    const pageDark = useDocumentDark();
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
        <div className={s.page}>
            <Card className={s.card}>
                <h1 className={s.title}>{t('template.title')}</h1>
                <div style={{ marginTop: 12, marginBottom: 6 }}>
                    <Switch
                        checked={custom}
                        onChange={on => dispatchGlobalSetting(setChzzkCustomTemplate(on ? 'on' : 'off'))}
                        label={t('template.use_custom')}
                    />
                </div>
                <div className={s.meta}>
                    {custom ? t('template.use_custom_hint_on') : t('template.use_custom_hint_off')}
                </div>
            </Card>

            {/* 저장된 값을 읽기 전엔 기본 템플릿을 저장된 것처럼 보이지 않게 그리지 않는다 */}
            {loaded && <>
            <Card className={s.card}>
                <h2 className={s.subtitle}>{t('template.look_title')}</h2>
                <div className={s.lookGrid}>
                    <LookRow
                        label={t('template.look_layout')}
                        value={look?.layout ?? null}
                        options={LOOK_LAYOUTS.map(l => ({ value: l, label: t(`template.layout_${l}`) }))}
                        onChange={layout => pickLook({ layout })}
                    />
                    <LookRow
                        label={t('template.look_badges')}
                        value={look ? (look.badges ? 'show' : 'hide') : null}
                        options={[{ value: 'show' as const, label: t('template.badges_show') }, { value: 'hide' as const, label: t('template.badges_hide') }]}
                        onChange={v => pickLook({ badges: v === 'show' })}
                    />
                    <LookRow
                        label={t('template.look_size')}
                        value={look?.size ?? null}
                        options={LOOK_SIZES.map(z => ({ value: z, label: t(`template.size_${z}`) }))}
                        onChange={size => pickLook({ size })}
                    />
                </div>
                {!look && <div style={{ marginTop: 12 }}><Notice tone="info" role="status">{t('template.look_custom')}</Notice></div>}

                <div className={s.kindBar}>
                    <Tabs
                        value={kind}
                        onChange={setKind}
                        items={TEMPLATE_KINDS.map(k => ({ value: k, label: `${t(`template.kinds.${k}`)}${validations[k].ok ? '' : ' ⚠'}` }))}
                    />
                    <Segmented
                        size="sm"
                        value={dark ? 'dark' : 'light'}
                        onChange={m => setDark(m === 'dark')}
                        options={[
                            { value: 'dark' as const, label: t('template.preview_dark') },
                            { value: 'light' as const, label: t('template.preview_light') },
                        ]}
                    />
                </div>

                <div className={s.panes}>
                    {editorOpen && (
                        <div className={s.pane}>
                            <div className={`${s.editor} ${v.ok ? '' : s.editorError}`}>
                                <CodeMirror
                                    ref={editorRef}
                                    // 탭마다 편집 기록(실행 취소)을 따로 두려고 key로 다시 만든다.
                                    key={kind}
                                    value={drafts[kind]}
                                    onChange={val => setDrafts(d => ({ ...d, [kind]: val }))}
                                    extensions={EDITOR_EXTENSIONS}
                                    theme={pageDark ? 'dark' : 'light'}
                                    minHeight="280px"
                                    basicSetup={{ foldGutter: false, highlightActiveLine: false }}
                                />
                            </div>
                            {!v.ok && (
                                <div style={{ marginTop: 8 }}>
                                    <Notice tone="error">
                                        {t('template.error', { ...lineCol(drafts[kind], v.index), message: errorText(v), interpolation: { escapeValue: false } })}
                                    </Notice>
                                </div>
                            )}
                            <Button
                                variant="text"
                                size="sm"
                                style={{ marginTop: 8 }}
                                onClick={() => setDrafts(d => ({ ...d, [kind]: DEFAULT_CHZZK_TEMPLATES[kind] }))}
                                disabled={drafts[kind] === DEFAULT_CHZZK_TEMPLATES[kind]}
                            >
                                {t('template.reset_kind', { kind: t(`template.kinds.${kind}`) })}
                            </Button>
                        </div>
                    )}
                    <div className={s.pane}>
                        {/* 문법 오류 중엔 저장된(또는 기본) 템플릿으로 보여준다 — 렌더러와 같은 대체 규칙 */}
                        <Preview kind={kind} template={v.ok ? drafts[kind] : current[kind]} dark={dark} />
                    </div>
                </div>

                <div className={s.actions}>
                    <Button variant="primary" onClick={onSave} disabled={!dirty || !allValid}>
                        {t('template.save')}
                    </Button>
                    <span className={`${s.meta} ${s.status}`}>
                        {dirty ? t('template.unsaved') : savedAt ? t('template.saved') : ''}
                    </span>
                    <Button variant="text" size="sm" onClick={() => setEditorOpen(o => !o)} aria-expanded={editorOpen}>
                        {editorOpen ? t('template.edit_html_close') : t('template.edit_html')}
                    </Button>
                </div>
            </Card>

            {editorOpen && (
                <Card className={s.card}>
                    <h2 className={s.subtitle} style={{ marginBottom: 2 }}>{t('template.fields_title')}</h2>
                    <div className={s.meta}>{t('template.insert_hint')}</div>
                    <table className={s.fields}>
                        <tbody>
                            {SYNTAX_HELP.map(h => (
                                <tr key={h.key}><td><Code onClick={() => insertField(h.code)}>{h.code}</Code></td><td>{t(`template.${h.key}`)}</td></tr>
                            ))}
                            <tr><td colSpan={2}><span className={s.meta}>{t('template.help_safety')}</span></td></tr>
                            {TEMPLATE_FIELDS.filter(f => !f.kinds || f.kinds.includes(kind)).map(f => (
                                // i18next는 키의 '.'을 계층으로 읽어서 문구 키는 '_'로 바꿔 둔다.
                                <tr key={f.name}>
                                    <td><Code onClick={() => insertField(usageOf(f.name))}>{usageOf(f.name)}</Code></td>
                                    <td>{t(`template.fields.${f.name.replace('.', '_')}`)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            )}
            </>}

            <SocialFooter />
        </div>
    );
}
