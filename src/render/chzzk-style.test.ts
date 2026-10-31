import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';
import { buildTemplates, DEFAULT_LOOK } from './chzzk-templates';

vi.stubGlobal('browser', fakeBrowser);
const { DEFAULT_STYLE, PART_KEYS, PRESETS, sanitizeStyle, styleCss, exportStyleCode, importStyleCode, migrateBadgeLook, migrateLargeLook, migrateLegacyDonation, presetTemplates, templatesToStore, withStyle } = await import('./chzzk-style');

describe('sanitizeStyle', () => {
    it('모르는 값은 기본값', () => {
        expect(sanitizeStyle(undefined)).toEqual(DEFAULT_STYLE);
        expect(sanitizeStyle({ window: { font: 'comic' }, nick: { weight: 650 }, line: { marker: 'x', divider: 'yes' }, foo: {} })).toEqual(DEFAULT_STYLE);
    });

    it('예전(부분 없이 한 겹) 값은 버린다', () => {
        expect(sanitizeStyle({ fontSize: 20, divider: true })).toEqual(DEFAULT_STYLE);
    });

    it('숫자는 범위 안으로, 칸에 맞춰', () => {
        const st = sanitizeStyle({ window: { size: 99, lineHeight: 1.437 }, line: { padY: -5 }, time: { size: 83 } });
        expect(st.window.size).toBe(28);
        expect(st.window.lineHeight).toBe(1.44);
        expect(st.line.padY).toBe(0);
        expect(st.time.size).toBe(85);
    });

    it('색은 #rrggbb(aa)만, 비울 수 있는 색만 빈 값', () => {
        expect(sanitizeStyle({ card: { bg: 'red' } }).card.bg).toBe(DEFAULT_STYLE.card.bg);
        expect(sanitizeStyle({ card: { bg: '#11223344' }, text: { color: '' } })).toMatchObject({ card: { bg: '#11223344' }, text: { color: '' } });
        expect(sanitizeStyle({ bubble: { bg: '' } }).bubble.bg).toBe('');
        expect(sanitizeStyle({ line: { dividerColor: '' } }).line.dividerColor).toBe(DEFAULT_STYLE.line.dividerColor);
    });

    it('직접 입력한 글꼴 이름에서 CSS를 깨는 글자를 뺀다', () => {
        expect(sanitizeStyle({ nick: { font: 'custom', fontCustom: ' Foo"; } body{x:url(y)} ' } }).nick.fontCustom).toBe('Foo  bodyx:urly');
    });
});

describe('styleCss', () => {
    const rulesFor = (css: string, sel: string) => css.split('\n').filter(l => l.includes(sel));

    it('기본 스타일은 기본 모양 값 그대로', () => {
        const css = styleCss(DEFAULT_STYLE);
        expect(css).toContain('.tbc-styled.tbc-styled .tbc-chat { font-family:');
        expect(css).toContain('font-size: 14px; line-height: 20px');
        expect(css).not.toContain('display: none');
        expect(css).not.toContain('border-top');
    });

    it('부분마다 같은 글자·배경 설정이 그 부분에 걸린다', () => {
        const st = withStyle(DEFAULT_STYLE, {
            text: { size: 150, color: '#ff0000', bg: '#00000080', italic: true },
            emoji: { bg: '#123456', radius: 6 },
            card: { borderWidth: 3, borderSide: 'left', borderColor: '#ffd400', bg: '#00112233' },
        });
        const css = styleCss(st);
        expect(rulesFor(css, '.tbc-chat-text, ').join()).toMatch(/font-size: 21px.*font-style: italic.*color: #ff0000/);
        expect(rulesFor(css, 'tbc-chat-text {').join()).toContain('background: #00000080');
        expect(rulesFor(css, 'tbc-chat-emoji').join()).toMatch(/background: #123456.*border-radius: 6px/);
        expect(css).toContain('border-left: 3px solid #ffd400');
        expect(rulesFor(css, '--gift {').join()).toContain('background: #00112233');
    });

    it('특징 설정', () => {
        const css = styleCss(withStyle(DEFAULT_STYLE, {
            line: { divider: true, zebra: true, marker: 'fill' }, badge: { firstOnly: true, verified: false },
            nick: { effects: false }, hidden: { mode: 'hide' },
        }));
        // 구분선은 줄 사이 간격(3px) 한가운데의 곧은 선, 카드 위는 여백 4px만큼 더 위
        expect(css).toContain('.tbc-chat ~ .tbc-chat::after { content: ""; position: absolute; left: 0; right: 0; top: -2px; height: 1px; background: #80808038;');
        expect(css).toContain('.tbc-chat ~ .tbc-chat--donation::after');
        expect(css).toMatch(/--gift::after \{ top: -4px; left: -6px; right: -6px; \}/);
        expect(css).toContain('.tbc-chat--alt { background: #80808017; }');
        expect(css).toContain('.tbc-chat-badge ~ .tbc-chat-badge { display: none; }');
        expect(css).toContain('.tbc-chat-verified { display: none; }');
        expect(css).toContain('background-image: none !important');
        expect(css).toContain('.tbc-chat--cleanbot');
        expect(css).toContain('color-mix');
    });
});

describe('공유 코드', () => {
    it('스타일과 템플릿이 그대로 돌아온다 (한글 포함)', async () => {
        const style = withStyle(DEFAULT_STYLE, { window: { size: 20, font: 'custom', fontCustom: '나눔손글씨' }, nick: { font: 'custom', fontCustom: 'Foo' }, line: { divider: true } });
        const templates = { chat: '<b>{{nickname}}</b> 안녕' };
        expect(await importStyleCode(await exportStyleCode(style, templates))).toEqual({ style, templates });
    });

    it('기본 모양은 아주 짧고, 바꾼 값만큼 길어진다', async () => {
        const plain = await exportStyleCode(DEFAULT_STYLE, {});
        expect(plain).toBe('TBC2:' + plain.slice(5));
        expect(plain.length).toBeLessThanOrEqual(5 + 3);
        const one = await exportStyleCode(withStyle(DEFAULT_STYLE, { window: { size: 18 } }), {});
        expect(one.length).toBeLessThanOrEqual(5 + 6);
        for (const p of PRESETS) {
            const style = withStyle(DEFAULT_STYLE, p.style);
            const code = await exportStyleCode(style, presetTemplates(p));
            expect(code).not.toContain('.');
            expect(code.length).toBeLessThan(48);
            expect(await importStyleCode(code)).toEqual({ style, templates: presetTemplates(p) });
        }
    });

    it('모든 부분을 바꿔도 돌아온다', async () => {
        const style = sanitizeStyle(Object.fromEntries(PART_KEYS.map(p => [p, {
            bg: '#11223344', padY: 3, radius: 5, borderWidth: 2, borderColor: '#abcdef', borderSide: 'bottom',
            size: 120, weight: 800, italic: true, color: '#ffffff', font: 'serif',
        }])));
        expect((await importStyleCode(await exportStyleCode(style, {})))?.style).toEqual(style);
    });

    it('비울 수 있는 색을 비운 것도 돌아온다', async () => {
        const style = withStyle(DEFAULT_STYLE, { bubble: { bg: '' }, card: { bg: '' } });
        expect((await importStyleCode(await exportStyleCode(style, {})))?.style).toEqual(style);
    });

    it('카드 배경을 정하면 후원 글자는 일반 글자색, 글자색을 정하면 그 색', () => {
        const one = styleCss(withStyle(DEFAULT_STYLE, { card: { bg: '#ff7ab61f' } }));
        expect(one).toMatch(/\.tbc-chat--donation \{ color: inherit; \}/);
        expect(styleCss(withStyle(DEFAULT_STYLE, { card: { bg: '#ff7ab61f', color: '#000000' } }))).not.toContain('color: inherit');
    });

    it('줄 배경을 줘도 카드는 원래 카드 색, 카드 배경을 정하면 그 색', () => {
        expect(styleCss(withStyle(DEFAULT_STYLE, { line: { bg: '#80808033' } }))).toMatch(/--gift \{[^}]*background: var\(--tbc-card-bg\)/);
        expect(styleCss(withStyle(DEFAULT_STYLE, { line: { bg: '#80808033' }, card: { bg: '#112233' } }))).not.toContain('var(--tbc-card-bg)');
    });

    it('형식이 틀리거나 템플릿 문법이 틀리면 null', async () => {
        expect(await importStyleCode('hello')).toBeNull();
        expect(await importStyleCode('TBC2:x123')).toBeNull();
        expect(await importStyleCode((await exportStyleCode(DEFAULT_STYLE, {})) + 'AAAA')).toBeNull();
        expect(await importStyleCode(await exportStyleCode(DEFAULT_STYLE, { chat: '{{#badges}}' }))).toBeNull();
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
        expect(r.chzzkTemplateStyle.window.size).toBe(18);
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

describe('업데이트 때 옮기기 (background 순서)', () => {
    beforeEach(() => fakeBrowser.reset());

    // buildTemplates(look, true)는 v2.24.1이 저장하던 템플릿과 글자까지 같다 (2026-10-31 열두 모양 대조)
    const migrate = async () => { await migrateLargeLook(); await migrateLegacyDonation(); await migrateBadgeLook(); };

    it.each([
        { layout: 'inline', badges: false, size: 'normal' },
        { layout: 'stacked', badges: true, size: 'large' },
        { layout: 'bubble', badges: false, size: 'large' },
    ] as const)('예전 모양 $layout/$badges/$size는 새 후원 템플릿의 보통 모양, 배지 없는 모양은 스타일의 배지 숨김이 된다', async (look) => {
        await fakeBrowser.storage.local.set({ chzzkTemplates: templatesToStore(buildTemplates(look, true)) });
        await migrate();
        const r = await fakeBrowser.storage.local.get(['chzzkTemplates', 'chzzkTemplateStyle']);
        expect(r.chzzkTemplates).toEqual(templatesToStore(buildTemplates({ ...look, badges: true, size: 'normal' })));
        expect(sanitizeStyle(r.chzzkTemplateStyle).badge.hide).toBe(!look.badges);
    });

    it('직접 고친 템플릿과 저장된 게 없는 경우는 그대로', async () => {
        const own = { ...templatesToStore(buildTemplates({ layout: 'inline', badges: false, size: 'normal' }, true)), chat: '<b>{{nickname}}</b>' };
        await fakeBrowser.storage.local.set({ chzzkTemplates: own });
        await migrate();
        expect((await fakeBrowser.storage.local.get('chzzkTemplates')).chzzkTemplates).toEqual(own);
        fakeBrowser.reset();
        await migrate();
        expect((await fakeBrowser.storage.local.get('chzzkTemplates')).chzzkTemplates).toBeUndefined();
    });
});
