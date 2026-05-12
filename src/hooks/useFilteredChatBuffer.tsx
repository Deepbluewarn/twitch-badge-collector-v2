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
 * 새 채팅이든 복원이든 Fragment 그대로 — 호스트 페이지 레이아웃 영향 0.
 * 복원 시각 구분은 chat root element에 'tbcv2-restored-chat' className을
 * 직접 추가해서 처리(아래 chats useMemo). 그래야 wrapper div로 인한
 * `:last-child::before` 부작용이 안 생김.
 */
function ChatWrapper(props: ChatWrapperProps) {
    return <>{props.children}</>;
}

/** 복원된 채팅 root에 붙이는 클래스. 시각 구분용. */
export const RESTORED_CHAT_CLASS = 'tbcv2-restored-chat';

/** 캡쳐 모드 ON일 때 채팅 root에 붙는 클래스 — 클릭/호버 hint. */
export const CAPTURE_MODE_CLASS = 'tbcv2-capture-mode';
/** 캡쳐 모드에서 선택된 채팅 root에 붙는 클래스. */
export const CAPTURE_SELECTED_CLASS = 'tbcv2-capture-selected';

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
 * 채팅 유지는 *세션* 단위 — 새로고침/탭 이동엔 살아남되 브라우저 재시작엔 깨끗이 비움.
 * MV3의 `storage.session`은 메모리 기반 + 브라우저 종료 시 자동 삭제.
 *
 * 저장. quota 초과 시 오래된 쪽부터 10%씩 drop하고 재시도.
 */
async function saveWithEviction(key: string, payload: PersistedPayload): Promise<void> {
    let attempt = payload;
    while (attempt.chats.length > 0) {
        try {
            await browser.storage.session.set({ [key]: attempt });
            return;
        } catch {
            const evictCount = Math.max(1, Math.floor(attempt.chats.length * EVICTION_DROP_RATIO));
            attempt = { ...attempt, chats: attempt.chats.slice(evictCount) };
        }
    }
}

async function loadPersisted(key: string): Promise<SavedChat[]> {
    const res = await browser.storage.session.get(key);
    const payload = res[key] as PersistedPayload | undefined;
    if (!payload || payload.version !== 1) return [];
    return payload.chats.map(c => ({ ...c, restored: true }));
}

/**
 * Container에 표시되는 채팅 *배열*의 상태 관리.
 *
 * 책임:
 *  - dedupe (같은 key 무시 + persistence 어댑터는 same-time 무시)
 *  - 위치 결정 (host DOM prevSibling 기반, fallback은 time 추정)
 *  - 트림 (maxChats 초과 시 오래된 쪽부터)
 *  - 선택적 persistence: persistenceKey 주어지면 마운트 시 load,
 *    버퍼 변경 시 debounced save (quota 초과 시 오래된 채팅부터 evict).
 *
 * 기존 buffer 요소 순서는 절대 변경 안 함 — 새 chat의 자리만 splice insert.
 * 평소엔 prevKey(host DOM 직전 sibling) 기반. time은 prevKey 누락 시 fallback에서만.
 */
interface CaptureViewState {
    captureMode: boolean;
    selectedKeys: Set<string>;
}

export default function useFilteredChatBuffer(
    adapter: PlatformAdapter,
    maxChats: number,
    persistenceKey?: string,
    capture?: CaptureViewState,
) {
    const [savedChats, setSavedChats] = useState<SavedChat[]>([]);
    const persistTimerRef = useRef<number | null>(null);
    const isHydratedRef = useRef(false);
    // capture 상태는 ref로 — addChat의 useCallback이 dep 안 잡고 최신 값 읽음
    const captureRef = useRef(capture);
    useEffect(() => { captureRef.current = capture; }, [capture]);

    // capture 모드 해제될 때 누적된 초과분을 한 번에 trim. 모드 동안 maxChats 넘게
    // 쌓일 수 있어 (사용자가 선택 중인 채팅 보존 위해) 해제 시점에 정리.
    useEffect(() => {
        if (capture?.captureMode) return;
        setSavedChats(prev => {
            if (prev.length <= maxChats) return prev;
            const overflow = prev.length - maxChats;
            return adapter.chatOrder === 'newest-top'
                ? prev.slice(0, maxChats)
                : prev.slice(overflow);
        });
    }, [capture?.captureMode, maxChats, adapter.chatOrder]);

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

    const addChat = useCallback(({ clone, key, time, prevKey }: PassedChat) => {
        setSavedChats(prev => {
            // dedupe: 같은 세션은 key로(안정적인 React key 또는 동일 채팅 재발화 방지).
            // cross-session backfill은 time으로(서버 timestamp — 같은 채팅엔 같은 값).
            // time-dedupe는 persistence 켜진 어댑터에서만 의미 있음 (storage에서 load한
            // restored 채팅 vs 라이브로 다시 들어오는 같은 채팅 매칭). persistence 미지원
            // 어댑터(Twitch)는 inject가 CHAT_ATTR.TIME을 안 붙여 time=0으로 전부 들어오는데,
            // 이때 time-dedupe를 켜면 두 번째 채팅부터 첫 채팅과 매치되어 모두 drop됨.
            if (prev.some(c => c.key === key)) return prev;
            if (adapter.supportsChatPersistence && prev.some(c => c.time === time)) return prev;

            // 삽입 위치는 host DOM에서의 prevSibling을 기준으로 결정.
            // - prevKey === null     → host DOM 맨 앞 → buffer 맨 앞에 prepend.
            // - prevKey가 buffer에 존재 → 그 chat 바로 뒤에 splice insert.
            // - prevKey가 buffer에 없음  → chatOrder 기본값(newest-top=prepend, oldest-top=append).
            //
            // time/sort 안 씀. chzzk의 time이 도착 순서와 어긋나는 경우 있어 신뢰 불가.
            // host DOM 순서는 항상 진실이므로 그걸 미러링.
            // 기존 buffer 요소의 순서는 절대 변경 안 함 — 새 chat의 자리만 찾아 splice.
            const newEntry = { key, time, html: clone.outerHTML, restored: false };
            let next: SavedChat[];
            if (prevKey === null) {
                next = [newEntry, ...prev];
            } else {
                const idx = prev.findIndex(c => c.key === prevKey);
                if (idx === -1) {
                    // prevKey가 buffer에 없을 때만 time으로 위치 추정 fallback.
                    // 단순 prepend/append fallback은 chat이 newer/older인지 모르고 추측 →
                    // chronologically 잘못된 위치에 박혀 후속 chain이 어긋남.
                    // time 비교는 fallback에서만 — AFTER_PREV 일반 케이스엔 영향 X.
                    // 따라서 chzzk time jitter로 인한 stuck-chat 재발 없음.
                    const i = adapter.chatOrder === 'newest-top'
                        ? prev.findIndex(c => c.time < time)
                        : prev.findIndex(c => c.time > time);
                    const insertIdx = i === -1 ? prev.length : i;
                    next = [...prev.slice(0, insertIdx), newEntry, ...prev.slice(insertIdx)];
                } else {
                    next = [...prev.slice(0, idx + 1), newEntry, ...prev.slice(idx + 1)];
                }
            }

            // capture 모드 동안엔 trim 일시 정지 — 사용자가 보고 있는 채팅이 사라지지
            // 않도록. capture 모드 해제 시 별도 useEffect에서 한 번에 trim.
            if (next.length >= maxChats && !captureRef.current?.captureMode) {
                const overflow = next.length - maxChats;
                if (adapter.chatOrder === 'newest-top') {
                    next.splice(next.length - overflow, overflow);
                } else {
                    next.splice(0, overflow);
                }
            }

            return next;
        });
    }, [adapter, maxChats]);

    const clear = useCallback(() => setSavedChats([]), []);

    // 렌더용 ReactElement 매핑. SavedChat.html을 DOMPurify로 sanitize 후
    // DOM Element로 환원 → 복원/캡쳐 클래스 부여 → convertToJSX.
    const chats = useMemo(() => {
        return savedChats.map(c => {
            const sanitized = DOMPurify.sanitize(c.html);
            const wrapper = document.createElement('div');
            wrapper.innerHTML = sanitized;
            const node = wrapper.firstElementChild as HTMLElement | null;
            if (node) {
                if (c.restored) node.classList.add(RESTORED_CHAT_CLASS);
                if (capture?.captureMode) node.classList.add(CAPTURE_MODE_CLASS);
                if (capture?.selectedKeys.has(c.key)) node.classList.add(CAPTURE_SELECTED_CLASS);
            }
            const content = node ? convertToJSX(node) : null;
            return React.createElement(
                ChatWrapper,
                { key: c.key, time: c.time, restored: c.restored },
                content,
            );
        });
    }, [savedChats, capture?.captureMode, capture?.selectedKeys]);

    return { chats, addChat, clear, savedChats };
}
