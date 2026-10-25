// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';
import type { PassedChat } from '@/hooks/useChatStream';

vi.stubGlobal('browser', fakeBrowser);
const { createArchiveRecorder } = await import('./archive-recorder');

const passed = (key: string, over: Partial<PassedChat> = {}): PassedChat => ({
    clone: document.createElement('div'), key, time: 1, prevKey: null, nickname: '닉', text: '채팅',
    archive: { badges: [], kind: 'chat' }, ...over,
});
const channel = () => ({ channelId: 'abc', mode: 'live' as const });
const tick = async (ms = 2000) => { await vi.advanceTimersByTimeAsync(ms); };

describe('createArchiveRecorder', () => {
    beforeEach(() => { fakeBrowser.reset(); vi.useFakeTimers(); });
    afterEach(() => vi.useRealTimers());

    it('2초마다 묶어 보낸다', async () => {
        const send = vi.fn(async (_msg: unknown) => ({ ok: true }));
        const r = createArchiveRecorder('chzzk', channel, send);
        r.record(passed('k1'));
        r.record(passed('k2'));
        expect(send).not.toHaveBeenCalled();
        await tick();
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0]).toMatchObject({ type: 'tbc-archive-put', chats: [{ id: 'chzzk:abc:live|k1' }, { id: 'chzzk:abc:live|k2' }] });
        r.stop();
    });

    it('백그라운드가 저장하지 못하면 다음에 다시 보낸다', async () => {
        const send = vi.fn().mockRejectedValueOnce(new Error('asleep')).mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true });
        const r = createArchiveRecorder('chzzk', channel, send);
        r.record(passed('k1'));
        await tick();
        await tick();
        await tick();
        expect(send).toHaveBeenCalledTimes(3);
        expect(send.mock.calls[2][0]).toMatchObject({ chats: [{ id: 'chzzk:abc:live|k1' }] });
        r.stop();
    });

    it('보내기 전에 블라인드되면 본문 없이 보낸다', async () => {
        const send = vi.fn(async (_msg: unknown) => ({ ok: true }));
        const r = createArchiveRecorder('chzzk', channel, send);
        r.record(passed('k1'));
        r.hide('k1');
        await tick();
        expect(send.mock.calls[0][0]).toMatchObject({ chats: [{ text: '', hidden: true }] });
        expect(send.mock.calls[1][0]).toMatchObject({ type: 'tbc-archive-hide', ids: ['chzzk:abc:live|k1'] });
        r.stop();
    });

    it('보관을 끄면 기록하지 않는다', async () => {
        await fakeBrowser.storage.local.set({ chatArchive: { enabled: false, days: 30 } });
        const send = vi.fn(async (_msg: unknown) => ({ ok: true }));
        const r = createArchiveRecorder('chzzk', channel, send);
        await tick(0);
        r.record(passed('k1'));
        await tick();
        expect(send).not.toHaveBeenCalled();
        r.stop();
    });

    it('채널을 모르면 기록하지 않는다', async () => {
        const send = vi.fn(async (_msg: unknown) => ({ ok: true }));
        const r = createArchiveRecorder('chzzk', () => null, send);
        r.record(passed('k1'));
        await tick();
        expect(send).not.toHaveBeenCalled();
        r.stop();
    });
});
