import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { PlatformAdapter } from "@/platform";
import { convertToJSX } from "@/utils/converter";
import { PassedChat } from "./useChatStream";

interface ChatWrapperProps {
    time: number;
    restored?: boolean;
    children?: React.ReactNode;
}

/**
 * 새 채팅은 Fragment(호스트 페이지 레이아웃 영향 0).
 * 복원된 채팅은 div로 감싸 inline style로 시각 구분 (테스트용 — 안정화 후
 * 옵션화 또는 제거 결정).
 */
const RESTORED_CHAT_STYLE: React.CSSProperties = {
    backgroundColor: 'rgba(128, 128, 128, 0.15)',
};

function ChatWrapper(props: ChatWrapperProps) {
    if (props.restored) {
        return <div style={RESTORED_CHAT_STYLE}>{props.children}</div>;
    }
    return <>{props.children}</>;
}

/**
 * useFilteredChatBuffer가 보관/저장하는 단위.
 * html은 직렬화 가능한 채팅 노드 스냅샷 — DOMPurify로 sanitize 후 JSX로 환원.
 */
export interface SavedChat {
    key: string;
    time: number;
    html: string;
    restored: boolean;
}

interface PersistedPayload {
    version: 1;
    chats: Pick<SavedChat, 'key' | 'time' | 'html'>[];
}

const PERSIST_DEBOUNCE_MS = 500;
const EVICTION_DROP_RATIO = 0.1;

/**
 * 저장소에 저장. quota 초과 시 오래된 쪽부터 10%씩 drop하고 재시도.
 */
async function saveWithEviction(key: string, payload: PersistedPayload): Promise<void> {
    let attempt = payload;
    while (attempt.chats.length > 0) {
        try {
            await browser.storage.local.set({ [key]: attempt });
            return;
        } catch {
            const evictCount = Math.max(1, Math.floor(attempt.chats.length * EVICTION_DROP_RATIO));
            attempt = { ...attempt, chats: attempt.chats.slice(evictCount) };
        }
    }
}

async function loadPersisted(key: string): Promise<SavedChat[]> {
    const res = await browser.storage.local.get(key);
    const payload = res[key] as PersistedPayload | undefined;
    if (!payload || payload.version !== 1) return [];
    return payload.chats.map(c => ({ ...c, restored: true }));
}

/**
 * Container에 표시되는 채팅 *배열*의 상태 관리.
 *
 * 책임:
 *  - dedupe (같은 key 무시)
 *  - 정렬 (adapter.chatOrder)
 *  - 트림 (maxChats 초과 시 오래된 쪽부터)
 *  - 선택적 persistence: persistenceKey 주어지면 마운트 시 load,
 *    버퍼 변경 시 debounced save (quota 초과 시 오래된 채팅부터 evict).
 *
 * 정렬은 *현재 buffer 순서*를 그대로 보존. 시간 비교에 의존하지 않음 —
 * Chzzk live time이 도착 순서와 어긋나는 경우가 있어 신뢰 X.
 */
export default function useFilteredChatBuffer(
    adapter: PlatformAdapter,
    maxChats: number,
    persistenceKey?: string,
) {
    const [savedChats, setSavedChats] = useState<SavedChat[]>([]);
    const persistTimerRef = useRef<number | null>(null);
    const isHydratedRef = useRef(false);

    // 마운트 시: persistenceKey 있으면 storage에서 load + restored=true로 hydrate.
    useEffect(() => {
        if (!persistenceKey) {
            isHydratedRef.current = true;
            return;
        }
        let cancelled = false;
        loadPersisted(persistenceKey).then(loaded => {
            if (cancelled) return;
            const trimmed = loaded.length > maxChats
                ? loaded.slice(loaded.length - maxChats)
                : loaded;
            setSavedChats(trimmed);
            isHydratedRef.current = true;
        });
        return () => { cancelled = true; };
    }, [persistenceKey, maxChats]);

    // savedChats 변경 시: persistenceKey 있으면 debounced save.
    useEffect(() => {
        if (!persistenceKey || !isHydratedRef.current) return;
        if (persistTimerRef.current !== null) {
            window.clearTimeout(persistTimerRef.current);
        }
        persistTimerRef.current = window.setTimeout(() => {
            const payload: PersistedPayload = {
                version: 1,
                chats: savedChats.map(({ key, time, html }) => ({ key, time, html })),
            };
            void saveWithEviction(persistenceKey, payload);
        }, PERSIST_DEBOUNCE_MS);
        return () => {
            if (persistTimerRef.current !== null) {
                window.clearTimeout(persistTimerRef.current);
            }
        };
    }, [savedChats, persistenceKey]);

    const addChat = useCallback(({ clone, key, time }: PassedChat) => {
        setSavedChats(prev => {
            // dedupe: 같은 세션은 key로(Chzzk 내부 React key — 안정적),
            // cross-session backfill은 time으로(Chzzk 서버 timestamp — 같은 채팅엔
            // 같은 값, 다른 채팅엔 다른 값). 둘 중 하나라도 매치하면 중복.
            if (prev.some(c => c.key === key || c.time === time)) return prev;

            const next = [...prev, { key, time, html: clone.outerHTML, restored: false }];

            next.sort((a, b) => {
                return adapter.chatOrder === 'newest-top'
                    ? b.time - a.time
                    : a.time - b.time;
            });

            if (next.length >= maxChats) {
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

    const clear = useCallback(() => setSavedChats([]), []);

    // 렌더용 ReactElement 매핑. SavedChat.html을 DOMPurify로 sanitize 후
    // DOM Element로 환원 → convertToJSX.
    const chats = useMemo(() => {
        return savedChats.map(c => {
            const sanitized = DOMPurify.sanitize(c.html);
            const wrapper = document.createElement('div');
            wrapper.innerHTML = sanitized;
            const node = wrapper.firstElementChild as HTMLElement | null;
            const content = node ? convertToJSX(node) : null;
            return React.createElement(
                ChatWrapper,
                { key: c.key, time: c.time, restored: c.restored },
                content,
            );
        });
    }, [savedChats]);

    return { chats, addChat, clear };
}
