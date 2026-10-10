import { describe, it, expect } from 'vitest';
import { compileTemplate, parseTemplate, TemplateError, escapeHtml, stripNewlineWhitespace } from './template';

const r = (src: string, view: object, raw: string[] = []) => compileTemplate(src, raw).render(view);

describe('변수', () => {
    it('치환하고 항상 escape한다', () => {
        expect(r('<b>{{nickname}}</b>', { nickname: '<img src=x onerror=alert(1)>' }))
            .toBe('<b>&lt;img src=x onerror=alert(1)&gt;</b>');
    });

    it('속성 값 안에서도 따옴표를 escape한다', () => {
        expect(r('<i title="{{t}}">', { t: '" onmouseover="x' })).toBe('<i title="&quot; onmouseover=&quot;x">');
    });

    it('숫자·불리언은 문자열로, 없거나 객체인 값은 빈 문자열', () => {
        expect(r('{{a}}|{{b}}|{{c}}|{{d}}', { a: 3, b: false, d: { x: 1 } })).toBe('3|false||');
    });

    it('점으로 하위 필드', () => {
        expect(r('{{donation.amount}}', { donation: { amount: 1000 } })).toBe('1000');
    });

    it('프로토타입 필드는 읽지 않는다', () => {
        expect(r('{{constructor}}{{a.toString}}', { a: {} })).toBe('');
    });
});

describe('날 HTML {{{ }}}', () => {
    it('허용 목록의 필드만 날 HTML', () => {
        expect(r('{{{messageHtml}}}', { messageHtml: '<img src="e.png">' }, ['messageHtml'])).toBe('<img src="e.png">');
    });

    it('허용 목록에 없으면 escape (사용자가 실수로 써도 안전)', () => {
        expect(r('{{{nickname}}}', { nickname: '<b>x</b>' }, ['messageHtml'])).toBe('&lt;b&gt;x&lt;/b&gt;');
    });
});

describe('섹션', () => {
    it('배열은 항목마다 반복하고 항목 필드가 바깥을 가린다', () => {
        const view = { url: 'outer', badges: [{ url: 'a.png' }, { url: 'b.png' }] };
        expect(r('{{#badges}}<img src="{{url}}">{{/badges}}{{url}}', view)).toBe('<img src="a.png"><img src="b.png">outer');
    });

    it('{{.}}는 현재 항목', () => {
        expect(r('{{#xs}}[{{.}}]{{/xs}}', { xs: ['a', 'b'] })).toBe('[a][b]');
    });

    it('참이면 한 번, 객체면 그 안으로 들어간다', () => {
        expect(r('{{#on}}Y{{/on}}{{#d}}{{amount}}{{/d}}', { on: true, d: { amount: 5 } })).toBe('Y5');
    });

    it('거짓·빈 배열은 생략, 반전 섹션은 그때만', () => {
        expect(r('{{#xs}}X{{/xs}}{{^xs}}none{{/xs}}{{^on}}off{{/on}}', { xs: [], on: false })).toBe('noneoff');
    });

    it('반복 안에서 바깥 필드도 읽힌다', () => {
        expect(r('{{#xs}}{{.}}-{{n}} {{/xs}}', { n: 'N', xs: [1, 2] })).toBe('1-N 2-N ');
    });
});

describe('문법 오류', () => {
    it('닫히지 않은 섹션', () => {
        expect(() => parseTemplate('a{{#badges}}b')).toThrow(TemplateError);
        expect(() => parseTemplate('a{{#badges}}b')).toThrow(/닫히지 않았습니다/);
    });

    it('엉뚱한 이름으로 닫음', () => {
        expect(() => parseTemplate('{{#a}}{{/b}}')).toThrow(/\{\{#a\}\}을 \{\{\/b\}\}로/);
    });

    it('여는 태그 없이 닫음', () => {
        expect(() => parseTemplate('{{/a}}')).toThrow(/여는 태그 없이/);
    });

    it('중괄호 짝 불일치', () => {
        expect(() => parseTemplate('{{{a}}')).toThrow(/중괄호/);
    });

    it('오류 위치를 알려준다', () => {
        try { parseTemplate('0123{{/a}}'); } catch (e) { expect((e as TemplateError).index).toBe(4); }
    });

    it('태그가 아닌 중괄호는 그대로 둔다', () => {
        expect(r('a { b } {c}', {})).toBe('a { b } {c}');
    });
});

it('escapeHtml', () => {
    expect(escapeHtml(`<a href="x" title='y'>&\``)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&#96;');
});

describe('줄바꿈 공백', () => {
    it('줄바꿈이 들어간 공백은 지우고 같은 줄 공백은 둔다', () => {
        expect(stripNewlineWhitespace('<b>\n    a b\n</b>\r\n  <i>x</i>  \n')).toBe('<b>a b</b><i>x</i>');
    });

    it('여러 줄로 들여 쓴 템플릿도 태그 사이에 틈이 없다', () => {
        const src = '{{#badges}}\n    <img src="{{url}}">\n{{/badges}}\n<span>{{nickname}}</span>';
        expect(r(src, { badges: [{ url: 'a' }, { url: 'b' }], nickname: 'n' })).toBe('<img src="a"><img src="b"><span>n</span>');
    });

    it('오류 위치는 원문 기준', () => {
        expect(() => compileTemplate('a\n  {{/x}}')).toThrow(/위치 4/);
    });
});
