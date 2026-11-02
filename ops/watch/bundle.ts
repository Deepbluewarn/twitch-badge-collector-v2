/**
 * 치지직 JS, CSS 번들에서 확장이 기대는 이름과 새 기능의 흔적을 뽑는다.
 *
 * 번들은 배포마다 파일 이름과 압축 결과가 통째로 바뀌어 줄 단위 diff는 쓸모가 없다. 대신
 *  - 의존: 확장 코드(selector JSON, chzzk-socket.ts)가 기대는 이름이 번들에 아직 있는지
 *  - 신호: 소켓 cmd 표, 메시지 타입 enum, 이벤트 타입 enum, API 경로, CSS 모듈 이름을 집합으로 모아
 *    지난번과 비교한다. 해시만 바뀐 건 무시한다.
 *
 * 의존 목록은 매번 GitHub master에서 받아 확장 코드와 저절로 맞춘다.
 */
import { RAW, fetchJson, fetchText } from './state.ts';

export interface BundleFile {
    url: string;
    text: string;
}

export interface BundleSignals {
    files: string[];
    cssNames: string[];
    msgTypes: Record<string, number>;
    socketCmds: Record<string, string>;
    eventTypes: string[];
    apiPaths: string[];
}

export interface Dependency {
    kind: string;
    name: string;
    /** 확장 코드의 어디에서 쓰는지 */
    where: string;
    found: boolean;
    /** ok: 있음, gone: 전에 있었는데 사라짐(위험), absent: 처음부터 못 찾음(지연 로드 청크일 수 있어 판정 안 함) */
    status?: 'ok' | 'gone' | 'absent';
    detail?: string;
}

export interface SignalDiff {
    added: Record<string, string[]>;
    removed: Record<string, string[]>;
}

// 치지직 자체 번들만 본다. 광고, 플레이어 SDK는 뺀다.
export const isChzzkBundle = (url: string) => /ssl\.pstatic\.net\/static\/nng\/glive\/resource\/.*\.(js|css)(\?|$)/.test(url);

function objectLiteralAround(text: string, marker: string): string | undefined {
    const at = text.indexOf(marker);
    if (at < 0) return undefined;
    const start = text.lastIndexOf('{', at);
    const end = text.indexOf('}', at);
    return start < 0 || end < 0 ? undefined : text.slice(start + 1, end);
}

export function extractSignals(files: BundleFile[]): BundleSignals {
    const own = files.filter((f) => isChzzkBundle(f.url));
    const css = own.filter((f) => /\.css(\?|$)/.test(f.url)).map((f) => f.text).join('\n');
    const js = own.filter((f) => /\.js(\?|$)/.test(f.url)).map((f) => f.text).join('\n');

    // CSS 모듈: `._chatting_message_w9pvh_21` → `_chatting_message_`
    const cssNames = new Set<string>();
    for (const m of css.matchAll(/\._([a-z][a-z0-9_]*?)_[a-z0-9]{5}_\d+(?![\w-])/g)) cssNames.add(`_${m[1]}_`);

    // 메시지 타입 enum: `{TEXT:1,DONATION:10,...}`
    const msgTypes: Record<string, number> = {};
    const msgBody = objectLiteralAround(js, 'STREAMER_SHOP_PURCHASE:');
    for (const m of msgBody?.matchAll(/([A-Z_]+):(\d+(?:e\d+)?)/g) ?? []) msgTypes[m[1]] = Number(m[2]);

    // 소켓 cmd: `case 93101:_n.emit(`notiSendLive`,...)`
    const socketCmds: Record<string, string> = {};
    for (const m of js.matchAll(/case (\d{4,6}):[\w$]+\.emit\(`(\w+)`/g)) socketCmds[m[1]] = m[2];

    // 이벤트 타입 enum: `{...,SUBSCRIPTION_GIFT_RECEIVER:`SUBSCRIPTION_GIFT_RECEIVER`,...}`
    const eventBody = objectLiteralAround(js, 'SUBSCRIPTION_GIFT_RECEIVER:');
    const eventTypes = [...(eventBody?.matchAll(/([A-Z_]+):`\1`/g) ?? [])].map((m) => m[1]);

    // API 경로. 기준 주소 없이 `/channels/${e}/live-detail-meta?...`처럼 들어 있다. 페이지 경로도 섞이지만
    // 그것도 새 기능의 흔적이라 같이 본다. 템플릿의 `${...}`는 {}로 바꾼다
    const apiPaths = new Set<string>();
    for (const m of js.matchAll(/`(\/[a-z][\w-]*(?:\/(?:\$\{[^}`]*\}|[\w-]+))+)(?:\?[^`]*)?`/g)) {
        apiPaths.add(m[1].replace(/\$\{[^}]*\}/g, '{}'));
    }

    return {
        files: own.map((f) => f.url.replace(/^https:\/\/ssl\.pstatic\.net\/static\/nng\/glive\/resource\/p\/static\//, '')),
        cssNames: [...cssNames].sort(),
        msgTypes,
        socketCmds,
        eventTypes: eventTypes.sort(),
        apiPaths: [...apiPaths].sort(),
    };
}

interface SelectorConfig {
    platforms: {
        chzzk: {
            selectors: Record<string, string>;
            reactPropsPaths: Record<string, Record<string, string>>;
        };
    };
}

// 확장 코드에서 읽는 소켓 필드. chzzk-socket.ts가 `r.xxx`로 읽는 이름 중 흔하지 않은 것
const GENERIC = new Set(['children', 'props', 'key', 'time', 'msg', 'uid', 'bdy', 'cmd', 'content', 'extras', 'profile']);

/** 확장 master 코드가 번들에 기대는 이름들을 확인한다. */
export async function checkDependencies(files: BundleFile[], signals: BundleSignals): Promise<Dependency[]> {
    const own = files.filter((f) => isChzzkBundle(f.url));
    const css = own.filter((f) => /\.css(\?|$)/.test(f.url)).map((f) => f.text).join('\n');
    const js = own.filter((f) => /\.js(\?|$)/.test(f.url)).map((f) => f.text).join('\n');
    const deps: Dependency[] = [];

    const config = await fetchJson<SelectorConfig>(`${RAW}/src/platform/bundled-selectors.prod.json`);
    const chzzk = config.platforms.chzzk;
    for (const [key, selector] of Object.entries(chzzk.selectors)) {
        if (typeof selector !== 'string') continue;
        if (key === 'foldedClassSubstring') {
            deps.push({ kind: 'CSS', name: selector, where: `selector ${key}`, found: css.includes(selector) });
            continue;
        }
        for (const m of selector.matchAll(/\[class\*="([^"]+)"\]/g)) {
            deps.push({ kind: 'CSS', name: m[1], where: `selector ${key}`, found: css.includes(m[1]) });
        }
        // 따옴표 안을 뺀 나머지에서 .class 토큰
        for (const m of selector.replace(/"[^"]*"/g, '').matchAll(/\.([A-Za-z_][\w-]*)/g)) {
            // 플레이어 쪽 클래스는 CSS가 아니라 JS 문자열에만 있다
            const found = new RegExp(`\\.${m[1]}(?![\\w-])`).test(css) || new RegExp(`\\b${m[1]}\\b`).test(js);
            deps.push({ kind: 'CSS', name: `.${m[1]}`, where: `selector ${key}`, found });
        }
    }
    for (const [mode, paths] of Object.entries(chzzk.reactPropsPaths)) {
        for (const [key, path] of Object.entries(paths)) {
            for (const part of path.split('.')) {
                if (GENERIC.has(part)) continue;
                deps.push({ kind: 'React props', name: part, where: `${mode} ${key}`, found: new RegExp(`\\b${part}\\b`).test(js) });
            }
        }
    }

    const socketSrc = await fetchText(`${RAW}/src/platform/chzzk-socket.ts`);
    const block = (name: string) => socketSrc.match(new RegExp(`export const ${name} = \\{([^}]*)\\}`))?.[1] ?? '';
    for (const m of block('CHZZK_CMD').matchAll(/(\w+):\s*(\d+)/g)) {
        const [, name, value] = m;
        // PONG(1e4)처럼 지수 표기로 압축되거나 emit 표 밖에 있는 값도 있다
        const found = value in signals.socketCmds || new RegExp(`\\b(${value}|${Number(value).toExponential().replace('+', '')})\\b`).test(js);
        deps.push({ kind: '소켓 cmd', name: `${name} ${value}`, where: 'chzzk-socket.ts CHZZK_CMD', found, detail: signals.socketCmds[value] });
    }
    for (const m of block('CHZZK_MSG_TYPE').matchAll(/(\w+):\s*(\d+)/g)) {
        const [, name, value] = m;
        const actual = signals.msgTypes[name];
        deps.push({
            kind: '메시지 타입',
            name: `${name} ${value}`,
            where: 'chzzk-socket.ts CHZZK_MSG_TYPE',
            found: actual === Number(value),
            detail: actual === undefined ? '번들 enum에 없음' : actual === Number(value) ? undefined : `번들 값 ${actual}`,
        });
    }
    const fields = new Set([...socketSrc.matchAll(/\br\??\.(\w+)/g)].map((m) => m[1]).filter((f) => !GENERIC.has(f) && f.length > 4));
    for (const field of [...fields].sort()) {
        deps.push({ kind: '소켓 필드', name: field, where: 'chzzk-socket.ts', found: new RegExp(`\\b${field}\\b`).test(js) });
    }
    // 같은 이름을 여러 selector가 쓰면 한 줄로 합친다
    const merged = new Map<string, Dependency>();
    for (const d of deps) {
        const key = `${d.kind} ${d.name}`;
        const prev = merged.get(key);
        if (prev && !prev.where.split(', ').includes(d.where)) prev.where += `, ${d.where}`;
        else if (!prev) merged.set(key, d);
    }
    return [...merged.values()];
}

/** 한 번이라도 찾았던 의존이 사라졌을 때만 위험으로 본다. seen은 이전 결과에서 이어받는다. */
export function judgeDependencies(deps: Dependency[], prev: Dependency[] | undefined): Dependency[] {
    const seen = new Set((prev ?? []).filter((d) => d.status === 'ok' || d.status === 'gone').map((d) => `${d.kind} ${d.name}`));
    return deps.map((d) => ({ ...d, status: d.found ? 'ok' : seen.has(`${d.kind} ${d.name}`) ? 'gone' : 'absent' }));
}

export function diffSignals(prev: BundleSignals | undefined, cur: BundleSignals): SignalDiff {
    const added: Record<string, string[]> = {};
    const removed: Record<string, string[]> = {};
    if (!prev) return { added, removed };
    const sets: Record<string, [string[], string[]]> = {
        'CSS 이름': [prev.cssNames, cur.cssNames],
        '메시지 타입': [Object.entries(prev.msgTypes).map(([k, v]) => `${k}=${v}`), Object.entries(cur.msgTypes).map(([k, v]) => `${k}=${v}`)],
        '소켓 cmd': [Object.entries(prev.socketCmds).map(([k, v]) => `${k} ${v}`), Object.entries(cur.socketCmds).map(([k, v]) => `${k} ${v}`)],
        '이벤트 타입': [prev.eventTypes, cur.eventTypes],
        'API 경로': [prev.apiPaths, cur.apiPaths],
    };
    for (const [kind, [a, b]] of Object.entries(sets)) {
        // 번들 일부를 못 받으면 집합이 통째로 비어 전부 사라진 것처럼 보인다. 그땐 비교하지 않는다
        if (!a.length || !b.length) continue;
        const before = new Set(a);
        const after = new Set(b);
        const plus = b.filter((x) => !before.has(x));
        const minus = a.filter((x) => !after.has(x));
        if (plus.length) added[kind] = plus;
        if (minus.length) removed[kind] = minus;
    }
    return { added, removed };
}
