import { useEffect } from "react";
import { ChatInfo } from "@/interfaces/chat";
import { PlatformAdapter } from "@/platform";
import {
    CHAT_ATTR,
    PROCESSED_CHAT_CLASS,
    TBC_CHAT_PASSED_ACTION,
    TbcChatPassedMessage,
} from "@/interfaces/chat-attributes";
import { isSocketShadowEnabled, socketIdFromHostKey, startChzzkSocketShadow } from "@/content-scripts/chzzk/socket-shadow";
import { isSocketRenderEnabled } from "@/content-scripts/chzzk/socket-mode";
import { TBC_SOCKET_CHAT_ACTION, TbcSocketChatMessage } from "@/interfaces/chat-attributes";
import { applyBlindEvent, toChatInfo, type ChzzkSocketChat } from "@/platform/chzzk-socket";
import { renderChzzkChat } from "@/render/chzzk-render";
import { getPlatformConfig } from "@/platform/host-selectors";

export interface PassedChat {
    /** 후처리 완료된 복제 노드 (DOM 삽입 직전 상태) */
    clone: HTMLElement;
    /** 중복 제거용 안정 키 — inject가 박은 CHAT_ATTR.KEY */
    key: string;
    /** 채팅 발생 시각 (ms epoch 또는 replay 상대 시간) */
    time: number;
    /** host DOM 안에서 이 chat 직전 chat의 key. null이면 host DOM 맨 앞. buffer 삽입 위치 결정용. */
    prevKey: string | null;
    /** bar preview 등 파생 뷰용 — buffer 안에서 latest 재emit 위해 함께 전달. */
    nickname: string;
    text: string;
}

/**
 * Host page 채팅 스트림 → Filter Group 통과한 항목만 emit.
 *
 * 동작:
 *  - 직접 MO를 돌리지 않음 (MAIN/ISOLATED race를 피하기 위해).
 *  - inject.ts(MAIN)가 host DOM mutation을 처리한 뒤 key/time/prevKey/html을
 *    window.postMessage로 송신. 우리는 그 메시지를 listen.
 *  - 메시지의 html을 파싱해서 detached element 생성 (host DOM은 chzzk의 virtual
 *    window로 unmount될 수 있어 신뢰 불가). 임시 wrapper에 attach해 extract 통과 →
 *    predicate → 통과 시 prepareChatClone → onChatPassed.
 *
 * Container 삽입(상태 관리 + JSX)은 호출자(useFilteredChatBuffer)가 담당.
 */
export interface ChatPredicateResult {
    pass: boolean;
    /** marker on이면 highlight 색. 없으면 highlight 자체 안 함. */
    markerColor?: string;
}

export default function useChatStream(
    adapter: PlatformAdapter,
    predicate: (chat: ChatInfo) => ChatPredicateResult,
    onChatPassed: (chat: PassedChat) => void,
    /** 소켓 모드 전용 — 이미 넘긴 채팅의 내용이 바뀜 (나중에 블라인드/해제). */
    onChatUpdated?: (update: { key: string; clone: HTMLElement; text: string }) => void,
) {
    useEffect(() => {
        // 같은 key는 한 번만 처리 (extract/predicate/addChat).
        const seenKeys = new Set<string>();
        // 처리 시점에 결정된 marker 색을 key별 캐시.
        // chzzk가 virtual scroll로 chat element를 destroy/recreate하면 우리 class가
        // 사라지므로 재출현 시 캐시된 색으로 다시 부여 — 추출/필터는 재실행 X.
        const processedColors = new Map<string, string | undefined>();

        function applyHighlight(key: string, color: string | undefined) {
            if (!color) return;
            try {
                const all = document.querySelectorAll(`[${CHAT_ATTR.KEY}="${CSS.escape(key)}"]`);
                all.forEach(orig => {
                    if (orig.closest(`#tbc-clone__${adapter.type}ui`)) return;
                    (orig as HTMLElement).style.setProperty('--tbc-marker-color', color);
                    orig.classList.add(PROCESSED_CHAT_CLASS);
                });
            } catch { /* CSS.escape 미지원 등 */ }
        }

        // 공통 처리 — element 받아서 adapter 통과 + onChatPassed 호출.
        // detached element도 OK (extract의 parent check를 위해 임시 wrapper에 attach).
        function processElement(element: HTMLElement, key: string, time: number, prevKey: string | null) {
            if (seenKeys.has(key)) {
                // virtual scroll 재출현 케이스 — adapter/filter 재실행 없이 highlight만 재적용.
                applyHighlight(key, processedColors.get(key));
                return;
            }

            // adapter.extract이 parentElement.id 체크 — detached element면 임시 wrapper attach.
            if (element.parentElement?.id !== `tbc-${adapter.type}-chat-list-wrapper`) {
                const tempWrapper = document.createElement('div');
                tempWrapper.id = `tbc-${adapter.type}-chat-list-wrapper`;
                tempWrapper.appendChild(element);
            }

            const chat = adapter.extract(element);
            if (!chat) return;
            const result = predicate(chat);
            if (!result.pass) return;

            adapter.prepareChatClone(element);
            seenKeys.add(key);
            processedColors.set(key, result.markerColor);

            // 원본 호스트 DOM에 highlight 클래스 부여 — 사용자가 채팅창에서 "수집됐구나"
            // 시각 확인. CSS는 content style.css의 `.tbcv2-highlight`, 색은 CSS 변수 override.
            applyHighlight(key, result.markerColor);

            // bar preview event는 useFilteredChatBuffer.addChat/loadPersisted에서 emit —
            // 팝오버 목록과 완전 같은 진입점 = 두 뷰 어긋날 여지 없음 (persistence 복원 포함).
            const nickname = chat.nickName;
            const text = chat.textContents.filter(Boolean).join(' ').trim();
            onChatPassed({ clone: element, key, time, prevKey, nickname, text });
        }

        // Phase 1: mount 시점에 이미 chzzk DOM에 있는 chats를 retroactive 스캔.
        // inject.ts(MAIN, document_start)는 우리 component(ISOLATED, mount 시점)보다 먼저 실행됨.
        // mount 전에 발행된 postMessage는 listener 부재로 유실. chzzk가 mount 시점에 chat을
        // DOM에 가지고 있다면 직접 스캔해서 buffer에 채움. 이때 inject.ts가 박아둔 CHAT_ATTR.KEY와
        // 직전 sibling의 KEY로 prevKey도 추출 가능.
        const wrapper = document.getElementById(`tbc-${adapter.type}-chat-list-wrapper`);
        if (wrapper) {
            const chatNodes = Array.from(wrapper.querySelectorAll<HTMLElement>(`[${CHAT_ATTR.KEY}]`))
                .filter(el => el.parentElement === wrapper); // 직접 자식만
            chatNodes.forEach((el) => {
                const key = el.getAttribute(CHAT_ATTR.KEY) ?? '';
                if (!key) return;
                const time = parseInt(el.getAttribute(CHAT_ATTR.TIME) ?? '0', 10);
                let prev = el.previousElementSibling;
                while (prev && !prev.getAttribute(CHAT_ATTR.KEY)) {
                    prev = prev.previousElementSibling;
                }
                const prevKey = prev?.getAttribute(CHAT_ATTR.KEY) ?? null;
                // host DOM의 element를 clone — 원본은 그대로 두고 처리.
                const clone = el.cloneNode(true) as HTMLElement;
                processElement(clone, key, time, prevKey);
            });
        }

        // Phase 1b: chzzk(React)가 chat element를 reconcile하면서 우리 PROCESSED_CHAT_CLASS를
        // 떼어내는 경우 대응. 가상 스크롤로 가려졌던 채팅이 다시 보일 때 자주 발생.
        // wrapper subtree의 class 속성 변경을 감시 → 우리 class 빠진 key 매칭 element엔
        // 캐시 색으로 재부여. classList.contains 체크로 무한 루프 차단.
        let attrMo: MutationObserver | null = null;
        if (wrapper) {
            attrMo = new MutationObserver((records) => {
                for (const r of records) {
                    if (r.attributeName !== 'class') continue;
                    const target = r.target as HTMLElement;
                    if (!target.getAttribute) continue;
                    const hostKey = target.getAttribute(CHAT_ATTR.KEY);
                    if (!hostKey) continue;
                    // 소켓 모드에선 색이 소켓 id(uid_time)로 저장돼 있다 — host key 앞부분.
                    const key = processedColors.has(hostKey) ? hostKey : socketIdFromHostKey(hostKey);
                    if (!key || !processedColors.has(key)) continue;
                    if (target.classList.contains(PROCESSED_CHAT_CLASS)) continue;
                    const color = processedColors.get(key);
                    if (!color) continue;
                    target.style.setProperty('--tbc-marker-color', color);
                    target.classList.add(PROCESSED_CHAT_CLASS);
                }
            });
            attrMo.observe(wrapper, { attributes: true, attributeFilter: ['class'], subtree: true });
        }

        // Phase 2: 향후 inject.ts가 발행할 메시지 listen.
        // seenKeys 체크는 processElement 내부에서 — virtual scroll로 재출현한 chat은
        // 거기서 applyHighlight만 재호출함. handleMessage에서 short-circuit하면 그 경로 dead.
        // 소켓 모드 (chzzk 라이브) — 채팅 소켓 탭이 살아 있으면 HTML 대신 소켓 채팅을 필터하고
        // 템플릿 렌더러로 그린다. 탭 신호가 한 번도 안 오면 socketActive가 false로 남아
        // 아래 HTML 경로가 그대로 동작한다 (자동 fallback).
        const socketMode = adapter.type === 'chzzk' && isSocketRenderEnabled();
        const verifiedIconUrl = getPlatformConfig('chzzk').constants?.verifiedBadgeImageUrl as string | undefined;
        let socketActive = false;
        // 넘긴 채팅의 원본 — 나중에 블라인드 이벤트가 오면 상태만 바꿔 다시 그린다.
        // 오래된 것부터 버린다: 블라인드는 대개 올라온 직후에 오고, Container도 maxChats로 잘린다.
        const passedSocketChats = new Map<string, ChzzkSocketChat>();
        const PASSED_SOCKET_CHAT_LIMIT = 3000;

        const previewText = (chat: ChzzkSocketChat) =>
            chat.status === 'NORMAL' ? toChatInfo(chat).textContents.join(' ').trim() : '';

        // 표시: 필터를 통과한 소켓 채팅의 host 원본을 기다렸다가 복제한다 (원본 우선).
        // 원본은 소켓보다 늦게 그려진다(실측 p50 ~0.4초, p95 ~1.1초, max ~2.1초) — 이건 기존
        // HTML 경로도 똑같이 겪던 지연이다. NATIVE_WAIT_MS 안에 안 오면 일단 직접 그리고,
        // 원본이 그 뒤에 오면 원본으로 교체한다(원본 우선). 대기를 p95 근처로 잡아 교체되는
        // 채팅은 ~5%. 원본이 끝내 안 그려지는 경우(채팅창 접힘 등)는 직접 그린 그대로 남는다.
        const NATIVE_WAIT_MS = 1200;
        // 직접 그린 뒤 원본이 오면 교체해 주는 기한. 이보다 늦은 원본은 무시한다 — 한참 지난
        // 채팅의 모양이 갑자기 바뀌는 건 교체 이득보다 어색함이 크다.
        const LATE_NATIVE_SWAP_MS = 10000;
        const pendingNative = new Map<string, { chat: ChzzkSocketChat; timer: ReturnType<typeof setTimeout> }>();
        const builtAwaitingNative = new Map<string, number>();
        // 드물게 원본이 소켓보다 먼저 온다(shadow 실측 0ms 짝). 그때를 위해 최근 원본을 잠깐 기억.
        const recentHostHtml = new Map<string, string>();
        const RECENT_HOST_HTML_LIMIT = 300;

        function passedChatOf(chat: ChzzkSocketChat, clone: HTMLElement): PassedChat {
            return {
                clone,
                key: chat.id,
                time: chat.time,
                // 소켓 채팅엔 host DOM 형제가 없다. buffer에 없는 key를 주면 시각 기준
                // 위치 추정으로 들어간다 — 소켓 시각은 서버 시각이라 정확하다.
                prevKey: '',
                nickname: toChatInfo(chat).nickName,
                text: previewText(chat),
            };
        }

        function emitBuilt(chat: ChzzkSocketChat) {
            onChatPassed(passedChatOf(chat, renderChzzkChat(chat, { verifiedIconUrl })));
        }

        /** host 원본 html을 복제해 넘긴다. 파싱에 실패하면 false — 호출자가 직접 그린다. */
        function emitNative(chat: ChzzkSocketChat, html: string): boolean {
            const tmpl = document.createElement('template');
            tmpl.innerHTML = html;
            const el = tmpl.content.firstElementChild as HTMLElement | null;
            if (!el) return false;
            adapter.prepareChatClone(el);
            onChatPassed(passedChatOf(chat, el));
            return true;
        }

        function resolvePending(id: string, html: string | null) {
            const p = pendingNative.get(id);
            if (!p) return;
            clearTimeout(p.timer);
            pendingNative.delete(id);
            if (html && emitNative(p.chat, html)) return;
            emitBuilt(p.chat);
            builtAwaitingNative.set(id, Date.now());
            if (builtAwaitingNative.size > RECENT_HOST_HTML_LIMIT) {
                builtAwaitingNative.delete(builtAwaitingNative.keys().next().value!);
            }
        }

        /** 직접 그려 넣은 채팅의 원본이 늦게 왔으면 원본으로 교체. 교체했으면 true. */
        function swapToNative(id: string, html: string): boolean {
            const at = builtAwaitingNative.get(id);
            if (at === undefined) return false;
            builtAwaitingNative.delete(id);
            const chat = passedSocketChats.get(id);
            // 그사이 블라인드됐으면 원본(블라인드 전 모습일 수 있음)으로 바꾸지 않는다.
            if (!chat || chat.status !== 'NORMAL' || Date.now() - at > LATE_NATIVE_SWAP_MS) return true;
            const tmpl = document.createElement('template');
            tmpl.innerHTML = html;
            const el = tmpl.content.firstElementChild as HTMLElement | null;
            if (!el) return true;
            adapter.prepareChatClone(el);
            onChatUpdated?.({ key: id, clone: el, text: previewText(chat) });
            return true;
        }

        function processSocketMessage(msg: TbcSocketChatMessage) {
            socketActive = true;
            if (msg.kind === 'blind') {
                const prev = passedSocketChats.get(msg.event.id);
                if (!prev) return;
                // 필터 판정은 원문 기준으로 정했으므로 다시 하지 않는다 — 표시만 바꾼다.
                const next = applyBlindEvent(prev, msg.event);
                passedSocketChats.set(next.id, next);
                builtAwaitingNative.delete(next.id);
                const pending = pendingNative.get(next.id);
                if (pending) {
                    // 아직 원본을 기다리는 중 — 기다리던 원본은 블라인드 전 모습일 수 있으니 바로 직접 그린다.
                    clearTimeout(pending.timer);
                    pendingNative.delete(next.id);
                    emitBuilt(next);
                    return;
                }
                // native로 넣었던 채팅도 블라인드되면 직접 그린 모양으로 바뀐다 (원본 복제본은 스냅샷이라).
                onChatUpdated?.({ key: next.id, clone: renderChzzkChat(next, { verifiedIconUrl }), text: previewText(next) });
                return;
            }
            if (msg.kind !== 'chats') return;
            for (const chat of msg.chats) {
                if (seenKeys.has(chat.id)) continue;
                seenKeys.add(chat.id);
                const info = toChatInfo(chat, verifiedIconUrl);
                const result = predicate(info);
                if (!result.pass) continue;
                processedColors.set(chat.id, result.markerColor);
                passedSocketChats.set(chat.id, chat);
                if (passedSocketChats.size > PASSED_SOCKET_CHAT_LIMIT) {
                    passedSocketChats.delete(passedSocketChats.keys().next().value!);
                }
                const early = recentHostHtml.get(chat.id);
                if (early !== undefined && emitNative(chat, early)) continue;
                const id = chat.id;
                pendingNative.set(id, { chat, timer: setTimeout(() => resolvePending(id, null), NATIVE_WAIT_MS) });
            }
        }

        function handleMessage(e: MessageEvent) {
            if (e.source !== window) return;
            if (socketMode && e.data?.action === TBC_SOCKET_CHAT_ACTION) {
                processSocketMessage(e.data as TbcSocketChatMessage);
                return;
            }
            const msg = e.data as TbcChatPassedMessage | undefined;
            if (msg?.action !== TBC_CHAT_PASSED_ACTION) return;
            if (!msg.key) return;

            // 소켓 모드가 동작 중이면 라이브 HTML 채팅은 수집하지 않는다 — 원본 채팅창
            // highlight만 붙인다 (소켓 채팅이 host DOM보다 먼저 와서 그때는 요소가 없다).
            // 다시보기는 소켓이 없으므로 HTML 경로 그대로.
            if (socketActive && !msg.html.includes(CHAT_ATTR.REPLAY_CHAT)) {
                const id = socketIdFromHostKey(msg.key);
                if (!id) return;
                if (pendingNative.has(id)) {
                    resolvePending(id, msg.html);
                } else if (swapToNative(id, msg.html)) {
                    // 직접 그렸던 채팅을 원본으로 교체함
                } else if (!seenKeys.has(id)) {
                    recentHostHtml.set(id, msg.html);
                    if (recentHostHtml.size > RECENT_HOST_HTML_LIMIT) {
                        recentHostHtml.delete(recentHostHtml.keys().next().value!);
                    }
                }
                applyHighlight(msg.key, processedColors.get(id));
                return;
            }

            // inject.ts가 보낸 outerHTML 파싱 (host DOM은 virtual window로 unmount 가능).
            const tmpl = document.createElement('template');
            tmpl.innerHTML = msg.html;
            const original = tmpl.content.firstElementChild as HTMLElement | null;
            if (!original) return;

            processElement(original, msg.key, msg.time, msg.prevKey);
        }

        window.addEventListener('message', handleMessage);

        // 소켓 경로 검증용 — 화면에는 영향 없이 같은 채팅을 소켓으로도 처리해 비교 로그만 남긴다.
        const stopShadow = adapter.type === 'chzzk' && isSocketShadowEnabled()
            ? startChzzkSocketShadow(
                node => adapter.extract(node),
                chat => predicate(chat),
                verifiedIconUrl,
            )
            : undefined;

        return () => {
            window.removeEventListener('message', handleMessage);
            attrMo?.disconnect();
            stopShadow?.();
            pendingNative.forEach(p => clearTimeout(p.timer));
        };
    }, []);
}
