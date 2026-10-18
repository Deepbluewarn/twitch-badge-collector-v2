/**
 * 채팅 유지 저장소 — storage.local.
 *
 * 예전엔 storage.session(메모리, 브라우저 종료 시 삭제)이었는데, session은 **확장이 업데이트될 때도 비워져**
 * 업데이트 직후 새로고침하면 모은 채팅이 다 사라졌다. local은 업데이트에도 남는다.
 * 세션 성격은 직접 지킨다: 브라우저를 시작할 때 모두 지우고(background onStartup), 채널 수를 제한한다.
 * 저장 위치는 여전히 이 컴퓨터뿐이다.
 */
export const CHAT_HISTORY_PREFIX = 'chatHistory:';
/** { [키]: 마지막 저장 시각 } — 채널 수 제한에서 오래된 것부터 지우려고 */
const INDEX_KEY = 'chatHistoryIndex';
const MAX_CHANNELS = 20;

const area = () => (typeof browser !== 'undefined' ? browser.storage?.local : undefined);
export const hasChatHistoryStore = () => !!area();

async function getIndex(): Promise<Record<string, number>> {
    const v = (await area()!.get(INDEX_KEY))[INDEX_KEY];
    return v && typeof v === 'object' ? v as Record<string, number> : {};
}

/** 저장. 넘치면(quota) 호출 측이 줄여서 다시 부른다 — 그래서 실패는 그대로 던진다. */
export async function saveChatHistory(key: string, payload: unknown): Promise<void> {
    const store = area();
    if (!store) return;
    await store.set({ [key]: payload });
    const index = { ...await getIndex(), [key]: Date.now() };
    const keys = Object.keys(index).sort((a, b) => index[b] - index[a]);
    const drop = keys.slice(MAX_CHANNELS);
    drop.forEach(k => delete index[k]);
    await store.set({ [INDEX_KEY]: index });
    if (drop.length) await store.remove(drop);
}

export async function loadChatHistory<T>(key: string): Promise<T | undefined> {
    const store = area();
    if (!store) return undefined;
    return (await store.get(key))[key] as T | undefined;
}

export async function removeChatHistory(key: string): Promise<void> {
    const store = area();
    if (!store) return;
    await store.remove(key);
    const index = await getIndex();
    if (key in index) {
        delete index[key];
        await store.set({ [INDEX_KEY]: index });
    }
}

/** 브라우저를 시작할 때 — 저장된 채팅을 모두 지운다(예전 storage.session과 같은 수명). */
export async function clearAllChatHistory(): Promise<void> {
    const store = area();
    if (!store) return;
    const all = await store.get(null);
    const keys = Object.keys(all).filter(k => k.startsWith(CHAT_HISTORY_PREFIX) || k === INDEX_KEY);
    if (keys.length) await store.remove(keys);
}
