import { useEffect } from "react";
import { ChatInfo } from "@/interfaces/chat";
import { PlatformAdapter } from "@/platform";
import { Observer } from "@/content-scripts/base/observer";
import { generateRandomString } from "@/utils/utils-common";

export interface PassedChat {
    /** 후처리 완료된 복제 노드 (DOM 삽입 직전 상태) */
    clone: HTMLElement;
    /** 중복 제거용 안정 키 — inject가 박은 data-tbc-chat-key, 없으면 fallback */
    key: string;
    /** 채팅 발생 시각 (ms epoch 또는 replay 상대 시간) */
    time: number;
}

/**
 * Host page 채팅 스트림 → Filter Group 통과한 항목만 emit.
 *
 * MutationObserver로 `#tbc-${type}-chat-list-wrapper` 자식 변화를 감시.
 * 새 노드마다: adapter.extract → predicate(filter 평가) → 통과 시 clone +
 * adapter.prepareChatClone → onChatPassed 호출.
 *
 * Container 삽입(상태 관리 + JSX)은 호출자(useFilteredChatBuffer)가 담당.
 */
export default function useChatStream(
    adapter: PlatformAdapter,
    predicate: (chat: ChatInfo) => boolean,
    onChatPassed: (chat: PassedChat) => void,
) {
    useEffect(() => {
        const observer = new Observer(`#tbc-${adapter.type}-chat-list-wrapper`, false);

        observer.observe((_elem, mr) => {
            if (!mr) return;
            for (const record of mr) {
                record.addedNodes.forEach((node) => {
                    const chat = adapter.extract(node);
                    if (!chat) return;
                    if (!predicate(chat)) return;

                    const original = node as HTMLElement;
                    if (original.classList.contains('tbcv2-highlight')) return;
                    original.classList.add('tbcv2-highlight');

                    const clone = node.cloneNode(true) as HTMLElement;
                    adapter.prepareChatClone(clone);

                    const key = clone.getAttribute('data-tbc-chat-key')
                        ?? `${new Date().getTime()}${generateRandomString(8)}`;
                    const time = parseInt(clone.getAttribute('data-tbc-chat-time') ?? '0', 10);

                    onChatPassed({ clone, key, time });
                });
            }
        });
        // Observer는 disconnect 메서드가 없으므로 unmount cleanup 없음 (기존 동작 보존).
    }, []);
}
