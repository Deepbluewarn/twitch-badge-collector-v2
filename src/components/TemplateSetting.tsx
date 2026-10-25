import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Dialog, Notice, Segmented, Select, Switch, TextArea } from '@/ui';
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { linter, type Diagnostic } from '@codemirror/lint';
import { useGlobalSettingContext } from '@/context/GlobalSetting';
import { setChatTime, setChzzkCustomTemplate } from '@/reducer/setting';
import { renderChzzkChat } from '@/render/chzzk-render';
import { DEFAULT_CHZZK_TEMPLATES, DEFAULT_LOOK, buildTemplates, detectLook, type ChzzkTemplates, type TemplateLook } from '@/render/chzzk-templates';
import type { ChzzkChatKind } from '@/render/chzzk-chat-view';
import { TEMPLATE_KINDS, saveTemplates, useStoredTemplatesState, validateTemplate, type TemplateValidation } from '@/render/template-store';
import { TEMPLATE_FIELDS, TEMPLATE_SAMPLES } from '@/render/template-samples';
import {
    DEFAULT_STYLE, PRESETS, ensureStyleFont, exportStyleCode, importStyleCode, presetTemplates, saveStyle,
    styleCss, templatesToStore, useStoredStyleState, withStyle, type PartStyle, type TemplateStyle,
} from '@/render/chzzk-style';
import { getPlatformConfig } from '@/platform/host-selectors';
import { PART_ANCHOR, PARTS, PartControls, partLookDefaults, partModified, partOf, type Part } from './template/StyleParts';
import { LinkRow, Note, RowLabel, SectionTitle, SettingRow, SettingsCard, SubHeader, settingsClass as ui } from './settings/SettingsUI';
import i18n from '@/translate/i18n';
import { useConfirm } from '@/ui/useConfirm';
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

/** 쓸 수 있는 값 — 묶음과 짧은 이름(긴 설명은 마우스를 올리면). 편집 중인 종류의 묶음이 맨 위로 */
const FIELD_GROUPS: { id: string; kind?: ChzzkChatKind; names: string[] }[] = [
    { id: 'basic', names: ['nickname', 'messageHtml', 'time', 'badges'] },
    { id: 'donation', kind: 'donation', names: ['donation.amountText', 'donation.missionText', 'donation.mission', 'donation.amount'] },
    { id: 'subscription', kind: 'subscription', names: ['subscription.month', 'subscription.tierName'] },
    { id: 'gift', kind: 'gift', names: ['gift.quantity', 'gift.tierName', 'gift.receiverNickname', 'gift.toChannel'] },
    { id: 'condition', names: ['hasMessage', 'cleanbot', 'blinded', 'anonymous', 'verifiedIconUrl'] },
    { id: 'nick', names: ['nickStyle', 'nickEffect', 'nickColorLight', 'nickColorDark', 'message'] },
];

/** 미리보기 채팅 — 실제 모아보기처럼 종류를 섞는다. marker는 그 채팅을 모은 필터의 표시 색. */
const S = TEMPLATE_SAMPLES;
const PREVIEW_MIX: { chat: (typeof S.chat)[number]['chat']; marker?: string }[] = [
    { chat: S.chat[0].chat, marker: '#FFC107' },
    { chat: S.chat[1].chat, marker: '#4da3ff' },
    { chat: S.chat[6].chat },
    { chat: S.chat[2].chat },
    { chat: S.donation[0].chat, marker: '#FFC107' },
    { chat: S.chat[3].chat },
    { chat: S.subscription[0].chat, marker: '#ff7ab6' },
    { chat: S.chat[4].chat },
    { chat: S.gift[0].chat },
    { chat: S.donation[2].chat },
    { chat: S.chat[5].chat },
];

/**
 * 모아보기처럼 그린 미리보기. 누르면 그 부분을 고르고(onPick), 마우스를 올리면 부분 이름을 띄운다.
 * 렌더러가 만든 요소를 그대로 붙인다 — 이미 sanitize된 요소다.
 */
function Preview({ templates, style, dark, chatTime, part, onPick, boxRef }: {
    templates: ChzzkTemplates; style: TemplateStyle; dark: boolean; chatTime: boolean;
    part: Part | null; onPick: (p: Part, rect?: DOMRect) => void;
    /** 미리보기 창 요소 — 부분 상자를 그 옆에 붙이는 데 쓴다 */
    boxRef?: React.RefObject<HTMLDivElement | null>;
}) {
    const { t } = useTranslation();
    const ownRef = useRef<HTMLDivElement>(null);
    const ref = boxRef ?? ownRef;
    const [hover, setHover] = useState<{ p: Part; x: number; y: number } | null>(null);
    const verifiedIconUrl = getPlatformConfig('chzzk').constants?.verifiedBadgeImageUrl as string | undefined;

    useEffect(() => {
        const box = ref.current;
        if (!box) return;
        box.replaceChildren();
        PREVIEW_MIX.forEach(({ chat, marker }, i) => {
            const el = renderChzzkChat(chat, { templates, verifiedIconUrl });
            if (marker) {
                el.classList.add('tbc-chat--marked');
                el.style.setProperty('--tbc-marker-color', marker);
            }
            if (i % 2) el.classList.add('tbc-chat--alt');
            box.append(el);
        });
    }, [templates, verifiedIconUrl]);

    const css = useMemo(() => styleCss(style), [style]);
    return (
        // 렌더러 CSS가 쓰는 클래스: theme_dark(닉네임 색), tbcv2_chatTime_on/off(시각 표시)
        <div className={`${dark ? 'theme_dark' : ''} ${s.previewStage}`}>
            <style>{css}</style>
            <div
                ref={ref}
                data-part={part ?? undefined}
                className={`tbc-styled ${chatTime ? 'tbcv2_chatTime_on' : 'tbcv2_chatTime_off'} ${s.preview} ${dark ? s.previewDark : s.previewLight}`}
                onClick={e => {
                    e.preventDefault();   // 클린봇 <details>가 펼쳐지지 않게
                    const target = e.target as HTMLElement;
                    const p = partOf(target);
                    const anchor = p === 'window' ? undefined : (target.closest(PART_ANCHOR) ?? target);
                    onPick(p, anchor?.getBoundingClientRect());
                }}
                onMouseMove={e => setHover({ p: partOf(e.target as HTMLElement), x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(null)}
            />
            {hover && <div className={s.hoverLabel} style={{ left: hover.x + 14, top: hover.y + 14 }}>{t(`template.parts.${hover.p}`)}</div>}
        </div>
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

const STYLE_SAVE_DELAY = 250;

export default function TemplateSetting() {
    const { t } = useTranslation();
    const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();
    const { templates: stored, loaded } = useStoredTemplatesState();
    const { style: storedStyle, loaded: styleLoaded } = useStoredStyleState();
    const [kind, setKind] = useState<ChzzkChatKind>('chat');
    const [drafts, setDrafts] = useState<ChzzkTemplates>(DEFAULT_CHZZK_TEMPLATES);
    const [style, setStyleState] = useState<TemplateStyle>(DEFAULT_STYLE);
    const [dark, setDark] = useState(true);
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [sideTab, setSideTab] = useState<'preview' | 'fields'>('preview');
    const [copied, setCopied] = useState(false);
    const [applyOpen, setApplyOpen] = useState(false);
    const [applyInput, setApplyInput] = useState('');
    const [applyError, setApplyError] = useState('');
    const applyCode = async () => {
        const r = await importStyleCode(applyInput);
        if (!r) { setApplyError(t('template.share_invalid')); return; }
        if (await replaceTemplates({ ...DEFAULT_CHZZK_TEMPLATES, ...r.templates }, false)) setStyle(r.style);
        setApplyOpen(false);
    };
    const [part, setPart] = useState<Part | null>(null);
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const loadedRef = useRef(false);
    const styleLoadedRef = useRef(false);
    const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const editorRef = useRef<ReactCodeMirrorRef>(null);
    const [confirm, confirmDialog] = useConfirm();

    useEffect(() => { document.title = `${t('template.title')} - TBC`; }, []);

    // 저장된 값이 처음 들어오면 편집 중인 값을 채운다. 이후 외부 변경으로 편집 중인 걸 덮지 않는다.
    useEffect(() => {
        if (!loaded || loadedRef.current) return;
        loadedRef.current = true;
        const initial = { ...DEFAULT_CHZZK_TEMPLATES, ...stored };
        setDrafts(initial);
    }, [stored, loaded]);
    useEffect(() => {
        if (!styleLoaded || styleLoadedRef.current) return;
        styleLoadedRef.current = true;
        setStyleState(storedStyle);
    }, [storedStyle, styleLoaded]);
    useEffect(() => ensureStyleFont(style), [style]);

    // 상자는 화면 위치에 붙어 있어서 스크롤·크기 변경 뒤엔 엉뚱한 곳을 가리킨다 — 닫는다.
    useEffect(() => {
        const close = () => setPart(null);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPart(null); };
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
            window.removeEventListener('keydown', onKey);
        };
    }, []);

    const current = { ...DEFAULT_CHZZK_TEMPLATES, ...stored };
    const dirty = TEMPLATE_KINDS.some(k => drafts[k] !== current[k]);
    const validations = useMemo(
        () => Object.fromEntries(TEMPLATE_KINDS.map(k => [k, validateTemplate(drafts[k])])) as Record<ChzzkChatKind, ReturnType<typeof validateTemplate>>,
        [drafts],
    );
    const allValid = TEMPLATE_KINDS.every(k => validations[k].ok);
    const v = validations[kind];
    const custom = globalSetting.chzzkCustomTemplate === 'on';
    const chatTime = globalSetting.chatTime === 'on';
    const pageDark = useDocumentDark();
    const look = useMemo(() => detectLook(drafts), [drafts]);
    // 문법 오류 중엔 저장된(또는 기본) 템플릿으로 보여준다 — 렌더러와 같은 대체 규칙
    const previewTemplates = useMemo(
        () => Object.fromEntries(TEMPLATE_KINDS.map(k => [k, validations[k].ok ? drafts[k] : current[k]])) as ChzzkTemplates,
        [drafts, validations, stored],
    );

    // 스타일은 고치는 대로 저장한다 — 열려 있는 치지직 탭의 모아보기가 바로 따라 바뀐다.
    const setStyle = useCallback((change: TemplateStyle | ((prev: TemplateStyle) => TemplateStyle)) => {
        setStyleState(prev => {
            const next = typeof change === 'function' ? change(prev) : change;
            clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(() => saveStyle(next), STYLE_SAVE_DELAY);
            return next;
        });
    }, []);
    useEffect(() => () => clearTimeout(saveTimer.current), []);

    /** 템플릿 네 종류를 바꾸고 바로 저장한다. 직접 고친 템플릿을 덮을 때는 묻는다. */
    const replaceTemplates = async (next: ChzzkTemplates, ask = true) => {
        if (ask && !detectLook(drafts) && !await confirm({ title: t('template.confirm_overwrite'), confirmLabel: t('template.overwrite'), cancelLabel: t('common.cancel') })) return false;
        setDrafts(next);
        await saveTemplates(templatesToStore(next));
        return true;
    };

    // 직접 고친 상태에서 구조를 고르면 나머지는 기본 모양에서 시작한다.
    const setLook = (change: Partial<Pick<TemplateLook, 'layout' | 'badges'>>) =>
        replaceTemplates(buildTemplates({ ...(look ?? DEFAULT_LOOK), ...change, size: 'normal' }));

    const applyPreset = async (id: string) => {
        const p = PRESETS.find(x => x.id === id);
        if (!p) return;
        if (!(await replaceTemplates({ ...DEFAULT_CHZZK_TEMPLATES, ...presetTemplates(p) }))) return;
        setStyle(withStyle(DEFAULT_STYLE, p.style));
    };

    const resetPart = (p: Part) => {
        setStyle(prev => ({ ...prev, [p]: DEFAULT_STYLE[p] }));
        const lookDefaults = partLookDefaults(p);
        if (look && Object.keys(lookDefaults).length) setLook(lookDefaults);
    };

    // 부분 상자는 늘 미리보기 창 옆에 — 누른 요소 옆에 붙이면 미리보기를 가린다. 높이만 누른 줄에 맞춘다.
    const previewBoxRef = useRef<HTMLDivElement>(null);
    const pickPart = (p: Part, rect?: DOMRect) => {
        const box = previewBoxRef.current?.getBoundingClientRect();
        setPart(p);
        setAnchor(box ? new DOMRect(box.left, rect?.top ?? box.top, box.width, 0) : rect ?? null);
    };

    const insertField = (text: string) => {
        const view = editorRef.current?.view;
        if (!view) return;
        view.dispatch(view.state.replaceSelection(text));
        view.focus();
    };

    const onSave = async () => {
        // 기본값과 같은 종류는 저장하지 않는다 — 나중에 기본 템플릿이 바뀌면 그대로 따라가게.
        await saveTemplates(templatesToStore(drafts));
        setSavedAt(Date.now());
    };

    // 부분 상자는 미리보기 창 오른쪽(자리가 없으면 왼쪽)에, 화면 안으로
    const BOX_WIDTH = 440;
    const boxPos = anchor && {
        left: anchor.right + 12 + BOX_WIDTH < window.innerWidth ? anchor.right + 12 : Math.max(8, anchor.left - 12 - BOX_WIDTH),
        top: Math.max(8, Math.min(anchor.top - 8, window.innerHeight - 440)),
    };

    // HTML 직접 편집은 하위 페이지 — 편집에 넓은 화면이 필요해 본문 열보다 넓게, 미리보기는 옆에 붙인다
    if (editorOpen && loaded && styleLoaded) return (
        <div className={s.wide}>
            <SubHeader title={t('template.edit_html')} backLabel={t('template.close')} onBack={() => setEditorOpen(false)}>
                <span className={ui.status}>{dirty ? t('template.unsaved') : savedAt ? t('template.saved') : ''}</span>
                <Button variant="text" size="sm" onClick={() => setDrafts(d => ({ ...d, [kind]: DEFAULT_CHZZK_TEMPLATES[kind] }))}
                    disabled={drafts[kind] === DEFAULT_CHZZK_TEMPLATES[kind]}>
                    {t('template.reset_kind', { kind: t(`template.kinds.${kind}`) })}
                </Button>
                <Button size="sm" variant="primary" onClick={onSave} disabled={!dirty || !allValid}>{t('template.save')}</Button>
            </SubHeader>
            <div className={s.split}>
                <SettingsCard>
                    <SettingRow>
                        <Segmented size="sm" value={kind} onChange={setKind} label={t('template.edit_html')}
                            options={TEMPLATE_KINDS.map(k => ({ value: k, label: `${t(`template.kinds.${k}`)}${validations[k].ok ? '' : ' ⚠'}` }))} />
                    </SettingRow>
                    <div className={s.editorBody}>
                        <div className={`${s.editor} ${v.ok ? '' : s.editorError}`}>
                            <CodeMirror
                                ref={editorRef}
                                // 탭마다 편집 기록(실행 취소)을 따로 두려고 key로 다시 만든다.
                                key={kind}
                                value={drafts[kind]}
                                onChange={val => setDrafts(d => ({ ...d, [kind]: val }))}
                                extensions={EDITOR_EXTENSIONS}
                                theme={pageDark ? 'dark' : 'light'}
                                minHeight="420px"
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
                    </div>
                </SettingsCard>
                <div className={s.side}>
                    <Segmented size="sm" value={sideTab} onChange={setSideTab} label={t('template.edit_html')}
                        options={[{ value: 'preview', label: t('template.preview') }, { value: 'fields', label: t('template.fields_title') }]} />
                    {sideTab === 'preview' ? (
                        <div className={s.sideScroll}>
                            <Preview templates={previewTemplates} style={style} dark={dark} chatTime={chatTime} part={null} onPick={() => {}} />
                        </div>
                    ) : (
                        <div className={s.sideScroll}>
                            {FIELD_GROUPS.filter(g => !g.kind || g.kind === kind).sort((a, b) => (b.kind === kind ? 1 : 0) - (a.kind === kind ? 1 : 0)).map(g => (
                                <section key={g.id} className={s.fieldGroup}>
                                    <h3 className={s.h3}>{t(`template.field_groups.${g.id}`)}</h3>
                                    <SettingsCard>
                                        {g.names.map(name => (
                                            // i18next는 키의 '.'을 계층으로 읽어서 문구 키는 '_'로 바꿔 둔다.
                                            <div key={name} className={s.field} title={t(`template.fields.${name.replace('.', '_')}`)}>
                                                <span>{t(`template.field_short.${name.replace('.', '_')}`)}</span>
                                                <Code onClick={() => insertField(usageOf(name))}>{usageOf(name)}</Code>
                                            </div>
                                        ))}
                                    </SettingsCard>
                                </section>
                            ))}
                            <details className={s.syntax}>
                                <summary>{t('template.syntax')}</summary>
                                {SYNTAX_HELP.map(h => (
                                    <div key={h.key} className={s.field}><span>{t(`template.${h.key}`)}</span><Code onClick={() => insertField(h.code)}>{h.code}</Code></div>
                                ))}
                                <Note>{t('template.help_safety')}</Note>
                            </details>
                        </div>
                    )}
                </div>
            </div>
            {confirmDialog}
        </div>
    );

    return (
        <>
            <SectionTitle>{t('template.section_display')}</SectionTitle>
            <SettingsCard>
                <SettingRow label={t('template.use_custom')}>
                    <Switch checked={custom} onChange={on => dispatchGlobalSetting(setChzzkCustomTemplate(on ? 'on' : 'off'))} />
                </SettingRow>
                {loaded && styleLoaded && <>
                    <SettingRow label={t('template.presets.title')}>
                        <Select size="sm" value="" className={s.presetSelect} onChange={applyPreset} aria-label={t('template.presets.title')}
                            options={[{ value: '', label: t('template.presets.title'), disabled: true }, ...PRESETS.map(p => ({ value: p.id, label: t(`template.presets.${p.id}`) }))]} />
                    </SettingRow>
                    {/* 복사와 적용을 따로 — 적용은 붙여 넣는 대화상자 */}
                    <SettingRow label={t('template.share')}>
                        <span className={ui.status} role="status">{copied ? t('template.share_copied') : ''}</span>
                        <Button size="sm" icon="content_copy" onClick={async () => {
                            await navigator.clipboard.writeText(await exportStyleCode(style, templatesToStore(drafts)));
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                        }}>{t('template.share_copy')}</Button>
                        <Button size="sm" icon="input" onClick={() => { setApplyOpen(true); setApplyInput(''); setApplyError(''); }}>{t('template.share_apply')}</Button>
                    </SettingRow>
                    <LinkRow onClick={() => { setEditorOpen(true); setPart(null); }}>
                        <RowLabel label={t('template.edit_html')} />
                    </LinkRow>
                </>}
            </SettingsCard>

            {/* 저장된 값을 읽기 전엔 기본값을 저장된 것처럼 보이지 않게 그리지 않는다 */}
            {loaded && styleLoaded && <>
                <SectionTitle actions={
                    <Segmented
                        size="sm"
                        value={dark ? 'dark' : 'light'}
                        onChange={m => setDark(m === 'dark')}
                        options={[
                            { value: 'dark' as const, label: t('template.preview_dark') },
                            { value: 'light' as const, label: t('template.preview_light') },
                        ]}
                    />
                }>{t('template.preview')}</SectionTitle>
                <SettingsCard className={s.previewCard}>
                    <div className={s.parts}>
                            {PARTS.map(key => (
                                <button key={key} type="button" className={s.partChip} aria-pressed={part === key}
                                    onClick={() => pickPart(key)}>
                                    {t(`template.parts.${key}`)}
                                    {partModified(key, style, look) && <span className={s.partDot} aria-hidden="true" />}
                                </button>
                            ))}
                    </div>
                    <Preview templates={previewTemplates} style={style} dark={dark} chatTime={chatTime} part={part} onPick={pickPart} boxRef={previewBoxRef} />
                </SettingsCard>

                {part && boxPos && (
                    <Card className={s.partBox} style={boxPos} role="dialog" aria-label={t(`template.parts.${part}`)}>
                        <div className={s.partBoxHead}>
                            <h2 className={s.subtitle}>{t(`template.parts.${part}`)}</h2>
                            <button type="button" className={`material-icons-round ${s.close}`} aria-label={t('template.close')} onClick={() => setPart(null)}>close</button>
                        </div>
                        <PartControls
                            key={part} part={part} style={style} look={look} chatTime={chatTime}
                            setPartStyle={(change: PartStyle) => setStyle(prev => ({ ...prev, [part]: { ...prev[part], ...change } }))}
                            setLook={setLook}
                            setChatTime={on => dispatchGlobalSetting(setChatTime(on ? 'on' : 'off'))}
                        />
                        <Button variant="text" size="sm" style={{ marginTop: 8 }} disabled={!partModified(part, style, look)} onClick={() => resetPart(part)}>
                            {t('template.style.reset_part')}
                        </Button>
                    </Card>
                )}
            </>}

            <Dialog open={applyOpen} onClose={() => setApplyOpen(false)} title={t('template.share_apply')} width="xs"
                actions={<>
                    <Button size="sm" onClick={() => setApplyOpen(false)}>{t('common.cancel')}</Button>
                    <Button size="sm" variant="primary" disabled={!applyInput.trim()} onClick={() => void applyCode()}>{t('template.apply')}</Button>
                </>}>
                <TextArea rows={3} value={applyInput} placeholder="TBC2:…" aria-label={t('template.share_apply')} autoFocus
                    onChange={e => { setApplyInput(e.target.value); setApplyError(''); }} className={s.applyInput} />
                {applyError && <div className={s.applyError} role="alert">{applyError}</div>}
            </Dialog>
            {confirmDialog}
        </>
    );
}
