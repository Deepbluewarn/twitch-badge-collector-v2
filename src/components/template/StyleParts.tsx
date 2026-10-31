import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Segmented, Select, Switch, TextInput } from '@/ui';
import { DONATION_LEVEL_BG, FONTS, PART_KEYS, PART_SPEC, partIsDefault, type FieldGroup, type FieldSpec, type FieldValue, type Part, type PartStyle, type TemplateStyle } from '@/render/chzzk-style';
import { DEFAULT_LOOK, LOOK_LAYOUTS, type TemplateLook } from '@/render/chzzk-templates';
import s from '../TemplateSetting.module.css';

/**
 * 템플릿 설정의 "부분" — 미리보기에서 누르거나 부분 목록에서 고르면 그 부분 설정만 상자에 나온다.
 * 상자는 묶음(기본·글자·배경)을 탭으로 나눈다. 줄은 PART_SPEC을 그대로 따라 그린다.
 * look은 그 부분이 함께 다루는 템플릿 구조 — "바꾼 부분" 점과 "이 부분 되돌리기"가 함께 본다.
 */
export type { Part };
export const PARTS = PART_KEYS;
const PART_LOOK: Partial<Record<Part, ('layout' | 'badges')[]>> = { window: ['layout'], badge: ['badges'] };

/** 누른 요소가 어느 부분인지. 채팅 밖(창의 빈 곳)은 창 전체. */
export function partOf(el: Element): Part {
    if (el.closest('.tbc-chat-badge, .tbc-chat-verified')) return 'badge';
    if (el.closest('.tbc-chat-emoji')) return 'emoji';
    if (el.closest('.tbcv2-chat-time')) return 'time';
    if (el.closest('.tbc-chat-nick')) return 'nick';
    if (el.closest('.tbc-chat-cleanbot, .tbc-chat-blinded')) return 'hidden';
    if (el.closest('.tbc-chat-bubble')) return 'bubble';
    if (el.closest('.tbc-chat-text, .tbc-chat-mission')) return 'text';
    if (el.closest('.tbc-chat--donation, .tbc-chat--subscription, .tbc-chat--gift')) return 'card';
    if (el.closest('.tbc-chat')) return 'line';
    return 'window';
}

/** 미리보기에서 누른 부분을 가리킬 요소. */
export const PART_ANCHOR = '.tbc-chat-badge, .tbc-chat-verified, .tbc-chat-emoji, .tbcv2-chat-time, .tbc-chat-nick, .tbc-chat-cleanbot, .tbc-chat-blinded, .tbc-chat-bubble, .tbc-chat-text, .tbc-chat-mission, .tbc-chat';

/** look이 null이면(HTML을 직접 고친 템플릿) 구조는 비교하지 않는다. */
export function partModified(part: Part, style: TemplateStyle, look: TemplateLook | null) {
    return !partIsDefault(style, part) || (!!look && (PART_LOOK[part] ?? []).some(f => look[f] !== DEFAULT_LOOK[f]));
}

export function partLookDefaults(part: Part): Partial<Pick<TemplateLook, 'layout' | 'badges'>> {
    return Object.fromEntries((PART_LOOK[part] ?? []).map(f => [f, DEFAULT_LOOK[f]]));
}

export interface PartControlsProps {
    part: Part;
    style: TemplateStyle;
    look: TemplateLook | null;
    chatTime: boolean;
    setPartStyle: (change: PartStyle) => void;
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

/** 색 고르기. 8자리(#rrggbbaa)는 색 입력이 못 읽어서 앞 6자리만 넘기고 투명도는 그대로 둔다. */
function Color({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
    const alpha = value.length === 9 ? value.slice(7) : '';
    return <input type="color" className={s.color} value={value.slice(0, 7)} aria-label={label} onChange={e => onChange(e.target.value + alpha)} />;
}

/** 이 부분이 보이는 상태일 때만 설정을 보인다 — 시각을 끄거나 배지를 숨기면 설정할 게 없다. */
function partHidden(part: Part, look: TemplateLook | null, chatTime: boolean) {
    if (part === 'time') return !chatTime;
    if (part === 'badge') return look?.badges === false;
    if (part === 'bubble') return look?.layout !== 'bubble';
    return false;
}

/** 다른 값에 따라 의미가 없는 줄은 감춘다. */
function fieldShown(k: string, v: PartStyle): boolean {
    if (k === 'fontCustom') return v.font === 'custom';
    if (k === 'borderColor' || k === 'borderSide') return (v.borderWidth as number) > 0;
    if (k === 'dividerColor') return v.divider === true;
    if (k === 'zebraColor') return v.zebra === true;
    if (k === 'opacity') return v.mode === 'dim';
    return true;
}

/** 자동 색을 켤 때 처음 보일 색 — 기본값이 있으면 그것, 없으면 무난한 색. */
const COLOR_START: Partial<Record<string, string>> = {
    bg: '#80808033', color: '#ffffff', amountColor: '#ffd400',
    ...Object.fromEntries(DONATION_LEVEL_BG.map((c, i) => [`donationLevel${i}`, c])),
};

function Field({ part, k, f, value, onChange }: { part: Part; k: string; f: FieldSpec; value: FieldValue; onChange: (v: FieldValue) => void }) {
    const { t } = useTranslation();
    const L = (key: string) => t(`template.style.${key}`);
    const label = part === 'window' && k === 'size' ? L('font_size') : L(k);
    const optionLabel = (v: string | number) => {
        // 금액은 원래 굵은 글자(<strong>)라 "창과 같게"가 아니라 기본값
        if (v === 0 && k === 'amountWeight') return L('default');
        if (k === 'font') return t(`template.fonts.${v}`);
        if (k === 'weight' || k === 'amountWeight') return L(`weight_${v}`);
        if (k === 'borderSide') return L(`side_${v}`);
        if (k === 'marker') return L(`marker_${v}`);
        if (k === 'mode') return L(`hidden_${v}`);
        return String(v);
    };
    switch (f.t) {
        case 'range': return (
            <Row label={label}>
                <input type="range" className={s.range} min={f.min} max={f.max} step={f.step} value={value as number} aria-label={label}
                    onChange={e => onChange(Number(e.target.value))} />
                <span className={s.rangeValue}>{value}{f.unit}</span>
            </Row>
        );
        case 'bool': return <Row label={label}><Switch checked={value as boolean} onChange={onChange} /></Row>;
        case 'name': return (
            <Row label={label}>
                <TextInput size="sm" value={value as string} placeholder={label} aria-label={label}
                    onChange={e => onChange(e.target.value)} style={{ width: 160 }} />
            </Row>
        );
        case 'enum': {
            // 'inherit'·0은 이 부분에 따로 정하지 않은 상태 — 값 사이에 두지 않고 따로 떨어진 '끄기'로 보인다.
            // 끄기는 값을 고르는 게 아니라 정한 값을 지우는 것이라 모양도 다르게.
            const off = k !== 'amountWeight' && (f.values[0] === 'inherit' || f.values[0] === 0) ? f.values[0] : undefined;
            const isOff = off !== undefined && value === off;
            const values = off === undefined ? f.values : f.values.slice(1);
            const offButton = off !== undefined && (
                <button type="button" className={s.offButton} aria-pressed={isOff} onClick={() => onChange(off)}>
                    <span className="material-icons-round" aria-hidden="true">block</span>{L('inherit')}
                </button>
            );
            // 선택지가 많은 글꼴은 고르기 상자로. 끄기는 목록 첫 항목(구분선 위), 글꼴 이름은 그 글꼴로 보인다
            if (k === 'font') return (
                <Row label={label}>
                    <Select size="sm" className={s.fontSelect} value={String(value)} onChange={onChange} aria-label={label}
                        options={[
                            ...(off !== undefined ? [{ value: String(off), label: L('inherit'), icon: 'block', clear: true }] : []),
                            ...values.map(v => ({ value: String(v), label: optionLabel(v), style: { fontFamily: FONTS.find(f => f.key === v)?.family || undefined } })),
                        ]} />
                </Row>
            );
            return (
                <Row label={label}>
                    {offButton}
                    <Segmented size="sm" value={isOff ? null : String(value)} label={label}
                        onChange={v => onChange(typeof f.def === 'number' ? Number(v) : v)}
                        options={values.map(v => ({ value: String(v), label: optionLabel(v) }))} />
                </Row>
            );
        }
        case 'color':
            if (f.auto === undefined) return <Row label={label}><Color value={value as string} label={label} onChange={onChange} /></Row>;
            return (
                <Row label={label}>
                    <Switch checked={!!value} onChange={on => onChange(on ? (f.def || COLOR_START[k] || '#ffffff') : '')} />
                    {!!value && <Color value={value as string} label={label} onChange={onChange} />}
                </Row>
            );
    }
}

const GROUP_ORDER: FieldGroup[] = ['own', 'text', 'box'];

export function PartControls({ part, style, look, chatTime, setPartStyle, setLook, setChatTime }: PartControlsProps) {
    const { t } = useTranslation();
    const L = (k: string) => t(`template.style.${k}`);
    const v = style[part];
    const hidden = partHidden(part, look, chatTime) || (part === 'hidden' && v.mode === 'hide');
    const specs = Object.entries(PART_SPEC[part]);

    // 부분 표시 여부·구조처럼 템플릿·다른 설정에 걸린 줄 — 기본 탭 맨 위
    const extras: React.ReactNode[] = [];
    // 배치는 창 전체와 말풍선 양쪽에서 — 말풍선에서 켠 걸 거기서 바로 끌 수 있게
    if (part === 'window' || part === 'bubble') extras.push(
        <Row key="layout" label={t('template.look_layout')}>
            <Segmented size="sm" value={look?.layout ?? null} label={t('template.look_layout')} onChange={layout => setLook({ layout })}
                options={LOOK_LAYOUTS.map(l => ({ value: l, label: t(`template.layout_${l}`) }))} />
        </Row>,
    );
    if (part === 'time') extras.push(
        <Row key="show" label={L('time')}>
            <Switch checked={chatTime} onChange={setChatTime} label={chatTime ? t('template.badges_show') : t('template.badges_hide')} />
        </Row>,
    );
    if (part === 'badge') extras.push(
        <Row key="show" label={t('template.look_badges')}>
            <Segmented size="sm" value={look ? (look.badges ? 'show' : 'hide') : null} label={t('template.look_badges')}
                onChange={b => setLook({ badges: b === 'show' })}
                options={[{ value: 'show', label: t('template.badges_show') }, { value: 'hide', label: t('template.badges_hide') }]} />
        </Row>,
    );
    // 가려진 채팅을 숨기면 표시 방식만 남는다
    const visible = (g: FieldGroup) => specs.filter(([k, f]) => f.g === g && fieldShown(k, v) && (!hidden || (part === 'hidden' && k === 'mode')));
    const groups = GROUP_ORDER.filter(g => visible(g).length > 0 || (g === 'own' && extras.length > 0));
    const [tab, setTab] = useState<FieldGroup>(groups[0] ?? 'own');
    const current = groups.includes(tab) ? tab : groups[0];

    return <>
        {groups.length > 1 && (
            <div className={s.groupTabs}>
                <Segmented size="sm" value={current} onChange={setTab} label={t(`template.parts.${part}`)}
                    options={groups.map(g => ({ value: g, label: L(`group_${g}`) }))} />
            </div>
        )}
        <div className={s.controls}>
            {current === 'own' && extras}
            {current && visible(current).map(([k, f]) => (
                <Field key={k} part={part} k={k} f={f} value={v[k]} onChange={x => setPartStyle({ [k]: x })} />
            ))}
        </div>
    </>;
}
