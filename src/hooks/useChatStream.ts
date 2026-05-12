import { useEffect } from "react";
import { ChatInfo } from "@/interfaces/chat";
import { PlatformAdapter } from "@/platform";
import {
    CHAT_ATTR,
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
export default function useChatStream(
    adapter: PlatformAdapter,
    predicate: (chat: ChatInfo) => boolean,
    onChatPassed: (chat: PassedChat) => void,
) {
    useEffect(() => {
        // 같은 key는 한 번만 처리.
        const seenKeys = new Set<string>();

        // 공통 처리 — element 받아서 adapter 통과 + onChatPassed 호출.
        // detached element도 OK (extract의 parent check를 위해 임시 wrapper에 attach).
        function processElement(element: HTMLElement, key: string, time: number, prevKey: string | null) {
            if (seenKeys.has(key)) return;

            // adapter.extract이 parentElement.id 체크 — detached element면 임시 wrapper attach.
            if (element.parentElement?.id !== `tbc-${adapter.type}-chat-list-wrapper`) {
                const tempWrapper = document.createElement('div');
                tempWrapper.id = `tbc-${adapter.type}-chat-list-wrapper`;
                tempWrapper.appendChild(element);
            }

            const chat = adapter.extract(element);
            if (!chat) return;
            if (!predicate(chat)) return;

            adapter.prepareChatClone(element);
            seenKeys.add(key);

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

        // Phase 2: 향후 inject.ts가 발행할 메시지 listen.
        function handleMessage(e: MessageEvent) {
            if (e.source !== window) return;
            const msg = e.data as TbcChatPassedMessage | undefined;
            if (msg?.action !== TBC_CHAT_PASSED_ACTION) return;
            if (!msg.key) return;
            if (seenKeys.has(msg.key)) return;

            // inject.ts가 보낸 outerHTML 파싱 (host DOM은 virtual window로 unmount 가능).
            const tmpl = document.createElement('template');
            tmpl.innerHTML = msg.html;
            const original = tmpl.content.firstElementChild as HTMLElement | null;
            if (!original) return;

            processElement(original, msg.key, msg.time, msg.prevKey);
        }

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);
}
