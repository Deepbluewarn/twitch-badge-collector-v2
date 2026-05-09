import React, { useCallback, useState } from "react";
import { PlatformAdapter } from "@/platform";
import { convertToJSX } from "@/utils/converter";
import { PassedChat } from "./useChatStream";

interface ChatWrapperProps {
    time: number;
    children?: React.ReactNode;
}

function ChatWrapper(props: ChatWrapperProps) {
    return <>{props.children}</>;
}

/**
 * Container에 표시되는 채팅 *배열*의 상태 관리.
 *
 * 책임: dedupe(같은 key는 무시) + 정렬(adapter.chatOrder) + 트림(maxChats 초과 시
 * 오래된 쪽부터 잘라냄). DOM/MutationObserver와 무관해 단위 테스트 가능.
 */
export default function useFilteredChatBuffer(adapter: PlatformAdapter, maxChats: number) {
    const [chats, setChats] = useState<React.ReactElement<ChatWrapperProps>[]>([]);

    const addChat = useCallback(({ clone, key, time }: PassedChat) => {
        setChats(prev => {
            if (prev.some(e => e.key === key)) return prev;

            const next = [...prev, React.createElement(
                ChatWrapper,
                { key, time },
                convertToJSX(clone),
            )];

            next.sort((a, b) => {
                if (!a || !b) return 0;
                return adapter.chatOrder === 'newest-top'
                    ? b.props.time - a.props.time
                    : a.props.time - b.props.time;
            });

            if (next.length >= maxChats) {
                // newest-top이면 오래된 게 끝, newest-bottom이면 오래된 게 시작.
                const trimFromEnd = adapter.chatOrder === 'newest-top';
                const overflow = next.length - maxChats;
                if (trimFromEnd) {
                    next.splice(next.length - 1, overflow);
                } else {
                    next.splice(0, overflow);
                }
            }

            return next;
        });
    }, [adapter, maxChats]);

    const clear = useCallback(() => setChats([]), []);

    return { chats, addChat, clear };
}
