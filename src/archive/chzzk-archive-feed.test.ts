import { describe, it, expect, vi } from 'vitest';
import { createChzzkArchiveFeed } from './chzzk-archive-feed';
import type { CompositeFilterElement } from '@/interfaces/filter';
import type { ChzzkSocketChat } from '@/platform/chzzk-socket';

const keyword = (value: string, color?: string) => ({
    filterType: 'include', id: `f-${value}`, platform: 'chzzk', ...(color ? { markerColor: color } : {}),
    filters: [{ category: 'keyword', id: `f-${value}-1`, type: 'include', value }],
}) as unknown as CompositeFilterElement;

let n = 0;
function chat(time: number, over: Partial<ChzzkSocketChat> = {}): ChzzkSocketChat {
    n++;
    return {
        id: `u${n}_${time}`, uid: `u${n}`, time, type: 1, status: 'NORMAL',
        nickname: '시청자', anonymous: false, message: 'ㅋㅋ', emojis: {},
        badges: ['b1'], verified: false, userRoleCode: 'common_user', extras: {},
        ...over,
    };
}

function setup(filters = [keyword('ㅋ')]) {
    const recorder = { record: vi.fn(), hide: vi.fn(), gap: vi.fn() };
    const feed = createChzzkArchiveFeed(recorder, () => filters, () => 'ch1');
    const connected = (cid = 'CID') => feed.handle({ action: 'tbc-socket-chat', kind: 'connected', cid });
    const chats = (list: ChzzkSocketChat[], recent = false) => feed.handle({ action: 'tbc-socket-chat', kind: 'chats', recent, chats: list });
    return { recorder, feed, connected, chats };
}

describe('createChzzkArchiveFeed', () => {
    it('필터에 걸린 소켓 채팅만 기록한다', () => {
        const { recorder, chats } = setup();
        chats([chat(1), chat(2, { message: '안녕' })]);
        expect(recorder.record).toHaveBeenCalledTimes(1);
        expect(recorder.record.mock.calls[0][0]).toMatchObject({ time: 1, nickname: '시청자', text: 'ㅋㅋ', badges: ['b1'], kind: 'chat' });
    });

    it('같은 채팅은 한 번만 — 최근 채팅·다시 받은 메시지와 겹쳐도', () => {
        const { recorder, chats } = setup();
        const c = chat(1);
        chats([c], true);
        chats([c]);
        expect(recorder.record).toHaveBeenCalledTimes(1);
    });

    it('가려진 채팅은 본문 없이, 후원은 금액과 함께', () => {
        const { recorder, chats } = setup();
        chats([chat(1, { status: 'BLIND' }), chat(2, { type: 10, extras: { payAmount: 1000 } })]);
        const [a, b] = recorder.record.mock.calls.map(x => x[0]);
        expect(a).toMatchObject({ text: '', hidden: true });
        expect(b).toMatchObject({ kind: 'donation', amount: 1000 });
    });

    it('필터 그룹 색을 표시 색으로, 없으면 기본 색', () => {
        const { recorder, chats } = setup([keyword('ㅋ', '#ff0000')]);
        chats([chat(1)]);
        expect(recorder.record.mock.calls[0][0].marker).toBe('#ff0000');
        const plain = setup();
        plain.chats([chat(1)]);
        expect(plain.recorder.record.mock.calls[0][0].marker).toBe('#FFC107');
    });

    it('나중에 블라인드되면 가리고, 해제는 무시한다', () => {
        const { recorder, feed } = setup();
        feed.handle({ action: 'tbc-socket-chat', kind: 'blind', event: { id: 'u1_1', blindType: 'BLIND' } });
        feed.handle({ action: 'tbc-socket-chat', kind: 'blind', event: { id: 'u1_1', blindType: 'CANCEL' } });
        expect(recorder.hide.mock.calls).toEqual([['u1_1']]);
    });

    describe('끊김 구간', () => {
        it('다시 붙은 뒤 최근 채팅이 끊기기 전 마지막 채팅까지 닿으면 남기지 않는다', () => {
            const { recorder, connected, chats } = setup();
            connected();
            chats([chat(100), chat(200)]);
            connected();
            chats([chat(150), chat(200), chat(300)], true);
            expect(recorder.gap).not.toHaveBeenCalled();
        });

        it('못 닿으면 마지막 채팅부터 다시 받은 첫 채팅까지를 남긴다', () => {
            const { recorder, connected, chats } = setup();
            connected();
            chats([chat(100), chat(200)]);
            connected();
            chats([chat(500), chat(600)], true);
            expect(recorder.gap).toHaveBeenCalledWith(200, 500);
        });

        it('필터에 안 걸린 채팅 시각도 센다 — 조용한 구간을 끊김으로 착각하지 않게', () => {
            const { recorder, connected, chats } = setup();
            connected();
            chats([chat(100), chat(400, { message: '안녕' })]);
            connected();
            chats([chat(300, { message: '안녕' })], true);
            expect(recorder.gap).not.toHaveBeenCalled();
        });

        it('처음 붙을 때와 다른 채널로 옮겨 붙을 때는 끊김이 아니다', () => {
            const { recorder, connected, chats } = setup();
            connected('A');
            chats([chat(100)]);
            connected('B');
            chats([chat(500)], true);
            expect(recorder.gap).not.toHaveBeenCalled();
        });
    });
});
