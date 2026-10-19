// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';

vi.stubGlobal('browser', fakeBrowser);
const { salvageLeftoverChats } = await import('./salvage');
const { loadChatHistory, saveChatHistory } = await import('@/utils/chat-history-store');

const KEY = 'chatHistory:chzzk:ch1:live';
const chat = (key: string, time: number, channel = 'ch1') =>
    `<div class="_item" data-tbc-chat-key="${key}" data-tbc-chat-time="${time}" title="채널: ${channel}"><span data-tbc-chat-key="inner">${key}</span></div>`;
/** 2.23.0이 남긴 창 — 새 스크립트의 removeLeftovers가 id에 -stale을 붙여 숨긴 상태 */
const leftover = (id: string, ...chats: string[]) => {
    document.body.innerHTML = `<div id="${id}" style="display:none"><div id="tbc-clone__chzzkui">${chats.join('')}</div></div>`;
};
type Payload = { version: number; chats: { key: string; time: number; html: string }[] };

describe('salvageLeftoverChats', () => {
    beforeEach(() => {
        fakeBrowser.reset();
        document.body.innerHTML = '';
    });

    it('옛 창의 채팅을 순서 그대로 저장소로 옮긴다 (title은 뺀다)', async () => {
        leftover('chzzk-container-stale', chat('b', 2), chat('a', 1));
        expect(await salvageLeftoverChats('chzzk', 'ch1', 'newest-top')).toBe(2);
        const saved = await loadChatHistory<Payload>(KEY);
        expect(saved?.chats.map(c => [c.key, c.time])).toEqual([['b', 2], ['a', 1]]);
        expect(saved?.chats[0].html).not.toContain('title=');
    });

    it('팝오버 창에서도 옮긴다', async () => {
        leftover('tbc-floating-chzzk-stale', chat('a', 1));
        expect(await salvageLeftoverChats('chzzk', 'ch1', 'newest-top')).toBe(1);
    });

    it('이미 저장된 채팅이 있으면 손대지 않는다 (새 버전끼리 업데이트)', async () => {
        await saveChatHistory(KEY, { version: 1, chats: [{ key: 'x', time: 9, html: '' }] });
        leftover('chzzk-container-stale', chat('a', 1));
        expect(await salvageLeftoverChats('chzzk', 'ch1', 'newest-top')).toBe(0);
        expect((await loadChatHistory<Payload>(KEY))?.chats.map(c => c.key)).toEqual(['x']);
    });

    it('채팅 유지를 꺼 두었으면 옮기지 않는다', async () => {
        await fakeBrowser.storage.local.set({ chatPersistence: 'off' });
        leftover('chzzk-container-stale', chat('a', 1));
        expect(await salvageLeftoverChats('chzzk', 'ch1', 'newest-top')).toBe(0);
        expect(await loadChatHistory(KEY)).toBeUndefined();
    });

    it('다른 채널 채팅은 버린다', async () => {
        leftover('chzzk-container-stale', chat('a', 1, 'other'), chat('b', 2));
        expect(await salvageLeftoverChats('chzzk', 'ch1', 'newest-top')).toBe(1);
    });

    it('옛 창이 없거나 라이브가 아니면 아무것도 안 한다', async () => {
        expect(await salvageLeftoverChats('chzzk', 'ch1', 'newest-top')).toBe(0);
        leftover('chzzk-container-stale', chat('a', 1));
        expect(await salvageLeftoverChats('chzzk', null, 'newest-top')).toBe(0);
    });
});
