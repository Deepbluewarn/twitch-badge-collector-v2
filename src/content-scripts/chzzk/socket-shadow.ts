import type { ChatInfo } from "@/interfaces/chat";
import type { ChzzkSocketChat } from "@/platform/chzzk-socket";
import { toChatInfo } from "@/platform/chzzk-socket";
import {
    CHAT_ATTR,
    TBC_CHAT_PASSED_ACTION,
    TBC_SOCKET_CHAT_ACTION,
    TbcChatPassedMessage,
    TbcSocketChatMessage,
} from "@/interfaces/chat-attributes";

/**
 * 소켓 경로 shadow 비교 — 화면은 기존 HTML 경로 그대로 두고, 같은 채팅을 소켓 경로로도
 * 처리해 결과가 같은지만 본다. 소켓 경로로 전환해도 되는지 판단하기 위한 검증 도구.
 *
 * 짝 맞추기: host의 chatMessage.key는 `${uid}_${msgTime}_${랜덤}`, 소켓 채팅 id는
 * `${uid}_${msgTime}` — key 앞 두 토막이 id다.
 *
 * 비교 항목: 닉네임 / 배지(집합) / 키워드 대상 텍스트 / 필터 통과 여부.
 * 짝이 끝내 안 생긴 채팅도 센다 — html만 있으면 소켓이 놓친 것(심각),
 * 소켓만 있으면 host가 안 그렸거나 가상 스크롤로 못 본 것(대개 무해).
 */

export type ShadowField = 'name' | 'badges' | 'text' | 'verdict';

export interface ShadowMismatch {
    id: string;
    field: ShadowField;
    html: unknown;
    socket: unknown;
    /** 판단에 필요한 맥락 (메시지 종류, 상태). */
    type: number;
    status: string;
}

export interface ShadowStats {
    matched: number;
    /** 필드별 불일치 채팅 수. 한 채팅이 여러 필드에서 어긋나면 각각 센다. */
    mismatched: Record<ShadowField, number>;
    /** 짝 없이 만료 — 소켓이 놓친 채팅. */
    htmlOnly: number;
    /** 짝 없이 만료됐지만 shadow 시작 전에 올라온 채팅 — 리스너가 붙기 전에 지나간 소켓 메시지라 무해. */
    htmlOnlyBeforeStart: number;
    /** 짝 없이 만료 — host가 안 그린 채팅. 메시지 종류별. */
    socketOnly: Record<string, number>;
    /** 아직 짝을 기다리는 중. */
    pending: number;
    htmlOnlySamples: string[];
    /**
     * 소켓 도착 → host DOM에 원본이 그려지기까지(html 메시지 도착) 걸린 시간, ms.
     * native 표시 스타일이 원본을 얼마나 기다려야 하는지 정하는 근거. html이 먼저 온 짝은 0.
     */
    renderDelay: { count: number; p50: number; p95: number; p99: number; max: number };
}

export interface SocketShadowOptions {
    predicate: (chat: ChatInfo) => { pass: boolean };
    verifiedBadgeUrl?: string;
    onMismatch: (m: ShadowMismatch) => void;
    /** 짝을 기다리는 최대 시간. 소켓이 DOM보다 먼저 오고, DOM은 렌더 지연이 있다. */
    pairTimeoutMs?: number;
    now?: () => number;
}

/** host key → 소켓 id. 형식이 다르면(CUSTOM_ 등 클라이언트 메시지) null. */
export function socketIdFromHostKey(key: string): string | null {
    const m = /^([^_]+)_(\d+)_/.exec(key);
    if (!m || m[1] === 'CUSTOM') return null;
    return `${m[1]}_${m[2]}`;
}

const normText = (xs: string[]) => xs.join(' ').replace(/\s+/g, ' ').trim();

export function createSocketShadow(opts: SocketShadowOptions) {
    const timeout = opts.pairTimeoutMs ?? 15000;
    const now = opts.now ?? Date.now;
    const startedAt = now();

    const socketWaiting = new Map<string, { chat: ChzzkSocketChat; at: number }>();
    const htmlWaiting = new Map<string, { info: ChatInfo; at: number }>();
    // 같은 채팅은 한 번만 비교 — 가상 스크롤로 html이 다시 오거나 recent와 live가 겹칠 때.
    const done = new Set<string>();

    const stats: ShadowStats = {
        matched: 0,
        mismatched: { name: 0, badges: 0, text: 0, verdict: 0 },
        htmlOnly: 0,
        htmlOnlyBeforeStart: 0,
        socketOnly: {},
        pending: 0,
        htmlOnlySamples: [],
        renderDelay: { count: 0, p50: 0, p95: 0, p99: 0, max: 0 },
    };
    // 최근 표본만 — 오래 켜 두어도 메모리가 늘지 않게.
    const delays: number[] = [];
    const DELAY_SAMPLES = 2000;
    const recordDelay = (ms: number) => {
        delays.push(Math.max(0, ms));
        if (delays.length > DELAY_SAMPLES) delays.shift();
    };

    function compare(id: string, html: ChatInfo, chat: ChzzkSocketChat) {
        done.add(id);
        const sock = toChatInfo(chat, opts.verifiedBadgeUrl);
        const report = (field: ShadowField, h: unknown, s: unknown) => {
            stats.mismatched[field]++;
            opts.onMismatch({ id, field, html: h, socket: s, type: chat.type, status: chat.status });
        };
        let ok = true;

        // 익명 후원은 host가 "익명의 후원자"를 그리고 소켓엔 닉네임이 없다 — 비교 대상 아님.
        // html 쪽이 닉네임을 못 뽑은 건(unavailable) selector 문제지 소켓 문제가 아니다.
        if (!chat.anonymous && !html.unavailable?.includes('name') && html.nickName !== sock.nickName) {
            report('name', html.nickName, sock.nickName); ok = false;
        }

        const hb = new Set(html.badges);
        const sb = new Set(sock.badges);
        const missing = [...hb].filter(b => !sb.has(b));
        const extra = [...sb].filter(b => !hb.has(b));
        if (missing.length || extra.length) {
            report('badges', { onlyInHtml: missing }, { onlyInSocket: extra }); ok = false;
        }

        // 클린봇/블라인드 채팅은 host가 본문 대신 안내 문구를 그리므로 텍스트 비교 제외.
        if (chat.status === 'NORMAL') {
            const ht = normText(html.textContents);
            const st = normText(sock.textContents);
            if (ht !== st) { report('text', ht, st); ok = false; }
        }

        const hv = opts.predicate(html).pass;
        const sv = opts.predicate(sock).pass;
        if (hv !== sv) { report('verdict', hv, sv); ok = false; }

        if (ok) stats.matched++;
    }

    function onSocketChats(chats: ChzzkSocketChat[]) {
        const t = now();
        for (const chat of chats) {
            if (done.has(chat.id) || socketWaiting.has(chat.id)) continue;
            const html = htmlWaiting.get(chat.id);
            if (html) { htmlWaiting.delete(chat.id); recordDelay(0); compare(chat.id, html.info, chat); }
            else socketWaiting.set(chat.id, { chat, at: t });
        }
    }

    function onHtmlChat(hostKey: string, info: ChatInfo) {
        const id = socketIdFromHostKey(hostKey);
        if (!id || done.has(id) || htmlWaiting.has(id)) return;
        const sock = socketWaiting.get(id);
        if (sock) { socketWaiting.delete(id); recordDelay(now() - sock.at); compare(id, info, sock.chat); }
        else htmlWaiting.set(id, { info, at: now() });
    }

    /** 만료된 짝 없는 채팅을 집계하고 현재 통계를 돌려준다. */
    function sweep(): ShadowStats {
        const t = now();
        for (const [id, { chat, at }] of socketWaiting) {
            if (t - at < timeout) continue;
            socketWaiting.delete(id);
            done.add(id);
            const k = `type ${chat.type}${chat.status !== 'NORMAL' ? ` ${chat.status}` : ''}`;
            stats.socketOnly[k] = (stats.socketOnly[k] ?? 0) + 1;
        }
        for (const [id, { at }] of htmlWaiting) {
            if (t - at < timeout) continue;
            htmlWaiting.delete(id);
            done.add(id);
            const chatTime = Number(id.slice(id.lastIndexOf('_') + 1));
            if (chatTime < startedAt) { stats.htmlOnlyBeforeStart++; continue; }
            stats.htmlOnly++;
            if (stats.htmlOnlySamples.length < 10) stats.htmlOnlySamples.push(id);
        }
        stats.pending = socketWaiting.size + htmlWaiting.size;
        if (delays.length) {
            const sorted = [...delays].sort((a, b) => a - b);
            const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
            stats.renderDelay = { count: sorted.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: sorted[sorted.length - 1] };
        }
        return {
            ...stats,
            mismatched: { ...stats.mismatched },
            socketOnly: { ...stats.socketOnly },
            htmlOnlySamples: [...stats.htmlOnlySamples],
            renderDelay: { ...stats.renderDelay },
        };
    }

    return { onSocketChats, onHtmlChat, sweep };
}

// ----- 브라우저 연결 (ISOLATED) ---------------------------------------------

const SHADOW_FLAG = 'tbc:socket-shadow';
const SWEEP_INTERVAL_MS = 30000;
const DETAILED_MISMATCH_LOGS = 50;

/** dev 빌드이거나, 콘솔에서 `localStorage.setItem('tbc:socket-shadow', '1')` 해둔 경우. */
export function isSocketShadowEnabled(): boolean {
    if (import.meta.env.DEV) return true;
    try { return localStorage.getItem(SHADOW_FLAG) === '1'; } catch { return false; }
}

/**
 * ws-tap(MAIN)이 보내는 소켓 채팅과 inject(MAIN)가 보내는 html 채팅을 둘 다 듣고 비교한다.
 * 화면 동작에는 관여하지 않는다 — 콘솔 로그만 남긴다.
 *
 * @param extract HTML 경로의 추출기 (ChzzkAdapter.extract). 기존 경로와 같은 결과를 봐야 한다.
 * @returns 정리 함수
 */
export function startChzzkSocketShadow(
    extract: (node: Node) => ChatInfo | undefined,
    predicate: (chat: ChatInfo) => { pass: boolean },
    verifiedBadgeUrl?: string,
): () => void {
    const tag = '%c[TBC shadow]';
    const style = 'color:#00c896;font-weight:bold';
    let mismatchLogs = 0;

    const shadow = createSocketShadow({
        predicate,
        verifiedBadgeUrl,
        onMismatch: (m) => {
            mismatchLogs++;
            if (mismatchLogs <= DETAILED_MISMATCH_LOGS) {
                // 값을 본문에 바로 찍는다 — 객체만 남기면 펼쳐서 복사해야 해서 공유가 번거롭다.
                console.warn(
                    `${tag}%c ${m.field} 불일치 (type ${m.type} ${m.status}) ${m.id}\n  html:   ${JSON.stringify(m.html)}\n  socket: ${JSON.stringify(m.socket)}`,
                    style, '',
                );
            } else if (mismatchLogs === DETAILED_MISMATCH_LOGS + 1) {
                console.warn(`${tag}%c 불일치 상세 로그는 ${DETAILED_MISMATCH_LOGS}건까지만 — 이후는 요약에서 집계`, style, '');
            }
        },
    });

    const onMessage = (e: MessageEvent) => {
        if (e.source !== window) return;
        const d = e.data;
        if (d?.action === TBC_SOCKET_CHAT_ACTION) {
            const msg = d as TbcSocketChatMessage;
            if (msg.kind === 'connected') console.info(`${tag}%c 채팅 소켓 연결 (${msg.cid})`, style, '');
            else if (msg.kind === 'chats') shadow.onSocketChats(msg.chats);
            return;
        }
        if (d?.action === TBC_CHAT_PASSED_ACTION) {
            const msg = d as TbcChatPassedMessage;
            if (!msg.key || !msg.html) return;
            const tmpl = document.createElement('template');
            tmpl.innerHTML = msg.html;
            const el = tmpl.content.firstElementChild as HTMLElement | null;
            // 다시보기 채팅은 소켓이 없다 (REST) — 비교 대상 아님.
            if (!el || el.hasAttribute(CHAT_ATTR.REPLAY_CHAT)) return;
            // extract는 부모 id로 채팅 목록 안의 노드인지 확인한다 (useChatStream과 동일 처리).
            const wrapper = document.createElement('div');
            wrapper.id = 'tbc-chzzk-chat-list-wrapper';
            wrapper.appendChild(el);
            const info = extract(el);
            if (info) shadow.onHtmlChat(msg.key, info);
        }
    };

    const timer = setInterval(() => {
        const s = shadow.sweep();
        const mismatchTotal = Object.values(s.mismatched).reduce((a, b) => a + b, 0);
        const socketOnlyTotal = Object.values(s.socketOnly).reduce((a, b) => a + b, 0);
        console.info(
            `${tag}%c 일치 ${s.matched} / 불일치 ${mismatchTotal} / 소켓만 ${socketOnlyTotal} / html만 ${s.htmlOnly} (시작 전 ${s.htmlOnlyBeforeStart}) / 대기 ${s.pending}` +
            ` | 원본 지연 p50 ${s.renderDelay.p50}ms p95 ${s.renderDelay.p95}ms p99 ${s.renderDelay.p99}ms max ${s.renderDelay.max}ms (n=${s.renderDelay.count})`,
            style, '',
            { mismatched: s.mismatched, socketOnly: s.socketOnly, htmlOnlySamples: s.htmlOnlySamples },
        );
    }, SWEEP_INTERVAL_MS);

    window.addEventListener('message', onMessage);
    console.info(`${tag}%c 시작 — ${SWEEP_INTERVAL_MS / 1000}초마다 요약`, style, '');
    return () => {
        window.removeEventListener('message', onMessage);
        clearInterval(timer);
    };
}
