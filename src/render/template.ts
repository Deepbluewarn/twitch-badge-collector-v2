/**
 * 채팅 템플릿 엔진 — 이메일 템플릿처럼 HTML에 치환 태그를 넣어 채팅 하나를 그린다.
 *
 *   {{name}}         값 (항상 HTML escape)
 *   {{{name}}}       날 HTML — `rawAllowed`에 있는 필드만. 나머지는 escape로 처리한다.
 *   {{#name}}…{{/name}}  섹션: 배열이면 항목마다 반복, 참이면 한 번, 거짓/빈 배열이면 생략
 *   {{^name}}…{{/name}}  반전 섹션: 거짓/빈 배열일 때만
 *   {{.}}            반복 중인 현재 항목
 *   name.sub         점으로 하위 필드
 *
 * 사용자가 템플릿을 직접 편집하므로 안전이 1순위다:
 *  - 채팅 데이터(닉네임, 본문 등)는 escape 없이 HTML에 들어갈 길이 없다.
 *    날 HTML은 우리가 만든 필드(rawAllowed)만 허용한다.
 *  - 템플릿 자체의 스크립트/이벤트 속성은 이 엔진이 막지 않는다 — 렌더 결과를
 *    반드시 DOMPurify로 sanitize해야 한다 (renderChzzkChat 참고).
 *
 * DOM을 쓰지 않는 순수 모듈.
 */

export class TemplateError extends Error {
    constructor(message: string, readonly index: number) {
        super(`${message} (위치 ${index})`);
        this.name = 'TemplateError';
    }
}

type Node =
    | { kind: 'text'; value: string }
    | { kind: 'var'; name: string; raw: boolean }
    | { kind: 'section'; name: string; inverted: boolean; children: Node[] };

const TAG = /\{\{(\{)?\s*([#^/]?)\s*([a-zA-Z0-9_.]+|\.)\s*(\})?\}\}/g;

export function parseTemplate(src: string): Node[] {
    const root: Node[] = [];
    const stack: { name: string; children: Node[]; index: number }[] = [];
    let current = root;
    let last = 0;

    for (const m of src.matchAll(TAG)) {
        const [whole, rawOpen, sigil, name, rawClose] = m;
        const index = m.index!;
        if (index > last) current.push({ kind: 'text', value: src.slice(last, index) });
        last = index + whole.length;

        if (!!rawOpen !== !!rawClose) throw new TemplateError(`중괄호 짝이 맞지 않습니다: ${whole}`, index);
        if (rawOpen && sigil) throw new TemplateError(`섹션 태그에는 {{{ }}}를 쓸 수 없습니다: ${whole}`, index);

        if (sigil === '#' || sigil === '^') {
            const node: Node = { kind: 'section', name, inverted: sigil === '^', children: [] };
            current.push(node);
            stack.push({ name, children: current, index });
            current = node.children;
        } else if (sigil === '/') {
            const open = stack.pop();
            if (!open) throw new TemplateError(`여는 태그 없이 닫았습니다: {{/${name}}}`, index);
            if (open.name !== name) throw new TemplateError(`{{#${open.name}}}을 {{/${name}}}로 닫았습니다`, index);
            current = open.children;
        } else {
            current.push({ kind: 'var', name, raw: !!rawOpen });
        }
    }
    if (stack.length) {
        const open = stack[stack.length - 1];
        throw new TemplateError(`{{#${open.name}}}이 닫히지 않았습니다`, open.index);
    }
    if (last < src.length) root.push({ kind: 'text', value: src.slice(last) });
    return root;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"'`]/g, c => ESC[c]);

function lookup(stack: unknown[], name: string): unknown {
    if (name === '.') return stack[stack.length - 1];
    const [head, ...rest] = name.split('.');
    // 안쪽 스코프부터 찾는다 — 반복 중인 항목의 필드가 바깥 필드를 가린다.
    for (let i = stack.length - 1; i >= 0; i--) {
        const scope = stack[i];
        if (scope && typeof scope === 'object' && Object.prototype.hasOwnProperty.call(scope, head)) {
            return rest.reduce<unknown>((v, k) =>
                v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, k) ? (v as any)[k] : undefined,
            (scope as any)[head]);
        }
    }
    return undefined;
}

const isFalsy = (v: unknown) => !v || (Array.isArray(v) && v.length === 0);

function renderNodes(nodes: Node[], stack: unknown[], raw: ReadonlySet<string>): string {
    let out = '';
    for (const n of nodes) {
        if (n.kind === 'text') { out += n.value; continue; }
        const v = lookup(stack, n.name);
        if (n.kind === 'var') {
            if (v === undefined || v === null || typeof v === 'object') continue;
            const s = String(v);
            out += n.raw && raw.has(n.name) ? s : escapeHtml(s);
            continue;
        }
        if (n.inverted) {
            if (isFalsy(v)) out += renderNodes(n.children, stack, raw);
        } else if (Array.isArray(v)) {
            for (const item of v) out += renderNodes(n.children, [...stack, item], raw);
        } else if (!isFalsy(v)) {
            out += renderNodes(n.children, typeof v === 'object' ? [...stack, v] : stack, raw);
        }
    }
    return out;
}

export interface CompiledTemplate {
    render(view: object): string;
}

/**
 * @param rawAllowed `{{{ }}}`로 날 HTML을 넣을 수 있는 필드 이름. 여기 없는 필드는
 *        `{{{ }}}`로 써도 escape된다 — 사용자가 템플릿에 실수로 넣어도 안전하게.
 */
export function compileTemplate(src: string, rawAllowed: Iterable<string> = []): CompiledTemplate {
    const ast = parseTemplate(src);
    const raw = new Set(rawAllowed);
    return { render: (view) => renderNodes(ast, [view], raw) };
}
