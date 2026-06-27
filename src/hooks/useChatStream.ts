import { useEffect } from "react";
import { ChatInfo } from "@/interfaces/chat";
import { PlatformAdapter } from "@/platform";
import {
    CHAT_ATTR,
    PROCESSED_CHAT_CLASS,
    TBC_CHAT_PASSED_ACTION,
    TbcChatPassedMessage,
} from "@/interfaces/chat-attributes";

export interface PassedChat {
    /** 후처리 완료된 복제 노드 (DOM 삽입 직전 상태) */
    clone: HTMLElement;
    /** 중복 제거용 안정 키 — inject가 박은 CHAT_ATTR.KEY */
    key: string;
    /** 채팅 발생 시각 (ms epoch 또는 replay 상대 시간) */
    time: number;
    /** host DOM 안에서 이 chat 직전 chat의 key. null이면 host DOM 맨 앞. buffer 삽입 위치 결정용. */
    prevKey: string | null;
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

            // 필터 통과한 chat 이벤트 broadcast — floating bar의 "최신 수집 채팅" preview에
            // 사용. inject postMessage(모든 chat)와 달리 *필터 통과한 것만* 발행.
            // time 포함 — 가상 스크롤 등으로 과거 chat이 늦게 도착해도 구독자가 시간 비교로
            // 진짜 최신만 채택 가능.
            window.dispatchEvent(new CustomEvent('tbc-filtered-chat', {
                detail: {
                    key,
                    time,
                    nickname: chat.nickName,
                    text: chat.textContents.filter(Boolean).join(' ').trim(),
                },
            }));

            onChatPassed({ clone: element, key, time, prevKey });
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
                    const key = target.getAttribute(CHAT_ATTR.KEY);
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
        function handleMessage(e: MessageEvent) {
            if (e.source !== window) return;
            const msg = e.data as TbcChatPassedMessage | undefined;
            if (msg?.action !== TBC_CHAT_PASSED_ACTION) return;
            if (!msg.key) return;

            // inject.ts가 보낸 outerHTML 파싱 (host DOM은 virtual window로 unmount 가능).
            const tmpl = document.createElement('template');
            tmpl.innerHTML = msg.html;
            const original = tmpl.content.firstElementChild as HTMLElement | null;
            if (!original) return;

            processElement(original, msg.key, msg.time, msg.prevKey);
        }

        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
            attrMo?.disconnect();
        };
    }, []);
}
