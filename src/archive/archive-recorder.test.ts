// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';
import type { ArchiveEntry } from './archive-recorder';

vi.stubGlobal('browser', fakeBrowser);
const { createArchiveRecorder } = await import('./archive-recorder');

const passed = (key: string, over: Partial<ArchiveEntry> = {}): ArchiveEntry => ({
    key, time: 1, nickname: '닉', text: '채팅', badges: [], kind: 'chat', ...over,
});
const channel = () => ({ channelId: 'abc', mode: 'live' as const });
const tick = async (ms = 2000) => { await vi.advanceTimersByTimeAsync(ms); };

describe('createArchiveRecorder', () => {
    // 보관은 기본으로 꺼져 있다. 기록 시험은 켠 상태에서 한다
    beforeEach(async () => {
        fakeBrowser.reset();
        await fakeBrowser.storage.local.set({ chatArchive: { enabled: true, days: 30 } });
        vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    it('2초마다 묶어 보낸다', async () => {
        const send = vi.fn(async (_msg: unknown) => ({ ok: true }));
        const r = createArchiveRecorder('chzzk', channel, send);
        await tick(0); // 설정을 읽을 때까지
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
        await tick(0); // 설정을 읽을 때까지
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
        await tick(0); // 설정을 읽을 때까지
        r.record(passed('k1'));
        r.hide('k1');
        await tick();
        expect(send.mock.calls[0][0]).toMatchObject({ chats: [{ text: '', hidden: true }] });
        expect(send.mock.calls[1][0]).toMatchObject({ type: 'tbc-archive-hide', ids: ['chzzk:abc:live|k1'] });
        r.stop();
    });

    it('끊김 구간을 채널에 남긴다', async () => {
        const send = vi.fn(async (_msg: unknown) => ({ ok: true }));
        const r = createArchiveRecorder('chzzk', channel, send);
        await tick(0); // 설정을 읽을 때까지
        r.gap(100, 200);
        await tick();
        expect(send.mock.calls[0][0]).toMatchObject({ chats: [{ id: 'chzzk:abc:live|gap_100', kind: 'gap', time: 100, until: 200 }] });
        r.stop();
    });

    it.each([
        ['끈 설정', { enabled: false, days: 30 }],
        ['설정 없음(기본값)', undefined],
    ])('보관이 꺼져 있으면 기록하지 않는다: %s', async (_name, setting) => {
        if (setting) await fakeBrowser.storage.local.set({ chatArchive: setting });
        else await fakeBrowser.storage.local.remove('chatArchive');
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
        await tick(0); // 설정을 읽을 때까지
        r.record(passed('k1'));
        await tick();
        expect(send).not.toHaveBeenCalled();
        r.stop();
    });
});
