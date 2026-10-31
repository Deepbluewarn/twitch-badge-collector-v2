import { useEffect, useState } from "react";
import { buildTemplates, detectLook, DEFAULT_CHZZK_TEMPLATES, upgradeLegacyLook, type TemplateLook } from "./chzzk-templates";
import { TEMPLATE_KINDS, TEMPLATE_STORAGE_KEY, sanitizeStoredTemplates, validateTemplate, type StoredTemplates } from "./template-store";

/**
 * 치지직 모아보기 채팅의 스타일 — storage.local `chzzkTemplateStyle`.
 *
 * 모양은 두 층이다. 구조(배치·배지 표시)는 템플릿 HTML이 정하고, 크기·색·간격은 여기 값으로
 * 만든 CSS(styleCss)가 정한다. CSS는 `tbc-chat-*` 클래스만 보므로 HTML을 직접 고친 템플릿에도 그대로 먹는다.
 * 사용자 템플릿이 켜져 있을 때만 건다 — 꺼져 있으면 원본 복제, 대체 렌더도 기본 모양.
 *
 * 값은 부분(Part)마다 같은 틀이다: 글자(text) 묶음, 배경(box) 묶음, 그 부분만의 기본(own) 묶음.
 * 무엇이 있는지는 PART_SPEC 한 곳에서 정하고, 정리·CSS·공유 코드·설정 화면이 모두 이걸 따라간다.
 */

export const STYLE_STORAGE_KEY = 'chzzkTemplateStyle';

export type FontKey = 'chzzk' | 'system' | 'pretendard' | 'gothic' | 'round' | 'serif' | 'mono' | 'custom';

/**
 * 글꼴 선택지. Pretendard만 확장에 넣었고(public/fonts, 원본 그대로 — OFL 예약 이름이라 자르지 않는다),
 * 나머지는 사용자 PC에 설치된 글꼴을 쓴다. 없으면 다음 후보로 넘어간다.
 */
export const FONTS: { key: FontKey; family: string }[] = [
    { key: 'chzzk', family: '-apple-system, BlinkMacSystemFont, "Malgun Gothic", "맑은 고딕", Helvetica, Arial, sans-serif' },
    { key: 'system', family: 'system-ui, sans-serif' },
    { key: 'pretendard', family: '"TBC Pretendard", "Pretendard Variable", Pretendard, sans-serif' },
    { key: 'gothic', family: '"Nanum Gothic", NanumGothic, "나눔고딕", sans-serif' },
    { key: 'round', family: 'NanumSquareRound, "나눔스퀘어라운드", Jua, sans-serif' },
    { key: 'serif', family: '"Nanum Myeongjo", "나눔명조", Batang, "바탕", serif' },
    { key: 'mono', family: 'D2Coding, Consolas, "Courier New", monospace' },
    { key: 'custom', family: '' },
];
const FONT_KEYS = FONTS.map(f => f.key);

/** 후원 금액 단계별 기본 배경 — chzzk-chat.css의 .tbc-chat--level0~4와 같다. 설정 화면에서 켤 때 시작 색. */
export const DONATION_LEVEL_BG = ['#574fa8', '#2d7b8b', '#23815a', '#d18e3c', '#c54952'] as const;

// ── 틀 ─────────────────────────

export type Part = 'window' | 'line' | 'time' | 'badge' | 'nick' | 'text' | 'emoji' | 'bubble' | 'card' | 'hidden';
export type FieldGroup = 'own' | 'text' | 'box';

export type FieldSpec = { g: FieldGroup } & (
    | { t: 'range'; min: number; max: number; step: number; def: number; unit: string }
    | { t: 'enum'; values: readonly (string | number)[]; def: string | number }
    | { t: 'bool'; def: boolean }
    /** auto면 '' (정하지 않음)도 된다 — 무엇을 따르는지는 autoLabel */
    | { t: 'color'; def: string; auto?: string }
    /** 직접 입력한 글꼴 이름 — 공유 코드에선 고정 칸 밖에 덧붙인다 */
    | { t: 'name'; def: string }
);

export type FieldValue = string | number | boolean;
export type PartStyle = Record<string, FieldValue>;
export type TemplateStyle = Record<Part, PartStyle>;

const WEIGHTS = [400, 500, 700, 800] as const;

/** 글자 묶음. 창 전체가 아닌 부분의 크기는 창 글자 크기 대비 %, 글꼴·굵기는 0/'inherit'이면 창을 따른다. */
function text(o: { weight?: number; size?: [number, number]; color?: string } = {}): Record<string, FieldSpec> {
    const [min, max] = o.size ?? [50, 200];
    return {
        font: { g: 'text', t: 'enum', values: ['inherit', ...FONT_KEYS], def: 'inherit' },
        fontCustom: { g: 'text', t: 'name', def: '' },
        size: { g: 'text', t: 'range', min, max, step: 5, def: 100, unit: '%' },
        weight: { g: 'text', t: 'enum', values: [0, ...WEIGHTS], def: o.weight ?? 0 },
        italic: { g: 'text', t: 'bool', def: false },
        color: { g: 'text', t: 'color', def: '', auto: o.color ?? 'auto' },
    };
}

/** 묶음 안 key 뒤에 필드를 끼운다 (편집 창은 넣은 순서대로 보여 준다). */
function insertAfter(o: Record<string, FieldSpec>, key: string, add: Record<string, FieldSpec>): Record<string, FieldSpec> {
    return Object.fromEntries(Object.entries(o).flatMap(e => e[0] === key ? [e, ...Object.entries(add)] : [e]));
}

/** 배경 묶음. 기본값은 chzzk-chat.css의 기본 모양과 같게 준다. */
function box(padY: number, padX: number, radius: number, bg = '', auto = 'none'): Record<string, FieldSpec> {
    return {
        bg: { g: 'box', t: 'color', def: bg, auto },
        padY: { g: 'box', t: 'range', min: 0, max: 16, step: 1, def: padY, unit: 'px' },
        padX: { g: 'box', t: 'range', min: 0, max: 20, step: 1, def: padX, unit: 'px' },
        radius: { g: 'box', t: 'range', min: 0, max: 20, step: 1, def: radius, unit: 'px' },
        borderWidth: { g: 'box', t: 'range', min: 0, max: 4, step: 1, def: 0, unit: 'px' },
        borderColor: { g: 'box', t: 'color', def: '#808080' },
        borderSide: { g: 'box', t: 'enum', values: ['all', 'left', 'bottom'], def: 'all' },
    };
}

/** 부분마다의 값. 순서가 설정 화면의 줄 순서이자 공유 코드의 칸 순서다 — 끝에만 더한다. */
export const PART_SPEC: Record<Part, Record<string, FieldSpec>> = {
    window: {
        font: { g: 'text', t: 'enum', values: FONT_KEYS, def: 'chzzk' },
        fontCustom: { g: 'text', t: 'name', def: '' },
        size: { g: 'text', t: 'range', min: 11, max: 28, step: 1, def: 14, unit: 'px' },
        weight: { g: 'text', t: 'enum', values: WEIGHTS, def: 400 },
        italic: { g: 'text', t: 'bool', def: false },
        color: { g: 'text', t: 'color', def: '', auto: 'auto' },
        lineHeight: { g: 'own', t: 'range', min: 1.1, max: 2, step: 0.01, def: 1.43, unit: '×' },
        ...box(0, 0, 0),
    },
    line: {
        gap: { g: 'own', t: 'range', min: 0, max: 16, step: 1, def: 3, unit: 'px' },
        divider: { g: 'own', t: 'bool', def: false },
        dividerColor: { g: 'own', t: 'color', def: '#80808038' },
        zebra: { g: 'own', t: 'bool', def: false },
        zebraColor: { g: 'own', t: 'color', def: '#80808017' },
        marker: { g: 'own', t: 'enum', values: ['none', 'bar', 'fill'], def: 'none' },
        ...box(4, 6, 8),
    },
    time: {
        // 고정폭 숫자는 글꼴 바로 아래에 (글자 묶음)
        ...insertAfter(text({ size: [60, 150] }), 'fontCustom', { mono: { g: 'text', t: 'bool', def: false } }),
        ...box(0, 0, 0),
    },
    badge: {
        size: { g: 'own', t: 'range', min: 12, max: 32, step: 1, def: 18, unit: 'px' },
        firstOnly: { g: 'own', t: 'bool', def: false },
        verified: { g: 'own', t: 'bool', def: true },
        ...box(0, 0, 0),
    },
    nick: {
        effects: { g: 'own', t: 'bool', def: true },
        ...text({ color: 'chzzk' }),
        ...box(0, 0, 0),
    },
    text: { ...text(), ...box(0, 0, 0) },
    emoji: {
        size: { g: 'own', t: 'range', min: 16, max: 48, step: 1, def: 24, unit: 'px' },
        ...box(0, 0, 0),
    },
    bubble: { ...box(4, 10, 12, '#80808029') },
    card: {
        donationBg: { g: 'own', t: 'color', def: '', auto: 'same_card' },
        // 금액 단계별 후원 배경 (donationLevel). 정한 단계는 후원 배경보다 앞선다
        donationLevel0: { g: 'own', t: 'color', def: '', auto: 'same_card' },
        donationLevel1: { g: 'own', t: 'color', def: '', auto: 'same_card' },
        donationLevel2: { g: 'own', t: 'color', def: '', auto: 'same_card' },
        donationLevel3: { g: 'own', t: 'color', def: '', auto: 'same_card' },
        donationLevel4: { g: 'own', t: 'color', def: '', auto: 'same_card' },
        subscriptionBg: { g: 'own', t: 'color', def: '', auto: 'same_card' },
        giftBg: { g: 'own', t: 'color', def: '', auto: 'same_card' },
        amountColor: { g: 'own', t: 'color', def: '', auto: 'auto' },
        amountWeight: { g: 'own', t: 'enum', values: [0, ...WEIGHTS], def: 0 },
        ...text(),
        // 정하지 않은 배경은 chzzk-chat.css의 카드 색(후원은 금액 단계별)
        ...box(10, 12, 8, '', 'same_card'),
    },
    hidden: {
        mode: { g: 'own', t: 'enum', values: ['dim', 'hide'], def: 'dim' },
        opacity: { g: 'own', t: 'range', min: 20, max: 100, step: 5, def: 60, unit: '%' },
        ...text(),
        ...box(0, 0, 0),
    },
};

export const PART_KEYS = Object.keys(PART_SPEC) as Part[];

const fields = (p: Part) => Object.entries(PART_SPEC[p]);

/** 모든 값이 기본값인 스타일 — 기본 모양과 같아서 걸어도 고치기 전엔 달라 보이지 않는다. */
export const DEFAULT_STYLE: TemplateStyle = Object.fromEntries(
    PART_KEYS.map(p => [p, Object.fromEntries(fields(p).map(([k, f]) => [k, f.def]))]),
) as TemplateStyle;

/** 부분 설정을 기본값 위에 얹는다 — 완성된 모양·옮기기에서. */
export function withStyle(base: TemplateStyle, change: Partial<Record<Part, PartStyle>>): TemplateStyle {
    return Object.fromEntries(PART_KEYS.map(p => [p, { ...base[p], ...change[p] }])) as TemplateStyle;
}

const COLOR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const roundTo = (v: number, step: number) => {
    const digits = (String(step).split('.')[1] ?? '').length;
    return Number(v.toFixed(digits));
};

function sanitizeField(f: FieldSpec, x: unknown): FieldValue {
    switch (f.t) {
        case 'range':
            if (typeof x !== 'number' || !Number.isFinite(x)) return f.def;
            return roundTo(f.min + Math.round((Math.min(f.max, Math.max(f.min, x)) - f.min) / f.step) * f.step, f.step);
        case 'enum': return f.values.includes(x as string | number) ? x as string | number : f.def;
        case 'bool': return typeof x === 'boolean' ? x : f.def;
        case 'color': return typeof x === 'string' && (COLOR.test(x) || (f.auto !== undefined && x === '')) ? x : f.def;
        // CSS 값으로 들어가므로 따옴표·괄호·세미콜론 등은 뺀다
        case 'name': return typeof x === 'string' ? x.replace(/["'\\;{}()<>]/g, '').trim().slice(0, 64) : f.def;
    }
}

/** storage·공유 코드에서 온 값을 알려진 부분·키와 범위로 정리한다. 모르는 값은 기본값. */
export function sanitizeStyle(v: unknown): TemplateStyle {
    const src = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    return Object.fromEntries(PART_KEYS.map(p => {
        const part = (src[p] && typeof src[p] === 'object' ? src[p] : {}) as Record<string, unknown>;
        return [p, Object.fromEntries(fields(p).map(([k, f]) => [k, sanitizeField(f, part[k])]))];
    })) as TemplateStyle;
}

export function partIsDefault(st: TemplateStyle, p: Part): boolean {
    return fields(p).every(([k, f]) => st[p][k] === f.def);
}

// ── CSS ─────────────────────────

/** 같은 쪽 선택자 둘 — 테마별 기본 규칙(.theme_dark .tbc-chat-nick 등)보다 확실히 앞서게. */
const ROOT = '.tbc-styled.tbc-styled';

function familyOf(font: string, custom: string): string {
    const base = FONTS[0].family;
    if (font === 'custom') return custom ? `"${custom}", ${base}` : base;
    return FONTS.find(f => f.key === font)?.family ?? base;
}

/** 부분이 걸리는 요소. text·box가 다른 곳에 걸리는 부분은 따로. */
const SEL: Record<Part, { text: string; box: string }> = {
    window: { text: '.tbc-chat', box: '' },
    line: { text: '', box: '.tbc-chat' },
    time: { text: '.tbc-chat .tbcv2-chat-time', box: '.tbc-chat .tbcv2-chat-time' },
    badge: { text: '', box: '.tbc-chat-badge, .tbc-chat-verified' },
    nick: { text: '.tbc-chat-nick', box: '.tbc-chat-nick' },
    // 말풍선 배치에선 본문이 말풍선에 바로 들어간다 — 글자는 말풍선과 미션 내용에도, 배경은 본문 칸에만
    text: { text: '.tbc-chat-text, .tbc-chat-bubble, .tbc-chat-mission', box: '.tbc-chat-text' },
    emoji: { text: '', box: '.tbc-chat-emoji' },
    bubble: { text: '', box: '.tbc-chat-bubble' },
    card: { text: '.tbc-chat--donation, .tbc-chat--subscription, .tbc-chat--gift', box: '.tbc-chat--donation, .tbc-chat--subscription, .tbc-chat--gift' },
    hidden: { text: '.tbc-chat-cleanbot > summary, .tbc-chat-cleanbot > i, .tbc-chat-blinded', box: '.tbc-chat-cleanbot > summary, .tbc-chat-blinded' },
};

const scoped = (sel: string) => sel ? sel.split(',').map(x => `${ROOT} ${x.trim()}`).join(', ') : ROOT;

/**
 * 모아보기 창(채팅 목록, 클래스 `tbc-styled`)에 거는 CSS. 기본값과 같은 값도 쓴다 —
 * 기본값이 chzzk-chat.css의 기본 모양과 같아서 결과가 같다. 값은 sanitizeStyle을 거친 것만 들어온다.
 */
export function styleCss(input: TemplateStyle): string {
    const st = sanitizeStyle(input);
    const out: string[] = [];
    const rule = (sel: string, decls: (string | false)[]) => {
        const d = decls.filter(Boolean);
        if (d.length) out.push(`${scoped(sel)} { ${d.join('; ')}; }`);
    };
    const base = st.window.size as number;

    const textDecls = (p: Part): (string | false)[] => {
        const v = st[p];
        if (p === 'window') return [
            `font-family: ${familyOf(v.font as string, v.fontCustom as string)}`,
            // 카드 머리글은 기본으로 치지직 웹폰트(chzzk-chat.css) — 글꼴을 고르면 그 글꼴로
            v.font !== 'chzzk' && `--tbc-card-font: ${familyOf(v.font as string, v.fontCustom as string)}`,
            `font-size: ${base}px`,
            `line-height: ${Math.round(base * (v.lineHeight as number))}px`,
            `font-weight: ${v.weight}`,
            v.italic === true && 'font-style: italic',
            !!v.color && `color: ${v.color}`,
        ];
        return [
            v.font !== 'inherit' && `font-family: ${familyOf(v.font as string, v.fontCustom as string)}`,
            p === 'card' && v.font !== 'inherit' && `--tbc-card-font: ${familyOf(v.font as string, v.fontCustom as string)}`,
            v.size !== 100 && `font-size: ${Math.round(base * (v.size as number) / 100)}px`,
            v.weight !== 0 && `font-weight: ${v.weight}`,
            v.italic === true && 'font-style: italic',
            !!v.color && `color: ${v.color}${p === 'nick' ? ' !important' : ''}`,
            !!v.color && p === 'time' && 'opacity: 1',
        ];
    };
    const boxDecls = (p: Part): (string | false)[] => {
        const v = st[p];
        const side = v.borderSide === 'all' ? 'border' : `border-${v.borderSide}`;
        // 기본 모양에서 닉네임은 뒤에 4px, 시각은 8px를 띄운다 (chzzk-chat.css, content style.css)
        const after = p === 'nick' ? 4 : p === 'time' ? 8 : 0;
        const padRight = after ? `; padding-right: ${(v.padX as number) + after}px` : '';
        // 본문은 구독 카드 안에서 따로 상자 모양이 있다 — 기본값 그대로면 덮지 않는다
        const keep = p === 'text' && v.padY === 0 && v.padX === 0 && v.radius === 0;
        return [
            !!v.bg && `background: ${v.bg}`,
            !keep && `padding: ${v.padY}px ${v.padX}px${padRight}`,
            !keep && `border-radius: ${v.radius}px`,
            (v.borderWidth as number) > 0 && `${side}: ${v.borderWidth}px solid ${v.borderColor}`,
        ];
    };

    // 창 — 목록 자체는 배경만 (모아보기의 위아래 여백은 창이 따로 다룬다)
    rule('', [!!st.window.bg && `background: ${st.window.bg}`, `padding-left: ${st.window.padX}px`, `padding-right: ${st.window.padX}px`,
        `border-radius: ${st.window.radius}px`,
        (st.window.borderWidth as number) > 0 && `${st.window.borderSide === 'all' ? 'border' : `border-${st.window.borderSide}`}: ${st.window.borderWidth}px solid ${st.window.borderColor}`]);
    rule(SEL.window.text, textDecls('window'));
    // 닉네임(500)과 구독 본문(400, 웹폰트가 이미 굵다)은 기본 모양에서 굵기를 따로 쓴다. 창 굵기를 바꾸면
    // 그 값을 따르게 한다 . 부분에서 굵기를 정하면 아래 부분 규칙이 다시 덮는다.
    if (st.window.weight !== PART_SPEC.window.weight.def) rule('.tbc-chat-nick, .tbc-chat--subscription .tbc-chat-text', ['font-weight: inherit']);

    // 줄
    const line = st.line;
    rule('.tbc-chat', [...boxDecls('line'), `margin-bottom: ${line.gap}px`]);
    // 구분선은 테두리가 아니라 줄 사이 간격 한가운데의 곧은 선 — 테두리로 그리면 줄 모서리 둥글기를 따라 휜다.
    // 카드는 위 여백(4px)이 더 있어서 그만큼 위로.
    if (line.divider) {
        const mid = (space: number) => `top: ${-(space / 2) - 0.5}px`;
        rule('.tbc-chat ~ .tbc-chat', ['position: relative']);
        rule('.tbc-chat ~ .tbc-chat::after', ['content: ""', 'position: absolute', 'left: 0', 'right: 0', mid(line.gap as number), 'height: 1px',
            `background: ${line.dividerColor}`, 'pointer-events: none']);
        // 카드는 양옆 6px 안쪽에 있다 (chzzk-chat.css) — 선은 다른 줄과 같은 길이로
        rule(SEL.card.box.split(',').map(x => `.tbc-chat ~ ${x.trim()}::after`).join(', '), [mid((line.gap as number) + 4), 'left: -6px', 'right: -6px']);
    }
    // 번갈아 배경: 순번(nth-child)이 아니라 그릴 때 정한 표시 — 새 채팅이 앞에 들어와도 색이 뒤집히지 않게
    if (line.zebra) rule('.tbc-chat--alt', [`background: ${line.zebraColor}`]);

    // 카드 — 줄 다음에 둬서 줄 배경·번갈아 배경보다 앞선다
    // 카드는 위·옆 여백이 따로 있고, 아래는 줄 사이에 4px를 더한다 (chzzk-chat.css와 같게)
    // 카드 배경을 정하지 않았으면 줄 배경·번갈아 배경이 카드를 덮지 않게 원래 카드 색(chzzk-chat.css)으로 되돌린다
    rule(SEL.card.box, [...boxDecls('card'), !st.card.bg && 'background: var(--tbc-card-bg)', `margin-bottom: ${(line.gap as number) + 4}px`]);
    // 후원 카드는 기본으로 진한 단계 색에 흰 글자다. 카드 배경을 하나로 정하면(옅은 반투명이 흔하다)
    // 흰 글자가 라이트 테마에서 안 보이므로 일반 글자색을 따른다. 후원 배경을 따로 정한 곳은 다시 흰 글자.
    const cardColor = !!st.card.color;
    if (st.card.bg && !cardColor) rule('.tbc-chat--donation', ['color: inherit']);
    rule(SEL.card.text, textDecls('card'));
    const donationText = !cardColor && 'color: #fff';
    for (const k of ['donation', 'subscription', 'gift'] as const) {
        const bg = st.card[`${k}Bg`];
        if (bg) rule(`.tbc-chat--${k}`, [`background: ${bg}`, k === 'donation' && donationText]);
    }
    for (let i = 0; i < DONATION_LEVEL_BG.length; i++) {
        const bg = st.card[`donationLevel${i}`];
        if (bg) rule(`.tbc-chat--donation.tbc-chat--level${i}`, [`background: ${bg}`, donationText]);
    }
    rule('.tbc-chat-amount', [!!st.card.amountColor && `color: ${st.card.amountColor}`, st.card.amountWeight !== 0 && `font-weight: ${st.card.amountWeight}`]);

    // 수집 표시 — 다른 배경보다 뒤에
    if (line.marker === 'bar') rule('.tbc-chat--marked', ['box-shadow: inset 4px 0 0 var(--tbc-marker-color, #FFC107)']);
    if (line.marker === 'fill') rule('.tbc-chat--marked', ['background: color-mix(in srgb, var(--tbc-marker-color, #FFC107) 20%, transparent)']);

    // 시각
    rule(SEL.time.box, [...textDecls('time'), ...boxDecls('time')]);
    if (st.time.mono) rule(SEL.time.text, ['font-family: Consolas, D2Coding, monospace', 'font-variant-numeric: tabular-nums']);

    // 배지
    const badge = st.badge.size as number;
    rule(SEL.badge.box, [`width: ${badge}px`, `height: ${badge}px`, `vertical-align: ${-Math.round((badge - 10) / 2)}px`, ...boxDecls('badge')]);
    if (st.badge.firstOnly) rule('.tbc-chat-badge ~ .tbc-chat-badge', ['display: none']);
    if (!st.badge.verified) rule('.tbc-chat-verified', ['display: none']);

    // 닉네임 — 한 가지 색을 고르면 구독자 꾸미기(그라데이션·형광펜)도 뺀다
    rule(SEL.nick.text, [...textDecls('nick'), ...boxDecls('nick')]);
    if (!st.nick.effects || st.nick.color) {
        rule('.tbc-chat-nick--gradient', ['background-image: none !important']);
        rule('.tbc-chat-nick--highlight', ['background-color: transparent !important']);
    }
    if (!st.nick.effects && !st.nick.color) {
        rule('.tbc-chat-nick--gradient', ['color: var(--tbc-nick-light) !important']);
        out.push(`.theme_dark ${ROOT} .tbc-chat-nick--gradient, ${ROOT}.theme_dark .tbc-chat-nick--gradient { color: var(--tbc-nick-dark) !important; }`);
    }

    // 본문·말풍선·이모티콘
    rule(SEL.text.text, textDecls('text'));
    rule(SEL.text.box, boxDecls('text'));
    rule(SEL.bubble.box, boxDecls('bubble'));
    const emoji = st.emoji.size as number;
    rule(SEL.emoji.box, [`width: ${emoji}px`, `height: ${emoji}px`, ...boxDecls('emoji')]);

    // 가려진 채팅
    if (st.hidden.mode === 'hide') {
        rule('.tbc-chat--cleanbot, .tbc-chat:has(.tbc-chat-blinded)', ['display: none']);
    } else {
        rule(SEL.hidden.text, textDecls('hidden'));
        // 흐림은 안내 문구에만 — 펼친 원문은 기본 모양처럼 그대로
        rule(SEL.hidden.box, [...boxDecls('hidden'), `opacity: ${(st.hidden.opacity as number) / 100}`]);
    }
    return out.join('\n');
}

/** 이 스타일이 쓰는 글꼴 중 확장에 넣은 Pretendard가 있으면 이 문서에 한 번 등록한다. 고른 사람만 받는다. */
let pretendardLoaded = false;
export function ensureStyleFont(st: TemplateStyle) {
    if (pretendardLoaded || typeof FontFace === 'undefined' || !PART_KEYS.some(p => st[p].font === 'pretendard')) return;
    pretendardLoaded = true;
    const url = browser.runtime.getURL('/fonts/pretendard/PretendardVariable.woff2' as any);
    const face = new FontFace('TBC Pretendard', `url("${url}") format("woff2")`, { weight: '45 920', display: 'swap' });
    document.fonts.add(face);
    face.load().catch(() => { pretendardLoaded = false; });
}

export async function loadStyle(): Promise<TemplateStyle> {
    const res = await browser.storage.local.get(STYLE_STORAGE_KEY);
    return sanitizeStyle(res[STYLE_STORAGE_KEY]);
}

export async function saveStyle(st: TemplateStyle): Promise<void> {
    await browser.storage.local.set({ [STYLE_STORAGE_KEY]: sanitizeStyle(st) });
}

/** 저장된 스타일을 읽고, 다른 곳(설정 페이지)에서 바꾸면 따라간다. */
export function useStoredStyleState(): { style: TemplateStyle; loaded: boolean } {
    const [state, setState] = useState({ style: DEFAULT_STYLE, loaded: false });
    useEffect(() => {
        let alive = true;
        loadStyle().then(style => { if (alive) setState({ style, loaded: true }); });
        const listener = (changes: Record<string, { newValue?: unknown }>) => {
            if (STYLE_STORAGE_KEY in changes) setState({ style: sanitizeStyle(changes[STYLE_STORAGE_KEY].newValue), loaded: true });
        };
        browser.storage.local.onChanged.addListener(listener);
        return () => {
            alive = false;
            browser.storage.local.onChanged.removeListener(listener);
        };
    }, []);
    return state;
}

// ── 완성된 모양 ─────────────────────────

export interface StylePreset { id: string; look: Omit<TemplateLook, 'size'>; style: Partial<Record<Part, PartStyle>> }

export const PRESETS: StylePreset[] = [
    { id: 'default', look: { layout: 'inline', badges: true }, style: {} },
    { id: 'big', look: { layout: 'inline', badges: true }, style: {
        window: { size: 18, lineHeight: 1.45 }, line: { padY: 6 }, badge: { size: 22 }, emoji: { size: 30 }, nick: { weight: 700 },
    } },
    { id: 'clean', look: { layout: 'inline', badges: true }, style: {
        badge: { firstOnly: true }, line: { divider: true, padY: 6, marker: 'bar' }, nick: { effects: false },
    } },
    { id: 'bubble', look: { layout: 'bubble', badges: true }, style: {
        bubble: { bg: '#ff7ab633', radius: 14 }, nick: { weight: 700 }, line: { padY: 5 }, card: { bg: '#ff7ab61f' },
    } },
    { id: 'compact', look: { layout: 'inline', badges: false }, style: {
        window: { size: 13, lineHeight: 1.3 }, line: { padY: 1, zebra: true, marker: 'fill' }, emoji: { size: 20 },
    } },
    { id: 'overlay', look: { layout: 'stacked', badges: true }, style: {
        window: { size: 20 }, nick: { weight: 800, color: '#ffd400' }, text: { color: '#ffffff' },
        line: { padY: 8, radius: 12 }, card: { bg: '#ffd40026', amountColor: '#ffd400' },
    } },
];

/** 템플릿 네 종류 중 기본값과 다른 것만 — 저장소와 공유 코드에 넣는 모양. */
export function templatesToStore(templates: Record<string, string>): StoredTemplates {
    return Object.fromEntries(TEMPLATE_KINDS.filter(k => templates[k] !== DEFAULT_CHZZK_TEMPLATES[k]).map(k => [k, templates[k]]));
}

export function presetTemplates(p: StylePreset): StoredTemplates {
    return templatesToStore(buildTemplates({ ...p.look, size: 'normal' }));
}

// ── 공유 코드 ─────────────────────────
//
// TBC2: 바꾼 값만 담는다. 머리(판 번호·배치·배지·덧붙임 여부) 뒤로 부분마다 "바꿨나" 1비트,
// 바꾼 부분은 값마다 "바꿨나" 1비트와 바꾼 값을 PART_SPEC 순서대로 채운다 (URL에 안전한 base64).
// 기본 모양 그대로면 머리 포함 3글자. 길이에 끝이 없는 것(직접 고친 HTML, 직접 입력한 글꼴 이름)만
// '.' 뒤에 덧붙인다 — 첫 글자 z = 압축, j = 그대로.

const CODE_PREFIX = 'TBC2:';
const CODE_VERSION = 2;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const LAYOUTS: TemplateLook['layout'][] = ['inline', 'stacked', 'bubble'];

class Bits {
    private bits: number[] = [];
    private pos = 0;
    static from(text: string) {
        const b = new Bits();
        for (const ch of text) {
            const v = B64.indexOf(ch);
            if (v < 0) throw new Error('bad code');
            for (let i = 5; i >= 0; i--) b.bits.push((v >> i) & 1);
        }
        return b;
    }
    put(value: number, width: number) {
        for (let i = width - 1; i >= 0; i--) this.bits.push(Math.floor(value / 2 ** i) % 2);
    }
    take(width: number) {
        let v = 0;
        for (let i = 0; i < width; i++) {
            if (this.pos >= this.bits.length) throw new Error('short code');
            v = v * 2 + this.bits[this.pos++];
        }
        return v;
    }
    /** 남은 비트가 글자를 채우려고 붙인 0뿐인지 */
    done() {
        return this.bits.length - this.pos < 6 && this.bits.slice(this.pos).every(x => x === 0);
    }
    text() {
        const b = [...this.bits];
        while (b.length % 6) b.push(0);
        let out = '';
        for (let i = 0; i < b.length; i += 6) out += B64[b.slice(i, i + 6).reduce((a, x) => a * 2 + x, 0)];
        return out;
    }
}

const widthOf = (n: number) => (n <= 1 ? (n === 1 ? 1 : 0) : Math.ceil(Math.log2(n + 1)));

/** 색은 투명도가 있나 1비트 + #rrggbb 24비트 (+ 투명도 8비트). */
function putColor(b: Bits, c: string) {
    b.put(c.length === 9 ? 1 : 0, 1);
    b.put(parseInt(c.slice(1, 7), 16), 24);
    if (c.length === 9) b.put(parseInt(c.slice(7), 16), 8);
}
function takeColor(b: Bits) {
    const alpha = b.take(1) === 1;
    const hex = '#' + b.take(24).toString(16).padStart(6, '0');
    return alpha ? hex + b.take(8).toString(16).padStart(2, '0') : hex;
}

/** 값 하나 (바꿨을 때만 불린다). bool은 바뀌었다는 것만으로 값이 정해진다. */
function putValue(b: Bits, f: FieldSpec, v: FieldValue) {
    switch (f.t) {
        case 'range': b.put(Math.round(((v as number) - f.min) / f.step), widthOf(Math.round((f.max - f.min) / f.step))); break;
        case 'enum': b.put(f.values.indexOf(v as string | number), widthOf(f.values.length - 1)); break;
        case 'color':
            if (f.auto !== undefined) b.put(v === '' ? 1 : 0, 1);
            if (v !== '') putColor(b, v as string);
            break;
    }
}
function takeValue(b: Bits, f: FieldSpec): FieldValue {
    switch (f.t) {
        case 'range': return roundTo(f.min + b.take(widthOf(Math.round((f.max - f.min) / f.step))) * f.step, f.step);
        case 'enum': return f.values[b.take(widthOf(f.values.length - 1))];
        case 'bool': return !f.def;
        case 'color': return f.auto !== undefined && b.take(1) === 1 ? '' : takeColor(b);
        case 'name': return f.def;
    }
}

/** 고정 길이가 아닌 이름 값은 코드 몸통에서 뺀다. */
const codeFields = (p: Part) => fields(p).filter(([, f]) => f.t !== 'name');

function packBody(st: TemplateStyle, look: TemplateLook | null, hasTail: boolean): string {
    const b = new Bits();
    b.put(CODE_VERSION, 3);
    b.put(LAYOUTS.indexOf(look?.layout ?? 'inline'), 2);
    b.put(look?.badges === false ? 0 : 1, 1);
    b.put(hasTail ? 1 : 0, 1);
    for (const p of PART_KEYS) {
        const changed = codeFields(p).filter(([k, f]) => st[p][k] !== f.def);
        b.put(changed.length ? 1 : 0, 1);
        if (!changed.length) continue;
        for (const [k, f] of codeFields(p)) {
            const diff = st[p][k] !== f.def;
            b.put(diff ? 1 : 0, 1);
            if (diff) putValue(b, f, st[p][k]);
        }
    }
    return b.text();
}

function unpackBody(text: string) {
    const b = Bits.from(text);
    if (b.take(3) !== CODE_VERSION) throw new Error('version');
    const layout = LAYOUTS[b.take(2)] ?? 'inline';
    const badges = b.take(1) === 1;
    const hasTail = b.take(1) === 1;
    const st: Record<string, Record<string, unknown>> = {};
    for (const p of PART_KEYS) {
        st[p] = {};
        if (!b.take(1)) continue;
        for (const [k, f] of codeFields(p)) {
            if (b.take(1)) st[p][k] = takeValue(b, f);
        }
    }
    if (!b.done()) throw new Error('long code');
    return { style: st, layout, badges, hasTail };
}

const KIND_SHORT = { chat: 'c', donation: 'd', subscription: 's', gift: 'g' } as const;

const b64url = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) =>
    Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
    const out = await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer();
    return new Uint8Array(out);
}

export async function exportStyleCode(style: TemplateStyle, templates: StoredTemplates): Promise<string> {
    const st = sanitizeStyle(style);
    const look = detectLook({ ...DEFAULT_CHZZK_TEMPLATES, ...templates });
    const tail: Record<string, unknown> = {};
    if (!look) tail.t = Object.fromEntries(Object.entries(templates).map(([k, v]) => [KIND_SHORT[k as keyof typeof KIND_SHORT], v]));
    const names = Object.fromEntries(PART_KEYS.filter(p => st[p].font === 'custom' && st[p].fontCustom).map(p => [p, st[p].fontCustom]));
    if (Object.keys(names).length) tail.f = names;
    const hasTail = Object.keys(tail).length > 0;
    let code = CODE_PREFIX + packBody(st, look, hasTail);
    if (hasTail) {
        const raw = new TextEncoder().encode(JSON.stringify(tail));
        const plain = 'j' + b64url(raw);
        const packed = typeof CompressionStream === 'undefined' ? null : 'z' + b64url(await pipe(raw, new CompressionStream('deflate-raw')));
        code += '.' + (packed && packed.length < plain.length ? packed : plain);
    }
    return code;
}

/** 올바르지 않거나 템플릿 문법이 틀린 코드는 null. */
export async function importStyleCode(code: string): Promise<{ style: TemplateStyle; templates: StoredTemplates } | null> {
    try {
        const body = code.trim();
        if (!body.startsWith(CODE_PREFIX)) return null;
        const [head, tailText, ...rest] = body.slice(CODE_PREFIX.length).split('.');
        if (rest.length) return null;
        const f = unpackBody(head);
        if (f.hasTail !== !!tailText) return null;
        let templates = templatesToStore(buildTemplates({ layout: f.layout, badges: f.badges, size: 'normal' }));
        if (tailText) {
            const bytes = unb64url(tailText.slice(1));
            const json = tailText[0] === 'z' ? new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw')))
                : tailText[0] === 'j' ? new TextDecoder().decode(bytes) : null;
            if (json === null) return null;
            const tail = JSON.parse(json) as { t?: Record<string, unknown>; f?: Record<string, unknown> };
            if (tail.t && typeof tail.t === 'object') {
                templates = sanitizeStoredTemplates(Object.fromEntries(Object.entries(KIND_SHORT)
                    .filter(([, short]) => short in tail.t!).map(([kind, short]) => [kind, tail.t![short]])));
            }
            if (tail.f && typeof tail.f === 'object') {
                for (const p of PART_KEYS) if (typeof tail.f[p] === 'string') f.style[p].fontCustom = tail.f[p];
            }
        }
        if (Object.values(templates).some(t => !validateTemplate(t!).ok)) return null;
        return { style: sanitizeStyle(f.style), templates };
    } catch {
        return null;
    }
}

// ── 옮기기 ─────────────────────────

/**
 * 예전 "글자 크기: 크게"(템플릿을 tbc-chat-large로 감싸던 것)를 스타일의 글자 크기로 옮긴다.
 * 직접 고친 템플릿은 건드리지 않는다(tbc-chat-large CSS는 그대로 남아 있다). 옮길 게 없으면 아무것도 쓰지 않는다.
 */
export async function migrateLargeLook(): Promise<void> {
    const res = await browser.storage.local.get([TEMPLATE_STORAGE_KEY, STYLE_STORAGE_KEY]);
    const stored = sanitizeStoredTemplates(res[TEMPLATE_STORAGE_KEY]);
    const look = detectLook({ ...DEFAULT_CHZZK_TEMPLATES, ...stored });
    if (look?.size !== 'large') return;
    const style = sanitizeStyle(res[STYLE_STORAGE_KEY]);
    await browser.storage.local.set({
        [TEMPLATE_STORAGE_KEY]: templatesToStore(buildTemplates({ ...look, size: 'normal' })),
        [STYLE_STORAGE_KEY]: withStyle(style, { window: { size: 18, lineHeight: 1.44 }, badge: { size: 22 }, emoji: { size: 30 } }),
    });
}

/**
 * 예전 후원 템플릿(금액이 이름 줄 끝)으로 고른 모양을 지금 템플릿으로 바꾼다. 직접 고친 템플릿은
 * 건드리지 않는다. migrateLargeLook 뒤에 부른다 — 크게 모양은 거기서 이미 새 템플릿이 된다.
 */
export async function migrateLegacyDonation(): Promise<void> {
    const res = await browser.storage.local.get(TEMPLATE_STORAGE_KEY);
    const stored = sanitizeStoredTemplates(res[TEMPLATE_STORAGE_KEY]);
    const upgraded = upgradeLegacyLook({ ...DEFAULT_CHZZK_TEMPLATES, ...stored });
    if (upgraded) await browser.storage.local.set({ [TEMPLATE_STORAGE_KEY]: templatesToStore(upgraded) });
}
