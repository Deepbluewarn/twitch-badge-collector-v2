import { CHZZK_CMD, parseChzzkBlindEvent, parseChzzkPacket } from "@/platform/chzzk-socket";
import { isChannelOffNow } from '../base/channel-off-flag';
import { TBC_SOCKET_CHAT_ACTION, TBC_SOCKET_REPLAY_ACTION, TBC_SOCKET_REPLAY_REQUEST, TbcSocketChatMessage } from "@/interfaces/chat-attributes";

/**
 * 치지직 채팅 소켓 수동 탭 (MAIN world).
 *
 * 치지직은 메인 스레드에서 `new WebSocket('wss://kr-ssN.chat.naver.com/chat')`을 열고
 * `addEventListener('message')`로 JSON 텍스트를 받는다 (2026-10 vendor 번들 확인).
 * 생성자를 Proxy로 감싸 채팅 소켓에만 우리 listener를 하나 더 붙인다 — 연결을
 * 새로 만들지도, 메시지를 바꾸지도 않는다. host가 받는 것과 정확히 같은 패킷을 본다.
 *
 * 치지직이 소켓을 열기 전에 설치돼야 하므로 document_start MAIN 진입점에서
 * **동기로** 호출해야 한다 (dynamic import 뒤에 두면 늦을 수 있다).
 */

const CHAT_SOCKET_URL = /^wss:\/\/[^/]*\.chat\.naver\.com\/chat\b/;
const TAPPED = Symbol.for('tbc.chzzkSocketTap');

type Post = (msg: TbcSocketChatMessage) => void;

/** 다시 보내 줄 수 있게 기억해 두는 채팅 수 — 최근 채팅(50개)과 업데이트 빈틈을 넉넉히 덮는다 */
const REPLAY_CHATS = 1000;

/** 넘긴 메시지를 순서대로 기억한다. 채팅이 REPLAY_CHATS를 넘으면 오래된 메시지부터 버린다. */
export function createReplayLog(limit = REPLAY_CHATS) {
    const log: TbcSocketChatMessage[] = [];
    let chats = 0;
    return {
        remember(msg: TbcSocketChatMessage) {
            log.push(msg);
            if (msg.kind === 'chats') chats += msg.chats.length;
            while (chats > limit && log.length > 1) {
                const old = log.shift()!;
                if (old.kind === 'chats') chats -= old.chats.length;
            }
        },
        messages: () => log.slice(),
    };
}

const replayLog = createReplayLog();

// 꺼진 채널에서는 아무것도 넘기지 않는다 (탭 자체는 페이지가 소켓을 열기 전에 걸어야 해서 그대로 둔다)
const defaultPost: Post = (msg) => {
    if (isChannelOffNow()) return;
    window.postMessage(msg, '*');
    replayLog.remember(msg);
};

/** 보관함이 다시 달라고 하면(TBC_SOCKET_REPLAY_REQUEST) 기억한 메시지를 REPLAY로 다시 보낸다. */
export function installChzzkSocketReplay() {
    window.addEventListener('message', e => {
        if (e.source !== window || e.data?.action !== TBC_SOCKET_REPLAY_REQUEST || isChannelOffNow()) return;
        for (const msg of replayLog.messages()) window.postMessage({ ...msg, action: TBC_SOCKET_REPLAY_ACTION }, '*');
    });
}

function attach(ws: WebSocket, post: Post) {
    ws.addEventListener('message', (e: MessageEvent) => {
        // 탭이 host 소켓 처리에 영향을 주면 안 된다 — 어떤 예외도 밖으로 내보내지 않는다.
        try {
            if (typeof e.data !== 'string') return;
            const packet = JSON.parse(e.data);
            if (packet?.cmd === CHZZK_CMD.CONNECTED) {
                post({ action: TBC_SOCKET_CHAT_ACTION, kind: 'connected', cid: String(packet.cid ?? '') });
                return;
            }
            if (packet?.cmd === CHZZK_CMD.BLIND) {
                const event = parseChzzkBlindEvent(packet);
                if (event) post({ action: TBC_SOCKET_CHAT_ACTION, kind: 'blind', event });
                return;
            }
            const chats = parseChzzkPacket(packet);
            if (chats.length === 0) return;
            post({
                action: TBC_SOCKET_CHAT_ACTION,
                kind: 'chats',
                recent: packet.cmd === CHZZK_CMD.RECENT_CHAT,
                chats,
            });
        } catch { /* 깨진 패킷은 무시 */ }
    });
}

/** @returns 이번 호출로 새로 설치했으면 true (이미 설치돼 있으면 false). */
export function installChzzkSocketTap(target: { WebSocket: typeof WebSocket } = window, post: Post = defaultPost): boolean {
    const Orig = target.WebSocket;
    if (!Orig || (Orig as any)[TAPPED]) return false;

    const Tapped = new Proxy(Orig, {
        construct(t, args, newTarget) {
            // 직접 `new WebSocket()`이면 원본으로, 누가 상속했다면 그 클래스로 생성.
            const ws = Reflect.construct(t, args, newTarget === Tapped ? t : newTarget) as WebSocket;
            try {
                if (CHAT_SOCKET_URL.test(String(args[0]))) attach(ws, post);
            } catch { /* never break host */ }
            return ws;
        },
        get(t, prop, receiver) {
            if (prop === TAPPED) return true;
            return Reflect.get(t, prop, receiver);
        },
    });

    target.WebSocket = Tapped;
    return true;
}
