import { describe, it, expect } from 'vitest';
import { checkSocketCapture, MIN_CHATS_FOR_BADGE_CHECK, type ChannelCapture } from './socket-check';

// 2026-10 실측 모양의 합성 패킷.
const profile = (over: Record<string, unknown> = {}) => JSON.stringify({
    userIdHash: 'u', nickname: '시청자', userRoleCode: 'common_user', badge: null, title: null, verifiedMark: false,
    activityBadges: [], streamingProperty: { nicknameColor: { colorCode: 'CC000' } },
    viewerBadges: [{ type: 'STANDARD', badge: { badgeId: 'b', scope: 'CHANNEL', imageUrl: 'https://x/fan.png' } }],
    ...over,
});

let seq = 0;
const item = (over: Record<string, unknown> = {}) => ({
    uid: `u${seq}`, msgTime: 1_700_000_000_000 + seq++, msg: 'hi', msgTypeCode: 1, msgStatusType: 'NORMAL',
    profile: profile(), extras: JSON.stringify({ emojis: {} }), ...over,
});

const connected = JSON.stringify({ cmd: 10100, bdy: { sid: 's' } });
const chatPacket = (...items: object[]) => JSON.stringify({ cmd: 93101, bdy: items });

function channel(raws: string[]): ChannelCapture {
    return { channel: 'c', raws: [connected, ...raws] };
}

const healthy = () => channel([chatPacket(item(), item(), item())]);

describe('checkSocketCapture', () => {
    it('정상 패킷이면 error·warn 없음', () => {
        const r = checkSocketCapture([healthy(), healthy()]);
        expect(r.errors).toEqual([]);
        expect(r.warnings).toEqual([]);
        expect(r.stats).toMatchObject({ channels: 2, connected: 2, chats: 6, withBadges: 6 });
    });

    it('채널을 못 찾음', () => {
        expect(checkSocketCapture([]).errors[0]).toMatch(/채팅 채널을 하나도/);
    });

    it('접속 완료를 받은 채널이 없음', () => {
        const r = checkSocketCapture([{ channel: 'c', raws: [chatPacket(item())] }]);
        expect(r.errors.join()).toMatch(/접속 완료\(10100\)/);
    });

    it('접속은 됐는데 채팅 0건', () => {
        expect(checkSocketCapture([channel([])]).errors.join()).toMatch(/채팅을 하나도 읽지 못했습니다/);
    });

    it('JSON이 아닌 패킷이 대다수', () => {
        expect(checkSocketCapture([channel(['\x00bin', '\x01bin', chatPacket(item())])]).errors.join()).toMatch(/JSON이 아닌 패킷/);
    });

    it('작성자·시각 필드가 바뀌어 정규화 실패', () => {
        const r = checkSocketCapture([channel([chatPacket(item({ msgTime: undefined, sentAt: 1 }), item())])]);
        expect(r.errors.join()).toMatch(/정규화 실패 1\/2/);
    });

    it('닉네임 필드 소실', () => {
        const r = checkSocketCapture([channel([chatPacket(item({ profile: profile({ nickname: undefined, displayName: 'x' }) }))])]);
        expect(r.errors.join()).toMatch(/profile\.nickname 없음/);
    });

    it('배지 필드 소실', () => {
        const r = checkSocketCapture([channel([chatPacket(item({ profile: profile({ viewerBadges: undefined, activityBadges: undefined }) }))])]);
        expect(r.errors.join()).toMatch(/viewerBadges·activityBadges 둘 다 없음/);
    });

    it('채팅은 충분한데 배지가 하나도 계산되지 않음', () => {
        const items = Array.from({ length: MIN_CHATS_FOR_BADGE_CHECK }, () =>
            item({ profile: profile({ viewerBadges: [{ type: 'NEW', icon: { src: 'https://x' } }] }) }));
        expect(checkSocketCapture([channel([chatPacket(...items)])]).errors.join()).toMatch(/배지가 계산된 채팅이 0건/);
    });

    it('채팅이 적으면 배지 0건은 판정하지 않는다', () => {
        const r = checkSocketCapture([channel([chatPacket(item({ profile: profile({ viewerBadges: [] }) }))])]);
        expect(r.errors).toEqual([]);
    });

    it('profile·extras JSON 깨짐', () => {
        const r = checkSocketCapture([channel([chatPacket(item({ profile: '{x', extras: 'nope' }))])]);
        expect(r.errors.join()).toMatch(/profile JSON 해석 실패/);
        expect(r.errors.join()).toMatch(/extras JSON 해석 실패/);
    });

    it('익명 후원(profile null)은 정상 — 닉네임 검사 대상이 아니다', () => {
        const anon = item({ uid: 'anonymous', msgTypeCode: 10, profile: null, extras: JSON.stringify({ payAmount: 1000, isAnonymous: true }) });
        const r = checkSocketCapture([channel([JSON.stringify({ cmd: 93102, bdy: [anon] }), chatPacket(item())])]);
        expect(r.errors).toEqual([]);
    });

    it('후원 금액 타입 변경', () => {
        const d = item({ msgTypeCode: 10, extras: JSON.stringify({ payAmount: '1,000' }) });
        expect(checkSocketCapture([channel([JSON.stringify({ cmd: 93102, bdy: [d] }), chatPacket(item())])]).errors.join()).toMatch(/payAmount/);
    });

    it('블라인드 이벤트 모양 변경', () => {
        const b = JSON.stringify({ cmd: 94008, bdy: { targetUser: 'u', blindType: 'HIDDEN' } });
        expect(checkSocketCapture([channel([b, chatPacket(item())])]).errors.join()).toMatch(/94008/);
    });

    it('처음 보는 cmd·메시지 종류·상태·blindType은 경고', () => {
        const r = checkSocketCapture([channel([
            JSON.stringify({ cmd: 99999, bdy: {} }),
            chatPacket(item({ msgTypeCode: 77, msgStatusType: 'SHADOW' }), item()),
            JSON.stringify({ cmd: 94008, bdy: { userId: 'u', messageTime: 1, blindType: 'AI_BLIND' } }),
        ])]);
        expect(r.errors).toEqual([]);
        const w = r.warnings.join('\n');
        expect(w).toMatch(/cmd: 99999/);
        expect(w).toMatch(/msgTypeCode: 77/);
        expect(w).toMatch(/msgStatusType: SHADOW/);
        expect(w).toMatch(/blindType: AI_BLIND/);
    });

    it('일부 채널만 접속되면 경고', () => {
        const r = checkSocketCapture([healthy(), { channel: 'x', raws: [] }, { channel: 'y', raws: [] }]);
        expect(r.warnings.join()).toMatch(/절반 미만 — 1\/3/);
    });

    it('한두 건의 이상한 패킷으로는 error를 내지 않는다', () => {
        const many = Array.from({ length: 50 }, () => item());
        const r = checkSocketCapture([channel([chatPacket(...many, item({ profile: profile({ nickname: undefined }) }))])]);
        expect(r.errors).toEqual([]);
    });
});
