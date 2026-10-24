import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';
import { buildTemplates, DEFAULT_LOOK } from './chzzk-templates';

vi.stubGlobal('browser', fakeBrowser);
const { DEFAULT_STYLE, sanitizeStyle, styleAttrs, exportStyleCode, importStyleCode, migrateLargeLook, presetTemplates, PRESETS, templatesToStore } = await import('./chzzk-style');

describe('sanitizeStyle', () => {
    it('모르는 값은 기본값', () => {
        expect(sanitizeStyle(undefined)).toEqual(DEFAULT_STYLE);
        expect(sanitizeStyle({ font: 'comic', nickWeight: 650, marker: 'x', divider: 'yes' })).toEqual(DEFAULT_STYLE);
    });

    it('숫자는 범위 안으로', () => {
        const st = sanitizeStyle({ fontSize: 99, rowGap: -5, timeScale: 80 });
        expect(st.fontSize).toBe(28);
        expect(st.rowGap).toBe(0);
        expect(st.timeScale).toBe(80);
    });

    it('색은 #rrggbb(aa)만, 자동 색은 빈 값도', () => {
        expect(sanitizeStyle({ cardColor: 'red', textColor: '' }).cardColor).toBe(DEFAULT_STYLE.cardColor);
        expect(sanitizeStyle({ cardColor: '#11223344', textColor: '' })).toMatchObject({ cardColor: '#11223344', textColor: '' });
        expect(sanitizeStyle({ bubbleColor: '' }).bubbleColor).toBe(DEFAULT_STYLE.bubbleColor);
    });

    it('직접 입력한 글꼴 이름에서 CSS를 깨는 글자를 뺀다', () => {
        expect(sanitizeStyle({ font: 'custom', fontCustom: ' Foo"; } body{x:url(y)} ' }).fontCustom).toBe('Foo  bodyx:urly');
    });
});

describe('styleAttrs', () => {
    it('기본 스타일은 기본 클래스와 변수만', () => {
        const a = styleAttrs(DEFAULT_STYLE);
        expect(a.className).toBe('tbc-styled tbc-styled--marker-none');
        expect(a.style).toMatchObject({ '--tbc-s-font': '14px', '--tbc-s-lh': '20px', '--tbc-s-time-color': 'inherit' });
    });

    it('설정에 맞는 클래스', () => {
        const a = styleAttrs({ ...DEFAULT_STYLE, divider: true, zebra: true, marker: 'fill', nickColor: 'single', nickEffects: false, timeMono: true });
        expect(a.className.split(' ')).toEqual(expect.arrayContaining([
            'tbc-styled--divider', 'tbc-styled--zebra', 'tbc-styled--marker-fill', 'tbc-styled--nick-single', 'tbc-styled--no-effects', 'tbc-styled--time-mono',
        ]));
    });
});

describe('공유 코드', () => {
    it('스타일과 템플릿이 그대로 돌아온다 (한글 포함)', () => {
        const style = { ...DEFAULT_STYLE, fontSize: 20, font: 'custom' as const, fontCustom: '나눔손글씨' };
        const templates = { chat: '<b>{{nickname}}</b> 안녕' };
        expect(importStyleCode(exportStyleCode(style, templates))).toEqual({ style, templates });
    });

    it('형식이 틀리거나 템플릿 문법이 틀리면 null', () => {
        expect(importStyleCode('hello')).toBeNull();
        expect(importStyleCode('TBC1:!!!')).toBeNull();
        expect(importStyleCode(exportStyleCode(DEFAULT_STYLE, { chat: '{{#badges}}' }))).toBeNull();
    });
});

describe('PRESETS', () => {
    it('기본 모양은 저장할 템플릿이 없다', () => {
        expect(presetTemplates(PRESETS[0])).toEqual({});
    });
});

describe('migrateLargeLook', () => {
    beforeEach(() => fakeBrowser.reset());

    it('"크게" 모양을 보통 템플릿 + 글자 크기 18로 옮긴다', async () => {
        await fakeBrowser.storage.local.set({ chzzkTemplates: buildTemplates({ layout: 'bubble', badges: true, size: 'large' }) });
        await migrateLargeLook();
        const r = await fakeBrowser.storage.local.get(['chzzkTemplates', 'chzzkTemplateStyle']);
        expect(r.chzzkTemplates).toEqual(templatesToStore(buildTemplates({ layout: 'bubble', badges: true, size: 'normal' })));
        expect(r.chzzkTemplateStyle.fontSize).toBe(18);
    });

    it('보통 모양이나 직접 고친 템플릿은 건드리지 않는다', async () => {
        await fakeBrowser.storage.local.set({ chzzkTemplates: { chat: '<div class="tbc-chat-large">{{nickname}}</div>' } });
        await migrateLargeLook();
        expect((await fakeBrowser.storage.local.get('chzzkTemplateStyle')).chzzkTemplateStyle).toBeUndefined();
        await fakeBrowser.storage.local.set({ chzzkTemplates: templatesToStore(buildTemplates(DEFAULT_LOOK)) });
        await migrateLargeLook();
        expect((await fakeBrowser.storage.local.get('chzzkTemplateStyle')).chzzkTemplateStyle).toBeUndefined();
    });
});
