import { describe, it, expect, vi } from 'vitest';
import { installChzzkSocketTap } from './ws-tap';
import { TBC_SOCKET_CHAT_ACTION } from '@/interfaces/chat-attributes';

/** 최소한의 WebSocket 대역 — host 코드처럼 addEventListener로 듣는다. */
class FakeWebSocket extends EventTarget {
    static OPEN = 1;
    constructor(public url: string) { super(); }
    receive(data: unknown) {
        this.dispatchEvent(new MessageEvent('message', { data: typeof data === 'string' ? data : JSON.stringify(data) }));
    }
}

function setup() {
    const target = { WebSocket: FakeWebSocket as unknown as typeof WebSocket };
    const post = vi.fn();
    installChzzkSocketTap(target, post);
    const make = (url: string) => new target.WebSocket(url) as unknown as FakeWebSocket;
    return { target, post, make };
}

const chatPacket = {
    cmd: 93101,
    bdy: [{ uid: 'u1', msgTime: 1, msg: 'hi', msgTypeCode: 1, profile: '{"nickname":"n"}', extras: '{}' }],
};

describe('installChzzkSocketTap', () => {
    it('채팅 소켓 패킷을 정규화해서 post한다', () => {
        const { post, make } = setup();
        make('wss://kr-ss3.chat.naver.com/chat').receive(chatPacket);
        expect(post).toHaveBeenCalledWith({
            action: TBC_SOCKET_CHAT_ACTION,
            kind: 'chats',
            recent: false,
            chats: [expect.objectContaining({ id: 'u1_1', nickname: 'n', message: 'hi' })],
        });
    });

    it('CONNECTED는 connected 신호로', () => {
        const { post, make } = setup();
        make('wss://kr-ss1.chat.naver.com/chat').receive({ cmd: 10100, cid: 'CID', bdy: {} });
        expect(post).toHaveBeenCalledWith({ action: TBC_SOCKET_CHAT_ACTION, kind: 'connected', cid: 'CID' });
    });

    it('15101은 recent로 표시', () => {
        const { post, make } = setup();
        make('wss://kr-ss1.chat.naver.com/chat').receive({
            cmd: 15101, bdy: { messageList: [{ userId: 'u', messageTime: 5, content: 'c' }] },
        });
        expect(post.mock.calls[0][0]).toMatchObject({ kind: 'chats', recent: true });
    });

    it('채팅 소켓이 아니면 listener를 붙이지 않는다', () => {
        const { post, make } = setup();
        make('wss://example.com/chat').receive(chatPacket);
        make('wss://kr-ss1.chat.naver.com/other').receive(chatPacket);
        expect(post).not.toHaveBeenCalled();
    });

    it('ping/깨진 데이터/바이너리는 조용히 무시', () => {
        const { post, make } = setup();
        const ws = make('wss://kr-ss1.chat.naver.com/chat');
        ws.receive({ cmd: 0 });
        ws.receive('{not json');
        ws.dispatchEvent(new MessageEvent('message', { data: new ArrayBuffer(4) }));
        expect(post).not.toHaveBeenCalled();
    });

    it('post가 throw해도 host listener는 계속 받는다', () => {
        const target = { WebSocket: FakeWebSocket as unknown as typeof WebSocket };
        installChzzkSocketTap(target, () => { throw new Error('boom'); });
        const ws = new target.WebSocket('wss://kr-ss1.chat.naver.com/chat') as unknown as FakeWebSocket;
        const host = vi.fn();
        ws.addEventListener('message', host);
        ws.receive(chatPacket);
        expect(host).toHaveBeenCalledTimes(1);
    });

    it('instanceof / static 상수 / 상속이 그대로 동작', () => {
        const { target, make } = setup();
        expect(make('wss://kr-ss1.chat.naver.com/chat')).toBeInstanceOf(target.WebSocket);
        expect(target.WebSocket.OPEN).toBe(1);
        class Sub extends (target.WebSocket as unknown as typeof FakeWebSocket) {}
        expect(new Sub('wss://x')).toBeInstanceOf(Sub);
    });

    it('두 번 설치해도 한 번만 감싼다', () => {
        const target = { WebSocket: FakeWebSocket as unknown as typeof WebSocket };
        const post = vi.fn();
        expect(installChzzkSocketTap(target, post)).toBe(true);
        expect(installChzzkSocketTap(target, post)).toBe(false);
        (new target.WebSocket('wss://kr-ss1.chat.naver.com/chat') as unknown as FakeWebSocket).receive(chatPacket);
        expect(post).toHaveBeenCalledTimes(1);
    });
});
