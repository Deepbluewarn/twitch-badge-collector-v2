/**
 * Selector 문자열 문법 헬퍼. 의존성 0 — 확장 런타임(src)과 canary 스크립트(scripts)
 * 양쪽에서 import한다.
 *
 * 배경: rev 14부터 fragile한 selector는 CSS selector list(콤마)로 여러 후보를 나열한다.
 * `querySelectorAll("A, B")`가 이미 OR이라 코드 변경 없이 이중화가 되지만, 대신
 * "한쪽 branch가 죽어도 전체는 계속 매칭" 이라서 canary/진단이 조용해진다.
 * 그걸 막으려면 branch를 쪼개 개별 건강 상태를 봐야 한다.
 */

/**
 * Selector list를 top-level 콤마 기준으로 분리한다.
 *
 * `:has(a, b)` / `[attr="x,y"]` 안의 콤마는 무시 — 단순 split(',')은 이런 selector를
 * 조각내 invalid selector를 만든다 (우리 chatRoomLive가 이미 `:has()` 사용 중).
 */
export function splitSelectorBranches(selector: string): string[] {
    const branches: string[] = [];
    let depth = 0;
    let quote: string | null = null;
    let start = 0;

    for (let i = 0; i < selector.length; i++) {
        const ch = selector[i];

        if (quote) {
            // 문자열 안 — escape 다음 문자는 통째로 skip.
            if (ch === '\\') i++;
            else if (ch === quote) quote = null;
            continue;
        }

        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (ch === '(' || ch === '[') { depth++; continue; }
        if (ch === ')' || ch === ']') { depth = Math.max(0, depth - 1); continue; }

        if (ch === ',' && depth === 0) {
            branches.push(selector.slice(start, i).trim());
            start = i + 1;
        }
    }
    branches.push(selector.slice(start).trim());

    return branches.filter(b => b.length > 0);
}

/**
 * Selector 안에 박힌 CSS-module class hash를 뽑는다. 예: `_container_zw6kq_` →
 * `{ word: 'container', hash: 'zw6kq' }`.
 *
 * 이 값들이 chzzk 빌드마다 재생성되는 fragile 지점. hash 없는 branch만 있는
 * selector는 롤링에 면역이므로 canary가 굳이 감시할 필요도 없다.
 */
export function extractClassHashes(selector: string): Array<{ word: string; hash: string; token: string }> {
    const out: Array<{ word: string; hash: string; token: string }> = [];
    const re = /_([a-z]+)_([a-z0-9]{4,})_/gi;
    for (const m of selector.matchAll(re)) {
        out.push({ word: m[1], hash: m[2], token: m[0] });
    }
    return out;
}
