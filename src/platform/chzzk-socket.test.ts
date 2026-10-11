import { describe, it, expect } from 'vitest';
import {
    parseVodChatResponse,
    VOD_CHATS_URL,
    applyBlindEvent,
    parseChzzkBlindEvent,
    deriveDisplayBadges,
    normalizeChzzkMessage,
    parseChzzkPacket,
    resolveNicknameColor,
    stripEmojiTokens,
    toChatInfo,
    withEncodedVariants,
} from './chzzk-socket';

// 2026-10 실측 패킷 모양을 따른 합성 fixture. profile/extras는 소켓에서 JSON 문자열로 온다.
const B = 'https://ssl.pstatic.net/static/nng/glive';

function profile(over: Record<string, unknown> = {}) {
    return {
        userIdHash: 'u1',
        nickname: '시청자',
        profileImageUrl: '',
        userRoleCode: 'common_user',
        badge: null,
        title: null,
        verifiedMark: false,
        activityBadges: [],
        streamingProperty: { nicknameColor: { colorCode: 'CC000' }, activatedAchievementBadgeIds: [] },
        viewerBadges: [],
        ...over,
    };
}

function liveBdy(over: Record<string, unknown> = {}, prof: Record<string, unknown> | null = profile()) {
    return {
        svcid: 'game', cid: 'CID', uid: 'u1',
        profile: prof === null ? null : JSON.stringify(prof),
        msg: '안녕하세요',
        msgTypeCode: 1,
        msgStatusType: 'NORMAL',
        extras: JSON.stringify({ osType: 'PC', chatType: 'STREAMING', streamingChannelId: 'ch1', emojis: {} }),
        ctime: 1700000000000, utime: 1700000000000, msgTime: 1700000000000,
        ...over,
    };
}

describe('deriveDisplayBadges — host tv() 재현', () => {
    it('역할 → 후원랭킹 → 구독 → viewerBadges 순서', () => {
        const badges = deriveDisplayBadges(profile({
            badge: { imageUrl: `${B}/role.png` },
            streamingProperty: {
                realTimeDonationRanking: { badge: { imageUrl: `${B}/rank.png` } },
                subscription: { accumulativeMonth: 9, tier: 1, badge: { imageUrl: `${B}/9m.png` } },
            },
            viewerBadges: [{ type: 'STANDARD', badge: { badgeId: 'x', scope: 'CHANNEL', imageUrl: `${B}/fan.png` } }],
        }));
        expect(badges).toEqual([`${B}/role.png`, `${B}/rank.png`, `${B}/9m.png`, `${B}/fan.png`]);
    });

    it('viewerBadges: CHANNEL scope 먼저, 같은 scope는 order 순', () => {
        const badges = deriveDisplayBadges(profile({
            viewerBadges: [
                { order: 1, badge: { scope: 'GLOBAL', imageUrl: 'g1' } },
                { order: 2, badge: { scope: 'CHANNEL', imageUrl: 'c2' } },
                { order: 0, badge: { scope: 'GLOBAL', imageUrl: 'g0' } },
                { order: 1, badge: { scope: 'CHANNEL', imageUrl: 'c1' } },
            ],
        }));
        expect(badges).toEqual(['c1', 'c2', 'g0', 'g1']);
    });

    it('첫 항목에 activatedV2가 있으면 그걸로 거른다', () => {
        const badges = deriveDisplayBadges(profile({
            viewerBadges: [
                { activatedV2: true, badge: { scope: 'CHANNEL', imageUrl: 'on' } },
                { activatedV2: false, badge: { scope: 'CHANNEL', imageUrl: 'off' } },
            ],
        }));
        expect(badges).toEqual(['on']);
    });

    it('viewerBadges가 없으면 activityBadges(activated만)', () => {
        const badges = deriveDisplayBadges(profile({
            viewerBadges: undefined,
            activityBadges: [
                { imageUrl: 'a', activated: true },
                { imageUrl: 'b', activated: false },
            ],
        }));
        expect(badges).toEqual(['a']);
    });

    it('viewerBadges가 빈 배열이면 activityBadges로 넘어가지 않는다 (host와 동일)', () => {
        const badges = deriveDisplayBadges(profile({
            viewerBadges: [],
            activityBadges: [{ imageUrl: 'a', activated: true }],
        }));
        expect(badges).toEqual([]);
    });

    it('null profile → 빈 배열', () => {
        expect(deriveDisplayBadges(null)).toEqual([]);
    });
});

describe('normalizeChzzkMessage', () => {
    it('live 소켓 bdy', () => {
        const c = normalizeChzzkMessage(liveBdy())!;
        expect(c).toMatchObject({
            id: 'u1_1700000000000', uid: 'u1', time: 1700000000000, type: 1, status: 'NORMAL',
            nickname: '시청자', anonymous: false, message: '안녕하세요', channelId: 'ch1',
            nicknameColorCode: 'CC000', verified: false,
        });
    });

    it('15101 recent 항목 (userId/messageTime/content)', () => {
        const c = normalizeChzzkMessage({
            serviceId: 'game', channelId: 'CID', messageTime: 1700000000001, userId: 'u2',
            profile: JSON.stringify(profile({ nickname: '옛날' })), content: '과거 채팅',
            extras: '{}', messageTypeCode: 1, messageStatusType: 'NORMAL',
        })!;
        expect(c).toMatchObject({ id: 'u2_1700000000001', nickname: '옛날', message: '과거 채팅' });
    });

    it('VOD REST 항목 (userIdHash/playerMessageTime)', () => {
        const c = normalizeChzzkMessage({
            chatChannelId: 'CID', messageTime: 1700000000002, userIdHash: 'u3',
            content: '다시보기', extras: '{}', messageTypeCode: 1, messageStatusType: 'NORMAL',
            profile: JSON.stringify(profile({ nickname: 'vod' })), playerMessageTime: 600038,
        })!;
        expect(c).toMatchObject({ id: 'u3_1700000000002', playerTime: 600038, nickname: 'vod' });
    });

    it('profile 없는 익명 후원', () => {
        const c = normalizeChzzkMessage(liveBdy({ uid: 'anonymous', msgTypeCode: 10 }, null))!;
        expect(c.anonymous).toBe(true);
        expect(c.nickname).toBe('');
        expect(c.badges).toEqual([]);
    });

    it('깨진 profile/extras JSON은 채팅 자체를 버리지 않는다', () => {
        const c = normalizeChzzkMessage(liveBdy({ profile: '{broken', extras: 'nope' }))!;
        expect(c.message).toBe('안녕하세요');
        expect(c.nickname).toBe('');
        expect(c.extras).toEqual({});
    });

    it('시각/작성자 없으면 null', () => {
        expect(normalizeChzzkMessage({ msg: 'x' })).toBeNull();
        expect(normalizeChzzkMessage(liveBdy({ uid: '' }))).toBeNull();
        expect(normalizeChzzkMessage(null)).toBeNull();
    });
});

describe('parseChzzkPacket', () => {
    it('93101 채팅 묶음', () => {
        const chats = parseChzzkPacket({ cmd: 93101, bdy: [liveBdy(), liveBdy({ uid: 'u9' })] });
        expect(chats.map(c => c.uid)).toEqual(['u1', 'u9']);
    });

    it('93102 후원', () => {
        expect(parseChzzkPacket({ cmd: 93102, bdy: [liveBdy({ msgTypeCode: 10 })] })[0].type).toBe(10);
    });

    it('15101 recent는 bdy.messageList', () => {
        const chats = parseChzzkPacket({
            cmd: 15101,
            bdy: { messageList: [{ messageTime: 1, userId: 'u', content: 'c', profile: null, extras: null }], userCount: 1 },
        });
        expect(chats).toHaveLength(1);
    });

    it('SYSTEM(30) 운영 알림은 채팅으로 넘기지 않는다', () => {
        const chats = parseChzzkPacket({ cmd: 93101, bdy: [liveBdy({ msgTypeCode: 30 }), liveBdy({ uid: 'u2' })] });
        expect(chats.map(c => c.uid)).toEqual(['u2']);
    });

    it('채팅이 아닌 패킷은 빈 배열', () => {
        expect(parseChzzkPacket({ cmd: 0 })).toEqual([]);
        expect(parseChzzkPacket({ cmd: 10100, bdy: { sid: 's' } })).toEqual([]);
        expect(parseChzzkPacket('garbage')).toEqual([]);
    });
});

describe('toChatInfo', () => {
    it('이모지 토큰은 keyword 대상 텍스트에서 빠진다', () => {
        const c = normalizeChzzkMessage(liveBdy({
            msg: '{:mlb_13:} 홈런 {:unknown:}',
            extras: JSON.stringify({ emojis: { mlb_13: `${B}/13.png` } }),
        }))!;
        expect(toChatInfo(c).textContents).toEqual(['홈런 {:unknown:}']);
    });

    it('이모지만 있는 채팅은 textContents가 비어 있다', () => {
        expect(stripEmojiTokens('{:a:}{:b:}', { a: '1', b: '2' })).toBe('');
    });

    it('인증 마크는 URL이 주어질 때만 배지로 추가', () => {
        const c = normalizeChzzkMessage(liveBdy({}, profile({ verifiedMark: true })))!;
        expect(toChatInfo(c).badges).toEqual([]);
        expect(toChatInfo(c, 'verified.png').badges).toEqual(['verified.png']);
    });

    it('unavailable을 채우지 않는다 — 모든 필드가 구조화된 원본에서 온다', () => {
        const info = toChatInfo(normalizeChzzkMessage(liveBdy())!);
        expect(info.unavailable).toBeUndefined();
        expect(info).toMatchObject({ nickName: '시청자', loginName: '시청자', channelId: 'ch1' });
    });
});

describe('resolveNicknameColor — host 닉네임 컴포넌트 재현', () => {
    const table = {
        hashPalette: { light: ['#L0', '#L1', '#L2'], dark: ['#D0', '#D1', '#D2'] },
        codes: {
            CC001: { light: '#CCL', dark: '#CCD' },
            CD001: { dark: '#CDD' },
            SG001: { light: '#GL', dark: '#GD', effect: { type: 'gradient' as const, lightEnd: '#GLE', darkEnd: '#GDE' } },
            SH001: { light: '#HL', dark: '#HD', effect: { type: 'highlight' as const, lightBg: '#HLB', darkBg: '#HDB' } },
            SS001: { light: '#FFFFFF00', dark: '#00000000', effect: { type: 'stealth' as const } },
        },
    };
    const base = { uid: 'a', anonymous: false, chatChannelId: 'b' };

    it('표에 있는 코드면 그 색', () => {
        expect(resolveNicknameColor({ ...base, nicknameColorCode: 'CC001' }, table)).toEqual({ light: '#CCL', dark: '#CCD' });
    });

    it('라이트 값이 없으면 다크 값으로 채운다', () => {
        expect(resolveNicknameColor({ ...base, nicknameColorCode: 'CD001' }, table)).toEqual({ light: '#CDD', dark: '#CDD' });
    });

    it('표에 없는 코드(CC000)는 uid + chatChannelId 글자 코드 합으로 해시 팔레트', () => {
        // 'a'(97) + 'b'(98) = 195, 195 % 3 = 0
        expect(resolveNicknameColor({ ...base, nicknameColorCode: 'CC000' }, table)).toEqual({ light: '#L0', dark: '#D0' });
    });

    it('SG 그라데이션: 시작색 + 끝색', () => {
        expect(resolveNicknameColor({ ...base, nicknameColorCode: 'SG001' }, table)).toEqual({
            light: '#GL', dark: '#GD', effect: { type: 'gradient', lightEnd: '#GLE', darkEnd: '#GDE' },
        });
    });

    it('SH 하이라이트: 글자색 + 배경색', () => {
        expect(resolveNicknameColor({ ...base, nicknameColorCode: 'SH001' }, table).effect)
            .toEqual({ type: 'highlight', lightBg: '#HLB', darkBg: '#HDB' });
    });

    it('SS 스텔스: 투명 글자', () => {
        expect(resolveNicknameColor({ ...base, nicknameColorCode: 'SS001' }, table)).toMatchObject({ dark: '#00000000', effect: { type: 'stealth' } });
    });

    it('칭호 색이 최우선 — 코드와 꾸미기를 무시한다', () => {
        expect(resolveNicknameColor({ ...base, nicknameColorCode: 'SG001', titleColor: '#T' }, table)).toEqual({ light: '#T', dark: '#T' });
    });

    it('익명은 uid 대신 빈 문자열로 해시', () => {
        // 'b'(98) % 3 = 2
        expect(resolveNicknameColor({ ...base, uid: 'anonymous', anonymous: true }, table).dark).toBe('#D2');
    });

    it('기본 표(v2 API + 번들 추출본)에 꾸미기 코드가 들어 있다', () => {
        expect(resolveNicknameColor({ ...base, nicknameColorCode: 'CC001' }).dark).toMatch(/^#[0-9A-F]{6}$/i);
        expect(resolveNicknameColor({ ...base, nicknameColorCode: 'SG001' }).effect?.type).toBe('gradient');
        expect(resolveNicknameColor({ ...base, nicknameColorCode: 'SH004' }).effect?.type).toBe('highlight');
        expect(resolveNicknameColor({ ...base, nicknameColorCode: 'SS001' }).effect?.type).toBe('stealth');
    });

    it('정규화 결과에 chatChannelId가 들어간다 (live bdy의 cid)', () => {
        expect(normalizeChzzkMessage(liveBdy())!.chatChannelId).toBe('CID');
    });
});

describe('withEncodedVariants — HTML 경로의 <img src> 형태 맞추기', () => {
    it('한글 경로는 원본 + 퍼센트 인코딩 형태 둘 다', () => {
        const raw = 'https://ssl.pstatic.net/static/nng/glive/icon/디지털뱃지_유니.png';
        expect(withEncodedVariants([raw])).toEqual([
            raw,
            'https://ssl.pstatic.net/static/nng/glive/icon/%EB%94%94%EC%A7%80%ED%84%B8%EB%B1%83%EC%A7%80_%EC%9C%A0%EB%8B%88.png',
        ]);
    });

    it('ASCII URL은 그대로 하나', () => {
        expect(withEncodedVariants([`${B}/fan.png`])).toEqual([`${B}/fan.png`]);
    });

    it('URL이 아닌 값은 원본만', () => {
        expect(withEncodedVariants(['not a url'])).toEqual(['not a url']);
    });

    it('toChatInfo 배지에 반영된다', () => {
        const c = normalizeChzzkMessage(liveBdy({}, profile({
            viewerBadges: [{ badge: { scope: 'CHANNEL', imageUrl: 'https://x.net/배지.png' } }],
        })))!;
        expect(toChatInfo(c).badges).toEqual(['https://x.net/배지.png', 'https://x.net/%EB%B0%B0%EC%A7%80.png']);
    });
});

describe('블라인드 이벤트 (94008)', () => {
    const blind = (bdy: Record<string, unknown>) => ({ cmd: 94008, bdy: {
        serviceId: 'game', channelId: 'CID', messageTime: 1700000000000, userId: 'u1', blindUserId: null, message: null, ...bdy,
    } });

    it('실측 모양 → 채팅 id와 blindType', () => {
        expect(parseChzzkBlindEvent(blind({ blindType: 'HIDDEN' }))).toEqual({ id: 'u1_1700000000000', blindType: 'HIDDEN' });
    });

    it('해제(CANCEL)는 원문과 이모지를 함께 꺼낸다', () => {
        const ev = parseChzzkBlindEvent(blind({
            blindType: 'CANCEL',
            message: { content: '되살아남 {:a:}', extras: JSON.stringify({ emojis: { a: 'a.png' } }) },
        }))!;
        expect(ev.message).toEqual({ content: '되살아남 {:a:}', emojis: { a: 'a.png' } });
    });

    it('94008이 아니거나 대상이 불완전하면 null', () => {
        expect(parseChzzkBlindEvent({ cmd: 93101, bdy: [] })).toBeNull();
        expect(parseChzzkBlindEvent(blind({ blindType: 'BLIND', userId: '' }))).toBeNull();
        expect(parseChzzkBlindEvent(blind({ blindType: 'BLIND', messageTime: 0 }))).toBeNull();
    });

    it('적용: 블라인드는 상태만 바꾸고 원문은 유지 (필터 판정은 원문 기준)', () => {
        const c = normalizeChzzkMessage(liveBdy())!;
        const next = applyBlindEvent(c, { id: c.id, blindType: 'CBOTBLIND' });
        expect(next.status).toBe('CBOTBLIND');
        expect(next.message).toBe(c.message);
        expect(c.status).toBe('NORMAL');
    });

    it('적용: 해제는 NORMAL + 원문 복원', () => {
        const c = { ...normalizeChzzkMessage(liveBdy())!, status: 'BLIND' };
        const next = applyBlindEvent(c, { id: c.id, blindType: 'CANCEL', message: { content: '원문', emojis: {} } });
        expect(next).toMatchObject({ status: 'NORMAL', message: '원문' });
    });
});

describe('다시보기 REST 응답', () => {
    const vodItem = (over: Record<string, unknown> = {}) => ({
        chatChannelId: 'CID', messageTime: 1700000000000, userIdHash: 'u1', content: '다시보기',
        extras: JSON.stringify({ emojis: {} }), messageTypeCode: 1, messageStatusType: 'NORMAL',
        profile: JSON.stringify(profile({ nickname: 'vod' })), playerMessageTime: 600038, ...over,
    });

    it('previousVideoChats + videoChats를 정규화', () => {
        const chats = parseVodChatResponse({ code: 200, content: {
            nextPlayerMessageTime: 646521,
            previousVideoChats: [vodItem({ userIdHash: 'p' })],
            videoChats: [vodItem(), vodItem({ messageTypeCode: 30, userIdHash: 's' })],
        } });
        expect(chats.map(c => c.id)).toEqual(['p_1700000000000', 'u1_1700000000000']);
        expect(chats[1]).toMatchObject({ playerTime: 600038, chatChannelId: 'CID', nickname: 'vod' });
    });

    it('모양이 다르면 빈 배열', () => {
        expect(parseVodChatResponse(null)).toEqual([]);
        expect(parseVodChatResponse({ content: null })).toEqual([]);
        expect(parseVodChatResponse({ content: { videoChats: 'x' } })).toEqual([]);
    });

    it('주소 판별', () => {
        expect(VOD_CHATS_URL.test('https://api.chzzk.naver.com/service/v1/videos/15594358/chats?playerMessageTime=0')).toBe(true);
        expect(VOD_CHATS_URL.test('https://api.chzzk.naver.com/service/v1/videos/15594358/chats')).toBe(true);
        expect(VOD_CHATS_URL.test('https://api.chzzk.naver.com/service/v1/videos/15594358/chats-config')).toBe(false);
        expect(VOD_CHATS_URL.test('https://api.chzzk.naver.com/service/v1/videos/15594358')).toBe(false);
    });
});
