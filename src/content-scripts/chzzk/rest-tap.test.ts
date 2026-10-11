import { describe, it, expect, vi } from 'vitest';
import { installChzzkRestTap } from './rest-tap';
import { TBC_SOCKET_CHAT_ACTION } from '@/interfaces/chat-attributes';

const URL_VOD = 'https://api.chzzk.naver.com/service/v1/videos/123/chats?playerMessageTime=0&previousVideoChatSize=50';

const body = {
    code: 200,
    content: {
        nextPlayerMessageTime: 45000,
        previousVideoChats: [],
        videoChats: [{ userIdHash: 'u1', messageTime: 1000, playerMessageTime: 500, content: 'hi', messageTypeCode: 1, profile: '{"nickname":"n"}', extras: '{}' }],
    },
};

/** axios xhr adapter가 쓰는 만큼만 흉내 낸 XHR. 탭이 prototype을 감싸므로 테스트마다 새 클래스. */
const makeXHR = () => class FakeXHR extends EventTarget {
    status = 0;
    responseType: XMLHttpRequestResponseType = '';
    responseText = '';
    response: unknown = null;
    openedWith: unknown[] = [];
    open(...args: unknown[]) { this.openedWith = args; }
    finish(status: number, text: string) {
        this.status = status;
        this.responseText = text;
        this.dispatchEvent(new Event('load'));
    }
};
type FakeXHR = InstanceType<ReturnType<typeof makeXHR>>;

function setup(fetchImpl?: typeof fetch) {
    const target = { XMLHttpRequest: makeXHR() as unknown as typeof XMLHttpRequest, fetch: fetchImpl };
    const post = vi.fn();
    installChzzkRestTap(target, post);
    return { target, post };
}

describe('installChzzkRestTap — 다시보기 채팅 (XHR)', () => {
    it('다시보기 채팅 응답을 정규화해서 post', () => {
        const { target, post } = setup();
        const xhr = new target.XMLHttpRequest() as unknown as FakeXHR;
        xhr.open('GET', URL_VOD, true);
        xhr.finish(200, JSON.stringify(body));
        expect(post).toHaveBeenCalledWith({
            action: TBC_SOCKET_CHAT_ACTION,
            kind: 'vod-chats',
            chats: [expect.objectContaining({ id: 'u1_1000', playerTime: 500, nickname: 'n' })],
        });
    });

    it('원래 open 인자를 그대로 넘긴다', () => {
        const { target } = setup();
        const xhr = new target.XMLHttpRequest() as unknown as FakeXHR;
        xhr.open('GET', URL_VOD, true, 'user', 'pw');
        expect(xhr.openedWith).toEqual(['GET', URL_VOD, true, 'user', 'pw']);
    });

    it('responseType json도 읽는다', () => {
        const { target, post } = setup();
        const xhr = new target.XMLHttpRequest() as unknown as FakeXHR;
        xhr.open('GET', URL_VOD);
        xhr.responseType = 'json';
        xhr.response = body;
        xhr.status = 200;
        xhr.dispatchEvent(new Event('load'));
        expect(post).toHaveBeenCalledTimes(1);
    });

    it('다른 주소·실패 응답·깨진 JSON은 무시', () => {
        const { target, post } = setup();
        const other = new target.XMLHttpRequest() as unknown as FakeXHR;
        other.open('GET', 'https://api.chzzk.naver.com/service/v1/videos/123');
        other.finish(200, JSON.stringify(body));
        const failed = new target.XMLHttpRequest() as unknown as FakeXHR;
        failed.open('GET', URL_VOD);
        failed.finish(500, JSON.stringify(body));
        const broken = new target.XMLHttpRequest() as unknown as FakeXHR;
        broken.open('GET', URL_VOD);
        broken.finish(200, '{not json');
        expect(post).not.toHaveBeenCalled();
    });

    it('post가 throw해도 host의 load listener는 계속 받는다', () => {
        const target = { XMLHttpRequest: makeXHR() as unknown as typeof XMLHttpRequest };
        installChzzkRestTap(target, () => { throw new Error('boom'); });
        const xhr = new target.XMLHttpRequest() as unknown as FakeXHR;
        xhr.open('GET', URL_VOD);
        const host = vi.fn();
        xhr.addEventListener('load', host);
        xhr.finish(200, JSON.stringify(body));
        expect(host).toHaveBeenCalledTimes(1);
    });
});

describe('installChzzkRestTap — fetch', () => {
    it('다시보기 채팅 응답을 읽고, host에는 원래 응답을 그대로 준다', async () => {
        const res = new Response(JSON.stringify(body), { status: 200 });
        const orig = vi.fn(async () => res);
        const { target, post } = setup(orig as unknown as typeof fetch);
        const got = await target.fetch!(URL_VOD);
        expect(got).toBe(res);
        expect(await got.json()).toEqual(body);   // host가 본문을 그대로 읽을 수 있다
        await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    });

    it('다른 주소는 건드리지 않는다', async () => {
        const orig = vi.fn(async () => new Response('{}'));
        const { target, post } = setup(orig as unknown as typeof fetch);
        await target.fetch!('https://example.com/x');
        await new Promise(r => setTimeout(r, 0));
        expect(post).not.toHaveBeenCalled();
    });
});

it('두 번 설치해도 한 번만 감싼다', () => {
    const target = { XMLHttpRequest: makeXHR() as unknown as typeof XMLHttpRequest };
    const post = vi.fn();
    expect(installChzzkRestTap(target, post)).toBe(true);
    expect(installChzzkRestTap(target, post)).toBe(false);
});

describe('installChzzkRestTap — 차단 목록', () => {
    const URL_BLOCK = 'https://comm-api.game.naver.com/nng_main/v1/privateUserBlocks/allUserIdHash';

    it('차단 목록 응답을 block-list로 post (XHR)', () => {
        const { target, post } = setup();
        const xhr = new target.XMLHttpRequest() as unknown as FakeXHR;
        xhr.open('GET', URL_BLOCK);
        xhr.finish(200, JSON.stringify({ code: 200, content: ['u1', 'u2'] }));
        expect(post).toHaveBeenCalledWith({ action: TBC_SOCKET_CHAT_ACTION, kind: 'block-list', uids: ['u1', 'u2'] });
    });

    it('빈 목록도 post한다 (차단 해제 반영)', () => {
        const { target, post } = setup();
        const xhr = new target.XMLHttpRequest() as unknown as FakeXHR;
        xhr.open('GET', URL_BLOCK);
        xhr.finish(200, JSON.stringify({ code: 200, content: [] }));
        expect(post).toHaveBeenCalledWith({ action: TBC_SOCKET_CHAT_ACTION, kind: 'block-list', uids: [] });
    });

    it('차단·해제 요청(POST/DELETE 주소)은 보지 않는다', () => {
        const { target, post } = setup();
        const xhr = new target.XMLHttpRequest() as unknown as FakeXHR;
        xhr.open('POST', 'https://comm-api.game.naver.com/nng_main/v1/privateUserBlocks/u1?loungeId=');
        xhr.finish(200, JSON.stringify({ code: 200, content: null }));
        expect(post).not.toHaveBeenCalled();
    });

    it('fetch로 받아도 같다', async () => {
        const orig = vi.fn(async () => new Response(JSON.stringify({ content: ['u9'] }), { status: 200 }));
        const { target, post } = setup(orig as unknown as typeof fetch);
        await target.fetch!(URL_BLOCK);
        await vi.waitFor(() => expect(post).toHaveBeenCalledWith({ action: TBC_SOCKET_CHAT_ACTION, kind: 'block-list', uids: ['u9'] }));
    });
});
