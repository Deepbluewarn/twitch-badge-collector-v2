import { describe, it, expect, vi } from 'vitest';
import { createSocketShadow, socketIdFromHostKey } from './socket-shadow';
import type { ChzzkSocketChat } from '@/platform/chzzk-socket';
import type { ChatInfo } from '@/interfaces/chat';

const T0 = 1_700_000_000_000;

function sock(over: Partial<ChzzkSocketChat> = {}): ChzzkSocketChat {
    const uid = over.uid ?? 'u1';
    const time = over.time ?? T0 + 1000;
    return {
        id: `${uid}_${time}`, uid, time, type: 1, status: 'NORMAL',
        nickname: '시청자', anonymous: false, message: '안녕', emojis: {},
        badges: ['b1'], verified: false, userRoleCode: 'common_user', extras: {},
        ...over,
    };
}

function html(over: Partial<ChatInfo> = {}): ChatInfo {
    return { badges: ['b1'], textContents: ['안녕'], loginName: '시청자', nickName: '시청자', ...over };
}

function setup(predicate = (c: ChatInfo) => ({ pass: c.badges.includes('b1') })) {
    let t = T0;
    const onMismatch = vi.fn();
    const shadow = createSocketShadow({ predicate, onMismatch, now: () => t, pairTimeoutMs: 1000 });
    return { shadow, onMismatch, advance: (ms: number) => { t += ms; } };
}

describe('socketIdFromHostKey', () => {
    it('uid_time_랜덤 → uid_time', () => {
        expect(socketIdFromHostKey('abc_1700000000000_x9')).toBe('abc_1700000000000');
    });
    it('클라이언트 메시지(CUSTOM_)와 형식 밖 key는 null', () => {
        expect(socketIdFromHostKey('CUSTOM_10001_1700000000000_x')).toBeNull();
        expect(socketIdFromHostKey('nokey')).toBeNull();
    });
});

describe('createSocketShadow', () => {
    it('소켓 먼저, html 나중 — 일치하면 matched', () => {
        const { shadow, onMismatch } = setup();
        shadow.onSocketChats([sock()]);
        shadow.onHtmlChat(`u1_${T0 + 1000}_r`, html());
        expect(onMismatch).not.toHaveBeenCalled();
        expect(shadow.sweep().matched).toBe(1);
    });

    it('html 먼저 와도 짝이 맞는다', () => {
        const { shadow } = setup();
        shadow.onHtmlChat(`u1_${T0 + 1000}_r`, html());
        shadow.onSocketChats([sock()]);
        expect(shadow.sweep().matched).toBe(1);
    });

    it('필드별 불일치를 각각 보고한다', () => {
        const { shadow, onMismatch } = setup();
        shadow.onSocketChats([sock({ nickname: '다름', badges: ['b1', 'b2'], message: '다른 말' })]);
        shadow.onHtmlChat(`u1_${T0 + 1000}_r`, html());
        const fields = onMismatch.mock.calls.map(c => c[0].field);
        expect(fields).toEqual(['name', 'badges', 'text']);
        expect(onMismatch.mock.calls[1][0]).toMatchObject({ html: { onlyInHtml: [] }, socket: { onlyInSocket: ['b2'] } });
        const s = shadow.sweep();
        expect(s.matched).toBe(0);
        expect(s.mismatched).toEqual({ name: 1, badges: 1, text: 1, verdict: 0 });
    });

    it('필터 판정이 갈리면 verdict 불일치', () => {
        const { shadow, onMismatch } = setup();
        shadow.onSocketChats([sock({ badges: [] })]);
        shadow.onHtmlChat(`u1_${T0 + 1000}_r`, html());
        expect(onMismatch.mock.calls.map(c => c[0].field)).toEqual(['badges', 'verdict']);
    });

    it('공백 차이와 배지 순서는 불일치가 아니다', () => {
        const { shadow, onMismatch } = setup();
        shadow.onSocketChats([sock({ badges: ['b2', 'b1'], message: '안녕  하세요' })]);
        shadow.onHtmlChat(`u1_${T0 + 1000}_r`, html({ badges: ['b1', 'b2'], textContents: [' 안녕 ', '하세요'] }));
        expect(onMismatch).not.toHaveBeenCalled();
    });

    it('익명 후원은 닉네임을, 클린봇 채팅은 텍스트를 비교하지 않는다', () => {
        const { shadow, onMismatch } = setup();
        shadow.onSocketChats([
            sock({ uid: 'anonymous', anonymous: true, nickname: '', type: 10 }),
            sock({ uid: 'u2', status: 'CBOTBLIND', message: '나쁜 말' }),
        ]);
        shadow.onHtmlChat(`anonymous_${T0 + 1000}_r`, html({ nickName: '익명의 후원자' }));
        shadow.onHtmlChat(`u2_${T0 + 1000}_r`, html({ textContents: ['클린봇이 감지했습니다'] }));
        expect(onMismatch).not.toHaveBeenCalled();
        expect(shadow.sweep().matched).toBe(2);
    });

    it('html이 닉네임을 못 뽑은 경우(unavailable)는 소켓 탓이 아니다', () => {
        const { shadow, onMismatch } = setup();
        shadow.onSocketChats([sock()]);
        shadow.onHtmlChat(`u1_${T0 + 1000}_r`, html({ nickName: '', unavailable: ['name'] }));
        expect(onMismatch).not.toHaveBeenCalled();
    });

    it('같은 채팅은 한 번만 비교 (가상 스크롤 재등장, recent/live 중복)', () => {
        const { shadow } = setup();
        shadow.onSocketChats([sock()]);
        shadow.onSocketChats([sock()]);
        shadow.onHtmlChat(`u1_${T0 + 1000}_r1`, html());
        shadow.onHtmlChat(`u1_${T0 + 1000}_r2`, html());
        expect(shadow.sweep()).toMatchObject({ matched: 1, pending: 0, htmlOnly: 0 });
    });

    it('짝 없이 만료 — 소켓만은 종류별로, html만은 표본과 함께', () => {
        const { shadow, advance } = setup();
        shadow.onSocketChats([sock({ uid: 'a' }), sock({ uid: 'b', type: 10 }), sock({ uid: 'c', status: 'CBOTBLIND' })]);
        shadow.onHtmlChat(`h_${T0 + 1000}_r`, html());
        expect(shadow.sweep().pending).toBe(4);
        advance(1001);
        const s = shadow.sweep();
        expect(s.socketOnly).toEqual({ 'type 1': 1, 'type 10': 1, 'type 1 CBOTBLIND': 1 });
        expect(s.htmlOnly).toBe(1);
        expect(s.htmlOnlySamples).toEqual([`h_${T0 + 1000}`]);
        expect(s.pending).toBe(0);
    });

    it('shadow 시작 전 채팅의 html만 남은 건 따로 센다 (리스너 전에 지나간 소켓 메시지)', () => {
        const { shadow, advance } = setup();
        shadow.onHtmlChat(`old_${T0 - 5000}_r`, html());
        advance(1001);
        expect(shadow.sweep()).toMatchObject({ htmlOnly: 0, htmlOnlyBeforeStart: 1 });
    });

    it('만료 후 늦게 온 짝은 다시 비교하지 않는다', () => {
        const { shadow, advance, onMismatch } = setup();
        shadow.onSocketChats([sock()]);
        advance(1001);
        shadow.sweep();
        shadow.onHtmlChat(`u1_${T0 + 1000}_r`, html({ nickName: '다름' }));
        expect(onMismatch).not.toHaveBeenCalled();
        expect(shadow.sweep().pending).toBe(0);
    });
});
