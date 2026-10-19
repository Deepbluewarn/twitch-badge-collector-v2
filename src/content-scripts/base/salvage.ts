/**
 * 2.23.0 이하에서 업데이트될 때 모아보기 창에 모여 있던 채팅을 살린다.
 *
 * 그 버전들은 채팅 유지를 storage.session에 둬서, 업데이트하는 순간 저장된 채팅이 비워진다.
 * 하지만 화면에 그려 둔 채팅은 숨긴 옛 창(lifecycle.ts removeLeftovers) 안에 그대로 있고,
 * 채팅마다 key·시각이 붙어 있다. 저장소 형식으로 옮겨 두면 새 창이 평소 새로고침처럼 복원한다.
 *
 * 이미 저장된 채팅이 있으면(새 버전끼리의 업데이트 — 저장소가 살아 있다) 손대지 않는다.
 * 새 창이 저장소를 읽기 전에 끝나야 하므로 호출 측은 창을 만들기 전에 기다린다.
 */
import type { SettingInterface } from '@/interfaces/setting';
import { CHAT_ATTR } from '@/interfaces/chat-attributes';
import { CHAT_HISTORY_PREFIX, loadChatHistory, saveChatHistory } from '@/utils/chat-history-store';

type Platform = SettingInterface['platform'];

/** 옮긴 채팅 수. 옮길 게 없으면 0. */
export async function salvageLeftoverChats(
    type: Platform,
    channelId: string | null,
    chatOrder: 'newest-top' | 'newest-bottom',
): Promise<number> {
    if (!channelId) return 0;
    const roots = [...document.querySelectorAll<HTMLElement>(
        `#${type}-container-stale [${CHAT_ATTR.KEY}], #tbc-floating-${type}-stale [${CHAT_ATTR.KEY}]`,
    )].filter(el => !el.parentElement?.closest(`[${CHAT_ATTR.KEY}]`));
    if (roots.length === 0) return 0;

    try {
        if ((await browser.storage.local.get('chatPersistence')).chatPersistence === 'off') return 0;
        const key = `${CHAT_HISTORY_PREFIX}${type}:${channelId}:live`;
        if (await loadChatHistory(key)) return 0;

        const seen = new Set<string>();
        let chats = roots.flatMap(el => {
            const chatKey = el.getAttribute(CHAT_ATTR.KEY)!;
            // 옛 창의 채널 표시(title)가 다른 채널이면 버린다 — 채널을 옮긴 직후일 수 있다.
            const title = el.getAttribute('title');
            if (seen.has(chatKey) || (title && !title.includes(channelId))) return [];
            seen.add(chatKey);
            const clone = el.cloneNode(true) as HTMLElement;
            clone.removeAttribute('title');
            return [{ key: chatKey, time: Number(el.getAttribute(CHAT_ATTR.TIME)) || 0, html: clone.outerHTML, nickname: '', text: '', channel: key }];
        });
        // 채널당 한도를 넘으면 오래된 쪽부터 덜어 낸다.
        while (chats.length > 0) {
            try {
                await saveChatHistory(key, { version: 1, chats });
                return chats.length;
            } catch {
                const drop = Math.max(1, Math.floor(chats.length * 0.1));
                chats = chatOrder === 'newest-top' ? chats.slice(0, -drop) : chats.slice(drop);
            }
        }
    } catch { /* 살리지 못하면 예전처럼 빈 창에서 시작 */ }
    return 0;
}
