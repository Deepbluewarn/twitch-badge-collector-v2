import { describe, it, expect } from 'vitest';
import { buildTemplates, detectLook, DEFAULT_CHZZK_TEMPLATES, DEFAULT_LOOK, LOOK_LAYOUTS, LOOK_SIZES } from './chzzk-templates';
import { validateTemplate } from './template-store';

const ALL = LOOK_LAYOUTS.flatMap(layout => [true, false].flatMap(badges => LOOK_SIZES.map(size => ({ layout, badges, size }))));

describe('buildTemplates', () => {
    it('기본 모양이 기본 템플릿', () => {
        expect(buildTemplates(DEFAULT_LOOK)).toEqual(DEFAULT_CHZZK_TEMPLATES);
    });

    it('모든 조합이 문법 오류 없이 만들어진다', () => {
        for (const look of ALL) for (const src of Object.values(buildTemplates(look))) expect(validateTemplate(src)).toEqual({ ok: true });
    });

    it('배지 숨김이면 어느 종류에도 배지가 없다', () => {
        for (const src of Object.values(buildTemplates({ ...DEFAULT_LOOK, badges: false }))) expect(src).not.toContain('{{#badges}}');
    });

    it('배치는 일반 채팅만 바꾼다', () => {
        const a = buildTemplates(DEFAULT_LOOK);
        const b = buildTemplates({ ...DEFAULT_LOOK, layout: 'bubble' });
        expect(b.chat).not.toBe(a.chat);
        expect(b.donation).toBe(a.donation);
    });
});

describe('detectLook', () => {
    it('만든 템플릿에서 모양을 거꾸로 찾는다', () => {
        for (const look of ALL) expect(detectLook(buildTemplates(look))).toEqual(look);
    });

    it('한 종류라도 고쳤으면 null', () => {
        expect(detectLook({ ...DEFAULT_CHZZK_TEMPLATES, gift: '<b>{{nickname}}</b>' })).toBeNull();
    });
});
