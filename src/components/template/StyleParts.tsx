import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Segmented, Select, Switch, TextInput } from '@/ui';
import { DEFAULT_STYLE, FONTS, STYLE_RANGES, type TemplateStyle } from '@/render/chzzk-style';
import { DEFAULT_LOOK, LOOK_LAYOUTS, type TemplateLook } from '@/render/chzzk-templates';
import s from '../TemplateSetting.module.css';

/**
 * 템플릿 설정의 "부분" — 미리보기에서 누르거나 부분 목록에서 고르면 그 부분 설정만 상자에 나온다.
 * fields·look은 "바꾼 부분" 점과 "이 부분 되돌리기"가 보는 값.
 */
export type Part = 'window' | 'line' | 'time' | 'badge' | 'nick' | 'text' | 'emoji' | 'bubble' | 'card';

export const PARTS: { key: Part; fields: (keyof TemplateStyle)[]; look?: ('layout' | 'badges')[] }[] = [
    { key: 'window', fields: ['font', 'fontCustom', 'fontSize', 'lineHeight'], look: ['layout'] },
    { key: 'line', fields: ['rowGap', 'radius', 'divider', 'zebra', 'marker'] },
    { key: 'time', fields: ['timeColor', 'timeScale', 'timeWeight', 'timeMono'] },
    { key: 'badge', fields: ['badgeSize', 'firstBadgeOnly'], look: ['badges'] },
    { key: 'nick', fields: ['nickWeight', 'nickColor', 'nickSingleColor', 'nickEffects'] },
    { key: 'text', fields: ['textColor'] },
    { key: 'emoji', fields: ['emojiSize'] },
    { key: 'bubble', fields: ['bubbleColor'] },
    { key: 'card', fields: ['cardColor'] },
];

/** 누른 요소가 어느 부분인지. 채팅 밖(창의 빈 곳)은 창 전체. */
export function partOf(el: Element): Part {
    if (el.closest('.tbc-chat-badge, .tbc-chat-verified')) return 'badge';
    if (el.closest('.tbc-chat-emoji')) return 'emoji';
    if (el.closest('.tbcv2-chat-time')) return 'time';
    if (el.closest('.tbc-chat-nick')) return 'nick';
    if (el.closest('.tbc-chat-bubble')) return 'bubble';
    if (el.closest('.tbc-chat-text')) return 'text';
    if (el.closest('.tbc-chat--donation, .tbc-chat--subscription, .tbc-chat--gift')) return 'card';
    if (el.closest('.tbc-chat')) return 'line';
    return 'window';
}

/** look이 null이면(HTML을 직접 고친 템플릿) 구조는 비교하지 않는다. */
export function partModified(part: Part, style: TemplateStyle, look: TemplateLook | null) {
    const d = PARTS.find(p => p.key === part)!;
    return d.fields.some(f => style[f] !== DEFAULT_STYLE[f]) || (!!look && (d.look ?? []).some(f => look[f] !== DEFAULT_LOOK[f]));
}

export interface PartControlsProps {
    part: Part;
    style: TemplateStyle;
    look: TemplateLook | null;
    chatTime: boolean;
    setStyle: (change: Partial<TemplateStyle>) => void;
    setLook: (change: Partial<Pick<TemplateLook, 'layout' | 'badges'>>) => void;
    setChatTime: (on: boolean) => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <>
            <span className={s.label}>{label}</span>
            <div className={s.control}>{children}</div>
        </>
    );
}

function Range({ k, value, step = 1, unit = 'px', onChange, label }: {
    k: keyof typeof STYLE_RANGES; value: number; step?: number; unit?: string; onChange: (v: number) => void; label: string;
}) {
    const [min, max] = STYLE_RANGES[k];
    return (
        <>
            <input type="range" className={s.range} min={min} max={max} step={step} value={value} aria-label={label}
                onChange={e => onChange(Number(e.target.value))} />
            <span className={s.rangeValue}>{value}{unit}</span>
        </>
    );
}

/** 색 고르기. 8자리(#rrggbbaa)는 색 입력이 못 읽어서 앞 6자리만 넘기고 투명도는 그대로 둔다. */
function Color({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
    const alpha = value.length === 9 ? value.slice(7) : '';
    return <input type="color" className={s.color} value={value.slice(0, 7)} aria-label={label} onChange={e => onChange(e.target.value + alpha)} />;
}

/** 자동(빈 값) / 직접 고른 색. */
function AutoColor({ value, fallback, onChange, label }: { value: string; fallback: string; onChange: (v: string) => void; label: string }) {
    const { t } = useTranslation();
    return (
        <>
            <Switch checked={!!value} onChange={on => onChange(on ? fallback : '')} label={value ? undefined : t('template.style.auto')} />
            {value && <Color value={value} onChange={onChange} label={label} />}
        </>
    );
}

export function PartControls({ part, style: st, look, chatTime, setStyle, setLook, setChatTime }: PartControlsProps) {
    const { t } = useTranslation();
    const L = (k: string) => t(`template.style.${k}`);
    const layouts = LOOK_LAYOUTS.map(l => ({ value: l, label: t(`template.layout_${l}`) }));
    switch (part) {
        case 'window': return <>
            <Row label={t('template.look_layout')}>
                <Segmented size="sm" value={look?.layout ?? null} options={layouts} onChange={layout => setLook({ layout })} label={t('template.look_layout')} />
            </Row>
            <Row label={L('font')}>
                <Select size="sm" value={st.font} onChange={font => setStyle({ font })} aria-label={L('font')}
                    options={FONTS.map(f => ({ value: f.key, label: t(`template.fonts.${f.key}`) }))} />
                {st.font === 'custom' && (
                    <TextInput size="sm" value={st.fontCustom} placeholder={L('font_custom')} aria-label={L('font_custom')}
                        onChange={e => setStyle({ fontCustom: e.target.value })} style={{ width: 140 }} />
                )}
            </Row>
            <Row label={L('font_size')}><Range k="fontSize" value={st.fontSize} label={L('font_size')} onChange={fontSize => setStyle({ fontSize })} /></Row>
            <Row label={L('line_height')}><Range k="lineHeight" value={st.lineHeight} step={0.05} unit="×" label={L('line_height')} onChange={lineHeight => setStyle({ lineHeight })} /></Row>
        </>;
        case 'line': return <>
            <Row label={L('row_gap')}><Range k="rowGap" value={st.rowGap} label={L('row_gap')} onChange={rowGap => setStyle({ rowGap })} /></Row>
            <Row label={L('radius')}><Range k="radius" value={st.radius} label={L('radius')} onChange={radius => setStyle({ radius })} /></Row>
            <Row label={L('divider')}><Switch checked={st.divider} onChange={divider => setStyle({ divider })} /></Row>
            <Row label={L('zebra')}><Switch checked={st.zebra} onChange={zebra => setStyle({ zebra })} /></Row>
            <Row label={L('marker')}>
                <Segmented size="sm" value={st.marker} onChange={marker => setStyle({ marker })} label={L('marker')}
                    options={[{ value: 'none', label: L('marker_none') }, { value: 'bar', label: L('marker_bar') }, { value: 'fill', label: L('marker_fill') }]} />
            </Row>
        </>;
        case 'time': return <>
            <Row label={L('time')}>
                <Switch checked={chatTime} onChange={setChatTime} label={chatTime ? t('template.badges_show') : t('template.badges_hide')} />
            </Row>
            {chatTime && <>
                <Row label={L('color')}><AutoColor value={st.timeColor} fallback="#8a8f98" label={L('color')} onChange={timeColor => setStyle({ timeColor })} /></Row>
                <Row label={L('size')}><Range k="timeScale" value={st.timeScale} step={5} unit="%" label={L('size')} onChange={timeScale => setStyle({ timeScale })} /></Row>
                <Row label={L('weight')}>
                    <Segmented size="sm" value={String(st.timeWeight)} label={L('weight')} onChange={v => setStyle({ timeWeight: Number(v) as TemplateStyle['timeWeight'] })}
                        options={[{ value: '400', label: L('weight_400') }, { value: '700', label: L('weight_700') }]} />
                </Row>
                <Row label={L('font')}>
                    <Segmented size="sm" value={st.timeMono ? 'mono' : 'same'} label={L('font')} onChange={v => setStyle({ timeMono: v === 'mono' })}
                        options={[{ value: 'same', label: L('same_as_text') }, { value: 'mono', label: L('mono') }]} />
                </Row>
            </>}
        </>;
        case 'badge': return <>
            <Row label={t('template.look_badges')}>
                <Segmented size="sm" value={look ? (look.badges ? 'show' : 'hide') : null} label={t('template.look_badges')}
                    onChange={v => setLook({ badges: v === 'show' })}
                    options={[{ value: 'show', label: t('template.badges_show') }, { value: 'hide', label: t('template.badges_hide') }]} />
            </Row>
            {look?.badges !== false && <>
                <Row label={L('size')}><Range k="badgeSize" value={st.badgeSize} label={L('size')} onChange={badgeSize => setStyle({ badgeSize })} /></Row>
                <Row label={L('count')}>
                    <Segmented size="sm" value={st.firstBadgeOnly ? 'first' : 'all'} label={L('count')} onChange={v => setStyle({ firstBadgeOnly: v === 'first' })}
                        options={[{ value: 'all', label: L('count_all') }, { value: 'first', label: L('count_first') }]} />
                </Row>
            </>}
        </>;
        case 'nick': return <>
            <Row label={L('weight')}>
                <Segmented size="sm" value={String(st.nickWeight)} label={L('weight')} onChange={v => setStyle({ nickWeight: Number(v) as TemplateStyle['nickWeight'] })}
                    options={(['400', '500', '700', '800'] as const).map(w => ({ value: w, label: L(`weight_${w}`) }))} />
            </Row>
            <Row label={L('color')}>
                <Segmented size="sm" value={st.nickColor} label={L('color')} onChange={nickColor => setStyle({ nickColor })}
                    options={[{ value: 'chzzk', label: L('nick_chzzk') }, { value: 'single', label: L('nick_single') }, { value: 'text', label: L('same_as_text') }]} />
                {st.nickColor === 'single' && <Color value={st.nickSingleColor} label={L('color')} onChange={nickSingleColor => setStyle({ nickSingleColor })} />}
            </Row>
            <Row label={L('nick_effects')}><Switch checked={st.nickEffects} onChange={nickEffects => setStyle({ nickEffects })} /></Row>
        </>;
        case 'text': return <>
            <Row label={L('color')}><AutoColor value={st.textColor} fallback="#ffffff" label={L('color')} onChange={textColor => setStyle({ textColor })} /></Row>
        </>;
        case 'emoji': return <>
            <Row label={L('size')}><Range k="emojiSize" value={st.emojiSize} label={L('size')} onChange={emojiSize => setStyle({ emojiSize })} /></Row>
        </>;
        case 'bubble': return look?.layout === 'bubble'
            ? <Row label={L('color')}><Color value={st.bubbleColor} label={L('color')} onChange={bubbleColor => setStyle({ bubbleColor })} /></Row>
            : <Row label={t('template.look_layout')}><Button size="sm" onClick={() => setLook({ layout: 'bubble' })}>{L('to_bubble')}</Button></Row>;
        case 'card': return <>
            <Row label={L('color')}><Color value={st.cardColor} label={L('color')} onChange={cardColor => setStyle({ cardColor })} /></Row>
        </>;
    }
}
