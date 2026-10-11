import { describe, it, expect } from 'vitest';
import { sanitizeStoredTemplates, validateTemplate, TEMPLATE_MAX_LENGTH } from './template-store';

describe('sanitizeStoredTemplates', () => {
    it('알려진 종류의 문자열만 남긴다', () => {
        expect(sanitizeStoredTemplates({ chat: 'a', donation: 3, subscription: 'c', evil: 'x' }))
            .toEqual({ chat: 'a', subscription: 'c' });
    });

    it('객체가 아니면 빈 값', () => {
        expect(sanitizeStoredTemplates(undefined)).toEqual({});
        expect(sanitizeStoredTemplates('chat')).toEqual({});
    });

    it('너무 긴 템플릿은 버린다', () => {
        expect(sanitizeStoredTemplates({ chat: 'x'.repeat(TEMPLATE_MAX_LENGTH + 1) })).toEqual({});
    });
});

describe('validateTemplate', () => {
    it('문법이 맞으면 ok', () => {
        expect(validateTemplate('{{#badges}}<img src="{{url}}">{{/badges}}{{nickname}}')).toEqual({ ok: true });
    });

    it('문법 오류는 메시지와 위치', () => {
        const r = validateTemplate('ab{{#badges}}');
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.index).toBe(2);
            expect(r.message).toMatch(/닫히지 않았습니다/);
        }
    });

    it('길이 제한', () => {
        expect(validateTemplate('x'.repeat(TEMPLATE_MAX_LENGTH + 1)).ok).toBe(false);
    });
});
