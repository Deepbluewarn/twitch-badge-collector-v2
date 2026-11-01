import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';

vi.stubGlobal('browser', fakeBrowser);
const { CHANNEL_MAX_BYTES, clearAllChatHistory, loadChatHistory, removeChatHistory, saveChatHistory } = await import('./chat-history-store');

const payload = (bytes: number) => ({ version: 1, chats: [{ html: 'x'.repeat(bytes) }] });
const keys = async () => Object.keys(await fakeBrowser.storage.local.get(null)).filter(k => k.startsWith('chatHistory:')).sort();

describe('chat-history-store', () => {
    beforeEach(() => fakeBrowser.reset());

    it('저장하고 다시 읽는다', async () => {
        await saveChatHistory('chatHistory:chzzk:a:live', payload(10));
        expect(await loadChatHistory('chatHistory:chzzk:a:live')).toEqual(payload(10));
    });

    it('채널 하나가 한도를 넘으면 저장하지 않고 던진다 (호출 측이 덜어 내고 다시)', async () => {
        await expect(saveChatHistory('chatHistory:chzzk:a:live', payload(CHANNEL_MAX_BYTES))).rejects.toThrow();
        expect(await keys()).toEqual([]);
    });

    it('한도 가까이 찬 탭이 여럿이어도 서로 지우지 않는다', async () => {
        // 예전 전체 한도 4MB에선 900KB 다섯 개째에 가장 오래된 채널을 지웠다 — 탭 다섯 개가 2초마다 서로 지웠다
        const chs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        for (const ch of chs) {
            await saveChatHistory(`chatHistory:chzzk:${ch}:live`, payload(900_000));
            await new Promise(r => setTimeout(r, 2));
        }
        expect(await keys()).toEqual(chs.map(ch => `chatHistory:chzzk:${ch}:live`));
    });

    it('채널은 최근 20개까지', async () => {
        for (let i = 0; i < 22; i++) {
            await saveChatHistory(`chatHistory:chzzk:${String(i).padStart(2, '0')}:live`, payload(10));
            await new Promise(r => setTimeout(r, 2));
        }
        const left = await keys();
        expect(left).toHaveLength(20);
        expect(left[0]).toBe('chatHistory:chzzk:02:live');
    });

    it('지우기·브라우저 시작 때 모두 지우기 (필터 같은 다른 값은 그대로)', async () => {
        await fakeBrowser.storage.local.set({ filter: [1] });
        await saveChatHistory('chatHistory:chzzk:a:live', payload(10));
        await saveChatHistory('chatHistory:chzzk:b:live', payload(10));
        await removeChatHistory('chatHistory:chzzk:a:live');
        expect(await keys()).toEqual(['chatHistory:chzzk:b:live']);
        await clearAllChatHistory();
        expect(await keys()).toEqual([]);
        expect((await fakeBrowser.storage.local.get('filter')).filter).toEqual([1]);
    });
});
