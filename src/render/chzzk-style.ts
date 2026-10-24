import { useEffect, useState } from "react";
import type React from "react";
import { buildTemplates, detectLook, DEFAULT_CHZZK_TEMPLATES, type TemplateLook } from "./chzzk-templates";
import { TEMPLATE_KINDS, TEMPLATE_STORAGE_KEY, sanitizeStoredTemplates, validateTemplate, type StoredTemplates } from "./template-store";

/**
 * 치지직 모아보기 채팅의 스타일 — storage.local `chzzkTemplateStyle`.
 *
 * 모양은 두 층이다. 구조(배치·배지 표시)는 템플릿 HTML이 정하고, 크기·색·간격은 여기 값이
 * 모아보기 창에 거는 클래스와 CSS 변수(chzzk-chat.css의 `.tbc-styled`)로 정한다. 스타일은
 * `tbc-chat-*` 클래스만 보므로 HTML을 직접 고친 템플릿에도 그대로 먹는다.
 * 사용자 템플릿이 켜져 있을 때만 건다 — 꺼져 있으면 원본 복제, 대체 렌더도 기본 모양.
 */

export const STYLE_STORAGE_KEY = 'chzzkTemplateStyle';

export type FontKey = 'chzzk' | 'system' | 'pretendard' | 'gothic' | 'round' | 'serif' | 'mono' | 'custom';

export interface TemplateStyle {
    font: FontKey;
    /** font === 'custom'일 때 사용자가 적은 글꼴 이름. */
    fontCustom: string;
    /** px */
    fontSize: number;
    /** 글자 크기의 배수 */
    lineHeight: number;
    /** 줄 위아래 여백 px */
    rowGap: number;
    /** 일반 줄·말풍선·후원 카드 모두 같은 모서리 px */
    radius: number;
    divider: boolean;
    zebra: boolean;
    /** 필터의 수집 표시 색을 모아보기에서 보이는 방식 */
    marker: 'none' | 'bar' | 'fill';
    /** '' = 자동(흐리게) */
    timeColor: string;
    /** 글자 크기 대비 % */
    timeScale: number;
    timeWeight: 400 | 700;
    /** 고정폭 숫자 — 줄마다 시각 폭이 같아진다 */
    timeMono: boolean;
    badgeSize: number;
    firstBadgeOnly: boolean;
    nickWeight: 400 | 500 | 700 | 800;
    nickColor: 'chzzk' | 'single' | 'text';
    nickSingleColor: string;
    /** 2단계 구독자 닉네임 꾸미기(그라데이션·형광펜) */
    nickEffects: boolean;
    /** '' = 자동 */
    textColor: string;
    emojiSize: number;
    bubbleColor: string;
    cardColor: string;
}

/** 기본값은 chzzk-chat.css의 기본 모양과 같다 — 스타일을 걸어도 고치기 전엔 달라 보이지 않는다. */
export const DEFAULT_STYLE: TemplateStyle = {
    font: 'chzzk', fontCustom: '', fontSize: 14, lineHeight: 1.43, rowGap: 4, radius: 8,
    divider: false, zebra: false, marker: 'none',
    timeColor: '', timeScale: 100, timeWeight: 400, timeMono: false,
    badgeSize: 18, firstBadgeOnly: false,
    nickWeight: 500, nickColor: 'chzzk', nickSingleColor: '#00ffa3', nickEffects: true,
    textColor: '', emojiSize: 24, bubbleColor: '#80808029', cardColor: '#00ffa314',
};

export const STYLE_RANGES = {
    fontSize: [11, 28], lineHeight: [1.1, 2], rowGap: [0, 14], radius: [0, 20],
    timeScale: [60, 120], badgeSize: [12, 32], emojiSize: [16, 48],
} as const satisfies Partial<Record<keyof TemplateStyle, readonly [number, number]>>;

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

export function fontFamily(st: TemplateStyle): string {
    if (st.font === 'custom') return st.fontCustom ? `"${st.fontCustom}", ${FONTS[0].family}` : FONTS[0].family;
    return FONTS.find(f => f.key === st.font)!.family;
}

const COLOR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

/** storage·공유 코드에서 온 값을 알려진 키와 범위로 정리한다. 모르는 값은 기본값. */
export function sanitizeStyle(v: unknown): TemplateStyle {
    const src = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const out = { ...DEFAULT_STYLE };
    const num = (k: keyof typeof STYLE_RANGES) => {
        const x = src[k];
        if (typeof x === 'number' && Number.isFinite(x)) {
            const [lo, hi] = STYLE_RANGES[k];
            (out[k] as number) = Math.min(hi, Math.max(lo, x));
        }
    };
    (Object.keys(STYLE_RANGES) as (keyof typeof STYLE_RANGES)[]).forEach(num);
    const bool = (k: 'divider' | 'zebra' | 'timeMono' | 'firstBadgeOnly' | 'nickEffects') => {
        if (typeof src[k] === 'boolean') out[k] = src[k] as boolean;
    };
    (['divider', 'zebra', 'timeMono', 'firstBadgeOnly', 'nickEffects'] as const).forEach(bool);
    const color = (k: 'timeColor' | 'textColor' | 'nickSingleColor' | 'bubbleColor' | 'cardColor', allowEmpty: boolean) => {
        const x = src[k];
        if (typeof x === 'string' && (COLOR.test(x) || (allowEmpty && x === ''))) out[k] = x;
    };
    color('timeColor', true); color('textColor', true);
    color('nickSingleColor', false); color('bubbleColor', false); color('cardColor', false);
    const oneOf = <K extends keyof TemplateStyle>(k: K, values: readonly TemplateStyle[K][]) => {
        if (values.includes(src[k] as TemplateStyle[K])) out[k] = src[k] as TemplateStyle[K];
    };
    oneOf('font', FONT_KEYS);
    oneOf('marker', ['none', 'bar', 'fill']);
    oneOf('timeWeight', [400, 700]);
    oneOf('nickWeight', [400, 500, 700, 800]);
    oneOf('nickColor', ['chzzk', 'single', 'text']);
    // CSS 값으로 들어가므로 따옴표·괄호·세미콜론 등은 뺀다
    if (typeof src.fontCustom === 'string') out.fontCustom = src.fontCustom.replace(/["'\\;{}()<>]/g, '').trim().slice(0, 64);
    return out;
}

/** 모아보기 창(채팅 목록)에 거는 클래스와 CSS 변수. 어두운 테마는 조상의 `.theme_dark`로 고른다. */
export function styleAttrs(st: TemplateStyle): { className: string; style: React.CSSProperties } {
    const cls = ['tbc-styled', `tbc-styled--marker-${st.marker}`];
    if (st.nickColor !== 'chzzk') cls.push(`tbc-styled--nick-${st.nickColor}`);
    if (!st.nickEffects) cls.push('tbc-styled--no-effects');
    if (st.firstBadgeOnly) cls.push('tbc-styled--first-badge');
    if (st.divider) cls.push('tbc-styled--divider');
    if (st.zebra) cls.push('tbc-styled--zebra');
    if (st.textColor) cls.push('tbc-styled--text-color');
    if (st.timeColor) cls.push('tbc-styled--time-color');
    if (st.timeMono) cls.push('tbc-styled--time-mono');
    return {
        className: cls.join(' '),
        style: {
            '--tbc-s-family': fontFamily(st),
            '--tbc-s-font': `${st.fontSize}px`,
            '--tbc-s-lh': `${Math.round(st.fontSize * st.lineHeight)}px`,
            '--tbc-s-gap': `${st.rowGap}px`,
            '--tbc-s-radius': `${st.radius}px`,
            '--tbc-s-time-size': `${Math.round(st.fontSize * st.timeScale / 100)}px`,
            '--tbc-s-time-weight': st.timeWeight,
            '--tbc-s-time-color': st.timeColor || 'inherit',
            '--tbc-s-badge': `${st.badgeSize}px`,
            '--tbc-s-nick-weight': st.nickWeight,
            '--tbc-s-nick-color': st.nickSingleColor,
            '--tbc-s-text': st.textColor || 'inherit',
            '--tbc-s-emoji': `${st.emojiSize}px`,
            '--tbc-s-bubble': st.bubbleColor,
            '--tbc-s-card': st.cardColor,
        } as React.CSSProperties,
    };
}

/** 확장에 넣은 Pretendard를 이 문서에 한 번 등록한다. 고른 사람만 받는다. */
let pretendardLoaded = false;
export function ensureStyleFont(st: TemplateStyle) {
    if (st.font !== 'pretendard' || pretendardLoaded || typeof FontFace === 'undefined') return;
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

export interface StylePreset { id: string; look: Omit<TemplateLook, 'size'>; style: Partial<TemplateStyle> }

export const PRESETS: StylePreset[] = [
    { id: 'default', look: { layout: 'inline', badges: true }, style: {} },
    { id: 'big', look: { layout: 'inline', badges: true }, style: { fontSize: 18, lineHeight: 1.45, badgeSize: 22, emojiSize: 30, nickWeight: 700, rowGap: 6 } },
    { id: 'clean', look: { layout: 'inline', badges: true }, style: { firstBadgeOnly: true, divider: true, rowGap: 6, nickEffects: false, marker: 'bar' } },
    { id: 'bubble', look: { layout: 'bubble', badges: true }, style: { bubbleColor: '#ff7ab633', radius: 14, nickWeight: 700, rowGap: 5, cardColor: '#ff7ab61f' } },
    { id: 'compact', look: { layout: 'inline', badges: false }, style: { fontSize: 13, lineHeight: 1.3, rowGap: 1, emojiSize: 20, zebra: true, marker: 'fill' } },
    { id: 'overlay', look: { layout: 'stacked', badges: true }, style: { fontSize: 20, nickWeight: 800, nickColor: 'single', nickSingleColor: '#ffd400', textColor: '#ffffff', rowGap: 8, radius: 12, cardColor: '#ffd40026' } },
];

/** 템플릿 네 종류 중 기본값과 다른 것만 — 저장소와 공유 코드에 넣는 모양. */
export function templatesToStore(templates: Record<string, string>): StoredTemplates {
    return Object.fromEntries(TEMPLATE_KINDS.filter(k => templates[k] !== DEFAULT_CHZZK_TEMPLATES[k]).map(k => [k, templates[k]]));
}

export function presetTemplates(p: StylePreset): StoredTemplates {
    return templatesToStore(buildTemplates({ ...p.look, size: 'normal' }));
}

// ── 공유 코드 ─────────────────────────

const CODE_PREFIX = 'TBC1:';

export function exportStyleCode(style: TemplateStyle, templates: StoredTemplates): string {
    const json = JSON.stringify({ style, templates });
    return CODE_PREFIX + btoa(String.fromCharCode(...new TextEncoder().encode(json)));
}

/** 올바르지 않거나 템플릿 문법이 틀린 코드는 null. */
export function importStyleCode(code: string): { style: TemplateStyle; templates: StoredTemplates } | null {
    try {
        const body = code.trim();
        if (!body.startsWith(CODE_PREFIX)) return null;
        const bin = atob(body.slice(CODE_PREFIX.length));
        const raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
        if (!raw || typeof raw !== 'object') return null;
        const templates = sanitizeStoredTemplates(raw.templates);
        if (Object.values(templates).some(t => !validateTemplate(t!).ok)) return null;
        return { style: sanitizeStyle(raw.style), templates };
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
        [STYLE_STORAGE_KEY]: { ...style, fontSize: 18, lineHeight: 1.44, badgeSize: 22, emojiSize: 30 },
    });
}
