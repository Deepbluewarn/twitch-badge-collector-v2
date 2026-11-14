import { describe, expect, it } from 'vitest';
import { judgeMain, type MainRun } from './main-path.ts';

const SOCKET = 'wss://kr-ss3.chat.naver.com/chat';
const healthy: MainRun = {
    at: 1,
    url: 'https://chzzk.naver.com/live/abc',
    sockets: [{ url: SOCKET, chats: 40 }],
    domChats: 35,
    tapInstalled: true,
    tapDelivered: 40,
    paneExists: true,
    pane: 30,
    paneWithBadge: 10,
    paneWithName: 30,
    container: 1,
};
const keys = (r: MainRun) => judgeMain(r).findings.map((f) => [f.key, f.level]);

describe('judgeMain', () => {
    it('창이 있고 채팅이 들어오고 소켓 경로가 살아 있으면 정상', () => {
        expect(judgeMain(healthy).status).toBe('ok');
    });

    it('창이 아예 없으면 깨짐, 채팅 컨테이너 선택자가 안 맞는지 적는다', () => {
        const r = judgeMain({ ...healthy, paneExists: false, pane: 0, container: 0 });
        expect(r.findings.map((f) => [f.key, f.level])).toEqual([['main:no-pane', 'broken']]);
        expect(r.findings[0].lines!.some((l) => l.includes('chatRoomLive'))).toBe(true);
    });

    it('창은 있는데 비면 깨짐', () => {
        expect(keys({ ...healthy, pane: 0 })).toEqual([['main:empty-pane', 'broken']]);
    });

    it('소켓 주소가 바뀌면 탭이 못 붙는다: 채팅은 화면에 있고 창도 차 있어도 위험', () => {
        const r = judgeMain({ ...healthy, tapDelivered: 0, sockets: [{ url: 'wss://kr-ss3.chat.naver.com/v2/chat', chats: 40 }] });
        expect(r.findings.map((f) => [f.key, f.level])).toEqual([['main:socket-path', 'risk']]);
        expect(r.findings[0].title).toContain('HTML 대체');
    });

    it('소켓이 페이지에서 사라지면(다른 곳으로 옮김) 화면 채팅으로 세고 위험', () => {
        expect(keys({ ...healthy, tapDelivered: 0, sockets: [] })).toEqual([['main:socket-path', 'risk']]);
    });

    it('파서가 못 읽으면 위험', () => {
        expect(keys({ ...healthy, tapDelivered: 0, sockets: [{ url: SOCKET, chats: 0 }] })).toEqual([['main:socket-path', 'risk']]);
    });

    it('탭이 설치되지 않으면 위험', () => {
        expect(keys({ ...healthy, tapDelivered: 0, tapInstalled: false })).toEqual([['main:socket-path', 'risk']]);
    });

    it('창도 비고 소켓 경로도 죽으면 둘 다', () => {
        expect(keys({ ...healthy, pane: 0, tapDelivered: 0, sockets: [] })).toEqual([['main:empty-pane', 'broken'], ['main:socket-path', 'risk']]);
    });

    it('소켓과 파서는 정상인데 탭이 안 넘기면(확장 쪽 고장) 위험, 원인 단서를 적는다', () => {
        const r = judgeMain({ ...healthy, tapDelivered: 0 });
        expect(r.findings.map((f) => f.key)).toEqual(['main:socket-path']);
        expect(r.findings[0].lines!.some((l) => l.includes('chzzk-socket-url.ts'))).toBe(true);
    });

    it('탭이 채팅을 넘겼으면 소켓 주소가 낯설어도 정상', () => {
        expect(judgeMain({ ...healthy, sockets: [{ url: 'wss://new.chat.naver.com/chat2', chats: 40 }] }).status).toBe('ok');
    });

    it('방송 채팅이 없거나 실행이 실패하면 확인 못 함', () => {
        expect(judgeMain({ ...healthy, sockets: [{ url: SOCKET, chats: 0 }], domChats: 0 }).status).toBe('unknown');
        const r = judgeMain({ at: 1, error: '확장 zip 404' });
        expect([r.status, r.note]).toEqual(['unknown', '확장 zip 404']);
    });
});
