import type { ChatInfo } from "@/interfaces/chat";
import nicknameColors from "./chzzk-nickname-colors.json";

/**
 * 치지직 채팅 프로토콜 → 정규화된 채팅 객체.
 *
 * HTML(selector/class hash)에 의존하지 않는 수집 경로의 핵심. 입력은 세 가지 모양이다:
 *  - live 소켓 `cmd 93101/93102` 의 `bdy[]`        (uid, msgTime, msg, msgTypeCode …)
 *  - live 소켓 `cmd 15101` 의 `bdy.messageList[]` (userId, messageTime, content …)
 *  - VOD REST `/videos/{no}/chats` 의 항목          (userIdHash, messageTime, playerMessageTime …)
 *
 * 치지직 번들의 `messageConverter`도 같은 세 모양을 같은 기준으로 분기한다.
 * 이 파일은 MAIN world(소켓 탭)와 ISOLATED(Adapter) 양쪽에서 import되므로
 * DOM/브라우저 API를 쓰지 않는다.
 */

/** 소켓 command 번호 중 우리가 다루는 것. */
export const CHZZK_CMD = {
    PING: 0,
    PONG: 10000,
    CONNECTED: 10100,
    RECENT_CHAT: 15101,
    CHAT: 93101,
    DONATION: 93102,
    BLIND: 94008,
} as const;

/** msgTypeCode. 치지직 번들의 enum(`Bg`) 중 서버가 보내는 값 (2026-10 확인). */
export const CHZZK_MSG_TYPE = {
    TEXT: 1,
    DONATION: 10,
    SUBSCRIPTION: 11,
    SUBSCRIPTION_GIFT: 12,
    PARTY: 13,
    STREAMER_SHOP_PURCHASE: 15,
    SYSTEM: 30,
} as const;

export interface ChzzkSocketChat {
    /** 중복 제거용 안정 키 — `${uid}_${time}`. host DOM의 chatMessage.key는 이 값 + `_랜덤`. */
    id: string;
    uid: string;
    /** ms epoch. */
    time: number;
    /** VOD 전용 — 영상 내 재생 위치(ms). */
    playerTime?: number;
    /** msgTypeCode 원본. CHZZK_MSG_TYPE 참고. */
    type: number;
    /** NORMAL / BLIND / CBOTBLIND (번들 enum `Oy`). 원본 문자열 그대로. */
    status: string;
    nickname: string;
    /** 익명 후원 등 프로필이 없는 채팅. */
    anonymous: boolean;
    /** 원본 메시지. 이모지는 `{:name:}` 토큰 그대로. */
    message: string;
    /** 이모지 토큰 이름 → 이미지 URL. */
    emojis: Record<string, string>;
    /** host가 닉네임 옆에 그리는 순서 그대로의 배지 이미지 URL. 인증 마크는 별도(verified). */
    badges: string[];
    verified: boolean;
    userRoleCode: string;
    /** 닉네임 색 코드 (예: "CC000"). 실제 색은 host의 colorMap에 있어 여기선 코드만. */
    nicknameColorCode?: string;
    /** 칭호 색 — 있으면 host가 닉네임 색보다 우선 적용. */
    titleColor?: string;
    channelId?: string;
    /** 채팅 채널 id (예: "N2nQQh"). 닉네임 해시 색 계산에 쓰인다. */
    chatChannelId?: string;
    /** 후원 금액 등 extras 원본. 렌더러가 필요한 걸 꺼내 쓴다. */
    extras: Record<string, unknown>;
}

type Json = Record<string, any>;

function parseMaybeJson(v: unknown): Json | null {
    if (v && typeof v === 'object') return v as Json;
    if (typeof v !== 'string' || !v) return null;
    try {
        const parsed = JSON.parse(v);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * 치지직 번들의 `tv(profile)`(displayBadgeList 생성)을 그대로 옮긴 것.
 * 순서: 역할 → 실시간 후원 랭킹 → 구독 → viewerBadges(없으면 activityBadges).
 * host DOM에 그려지는 `displayBadgeList[].imageSource`와 같은 값·순서여야
 * 기존에 저장된 배지 필터(이미지 URL)가 그대로 동작한다.
 */
export function deriveDisplayBadges(profile: Json | null): string[] {
    if (!profile) return [];
    const out: string[] = [];
    const sp = profile.streamingProperty;

    if (profile.badge) out.push(profile.badge.imageUrl || '');
    if (sp?.realTimeDonationRanking) out.push(sp.realTimeDonationRanking.badge?.imageUrl || '');
    if (sp?.subscription) out.push(sp.subscription.badge?.imageUrl || '');

    if (Array.isArray(profile.viewerBadges)) {
        const list: Json[] = profile.viewerBadges;
        // 첫 항목에 activatedV2 필드가 있을 때만 그걸로 거른다 (host 로직 동일).
        const active = list.length > 0 && 'activatedV2' in list[0]
            ? list.filter(b => b.activatedV2)
            : [...list];
        active.sort((a, b) => a.badge?.scope === b.badge?.scope
            ? (a.order ?? 0) - (b.order ?? 0)
            : a.badge?.scope === 'CHANNEL' ? -1 : 1);
        out.push(...active.map(b => b.badge?.imageUrl || ''));
    } else if (Array.isArray(profile.activityBadges)) {
        out.push(...profile.activityBadges.filter((b: Json) => b?.activated).map((b: Json) => b?.imageUrl || ''));
    }

    // host는 빈 imageSource도 항목으로 두지만(깨진 img), 필터 입장에선 의미 없는 값.
    return out.filter(Boolean);
}

/** 세 가지 입력 모양 중 하나를 정규화. 채팅으로 볼 수 없으면 null. */
export function normalizeChzzkMessage(raw: unknown): ChzzkSocketChat | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Json;

    let uid: unknown, time: unknown, type: unknown, status: unknown, message: unknown;
    if (r.msgTime > 0) {
        // live 소켓 93101/93102
        uid = r.uid; time = r.msgTime; type = r.msgTypeCode; status = r.msgStatusType; message = r.msg;
    } else if (r.messageTime > 0) {
        // 15101 recent(userId) / VOD REST(userIdHash)
        uid = r.userId ?? r.userIdHash; time = r.messageTime; type = r.messageTypeCode;
        status = r.messageStatusType; message = r.content;
    } else {
        return null;
    }
    if (typeof uid !== 'string' || !uid) return null;

    // live bdy: cid / 15101: channelId / VOD: chatChannelId — 모두 채팅 채널 id.
    const chatChannelId = [r.cid, r.chatChannelId, r.channelId].find((v): v is string => typeof v === 'string' && !!v);
    const profile = parseMaybeJson(r.profile);
    const extras = parseMaybeJson(r.extras) ?? {};
    const emojis = (extras.emojis && typeof extras.emojis === 'object') ? extras.emojis as Record<string, string> : {};

    return {
        id: `${uid}_${time}`,
        uid,
        time: Number(time),
        ...(typeof r.playerMessageTime === 'number' ? { playerTime: r.playerMessageTime } : {}),
        type: Number(type) || 0,
        status: typeof status === 'string' ? status : 'NORMAL',
        nickname: typeof profile?.nickname === 'string' ? profile.nickname : '',
        anonymous: !profile || uid === 'anonymous' || extras.isAnonymous === true,
        message: typeof message === 'string' ? message : '',
        emojis,
        badges: deriveDisplayBadges(profile),
        verified: profile?.verifiedMark === true,
        userRoleCode: typeof profile?.userRoleCode === 'string' ? profile.userRoleCode : '',
        ...(profile?.streamingProperty?.nicknameColor?.colorCode
            ? { nicknameColorCode: profile.streamingProperty.nicknameColor.colorCode } : {}),
        ...(profile?.title?.color ? { titleColor: profile.title.color } : {}),
        ...(typeof extras.streamingChannelId === 'string' ? { channelId: extras.streamingChannelId } : {}),
        ...(chatChannelId ? { chatChannelId } : {}),
        extras,
    };
}

/** 소켓 패킷 하나에서 채팅들을 꺼낸다. 채팅 패킷이 아니면 빈 배열. */
export function parseChzzkPacket(packet: unknown): ChzzkSocketChat[] {
    if (!packet || typeof packet !== 'object') return [];
    const p = packet as Json;
    let items: unknown[] = [];
    if (p.cmd === CHZZK_CMD.CHAT || p.cmd === CHZZK_CMD.DONATION) {
        items = Array.isArray(p.bdy) ? p.bdy : [];
    } else if (p.cmd === CHZZK_CMD.RECENT_CHAT) {
        items = Array.isArray(p.bdy?.messageList) ? p.bdy.messageList : [];
    }
    return items.map(normalizeChzzkMessage).filter((c): c is ChzzkSocketChat =>
        // SYSTEM(30)은 임시 제한 같은 운영 알림 — host는 extras.visibleRoles(매니저 등)에게만
        // 보여주고 작성자 개념도 없다(닉네임 빈 profile). 채팅 수집 대상이 아니다.
        c !== null && c.type !== CHZZK_MSG_TYPE.SYSTEM);
}

/** 다시보기 채팅 REST 주소 — `/service/v1/videos/{videoNo}/chats?playerMessageTime=…`. */
export const VOD_CHATS_URL = /\/service\/v1\/videos\/(\d+)\/chats(?:\?|$)/;

/**
 * 다시보기 채팅 REST 응답(`{content: {previousVideoChats, videoChats, nextPlayerMessageTime}}`)의 채팅들.
 * 치지직은 재생 위치 기준 약 45초 분량을 미리 받아 두고 재생에 맞춰 하나씩 그린다.
 * 다시보기 host key는 `${userIdHash}_${messageTime}`이라 채팅 id와 그대로 같다(라이브와 달리 랜덤 꼬리 없음).
 */
export function parseVodChatResponse(body: unknown): ChzzkSocketChat[] {
    const content = (body as Json | null)?.content;
    if (!content || typeof content !== 'object') return [];
    const items = [
        ...(Array.isArray(content.previousVideoChats) ? content.previousVideoChats : []),
        ...(Array.isArray(content.videoChats) ? content.videoChats : []),
    ];
    return items.map(normalizeChzzkMessage).filter((c): c is ChzzkSocketChat =>
        c !== null && c.type !== CHZZK_MSG_TYPE.SYSTEM);
}

/**
 * 94008 블라인드 이벤트 — 이미 올라온 채팅을 나중에 가리거나(BLIND/HIDDEN/CBOTBLIND/
 * RECLAIM/FILTERED) 가린 것을 푼다(CANCEL). 대상은 `${userId}_${messageTime}` = 채팅 id.
 * 해제 시에는 원문이 `message.{content, extras}`로 함께 온다 (번들 notiBlindListener).
 */
export interface ChzzkBlindEvent {
    id: string;
    blindType: string;
    message?: { content: string; emojis: Record<string, string> };
}

export function parseChzzkBlindEvent(packet: unknown): ChzzkBlindEvent | null {
    if (!packet || typeof packet !== 'object') return null;
    const p = packet as Json;
    if (p.cmd !== CHZZK_CMD.BLIND || !p.bdy || typeof p.bdy !== 'object') return null;
    const { userId, messageTime, blindType, message } = p.bdy as Json;
    if (typeof userId !== 'string' || !userId || !(messageTime > 0) || typeof blindType !== 'string') return null;
    const extras = parseMaybeJson(message?.extras);
    return {
        id: `${userId}_${messageTime}`,
        blindType,
        ...(typeof message?.content === 'string' ? {
            message: {
                content: message.content,
                emojis: extras?.emojis && typeof extras.emojis === 'object' ? extras.emojis : {},
            },
        } : {}),
    };
}

/** 블라인드 이벤트를 채팅에 적용한 새 채팅. host와 같이 CANCEL이면 원문을 되돌리고, 아니면 상태만 바꾼다. */
export function applyBlindEvent(chat: ChzzkSocketChat, ev: ChzzkBlindEvent): ChzzkSocketChat {
    if (ev.blindType === 'CANCEL') {
        return {
            ...chat,
            status: 'NORMAL',
            ...(ev.message ? { message: ev.message.content, emojis: ev.message.emojis } : {}),
        };
    }
    return { ...chat, status: ev.blindType };
}

/** `{:name:}` 이모지 토큰을 지운 순수 텍스트. HTML 경로에서 이모지는 <img>라 textContent에 안 잡히는 것과 맞춘다. */
export function stripEmojiTokens(message: string, emojis: Record<string, string>): string {
    return message.replace(/\{:([^:{}]+):\}/g, (tok, name) => (name in emojis ? '' : tok)).trim();
}

/**
 * 배지 URL에 브라우저가 정규화한 형태(퍼센트 인코딩)를 함께 붙인다.
 *
 * 소켓은 `.../디지털뱃지_유니.png`처럼 한글을 그대로 보내는데, HTML 경로는 같은 배지를
 * React props(한글 그대로)와 `<img src>`(브라우저가 `%EB%94%94…`로 인코딩) 두 형태로
 * 함께 갖고 있다. 저장된 배지 필터가 어느 쪽 형태든 기존과 똑같이 매칭되도록 소켓 경로도
 * 두 형태를 다 내보낸다 (shadow 비교에서 실측).
 */
export function withEncodedVariants(urls: string[]): string[] {
    const out = new Set<string>();
    for (const u of urls) {
        out.add(u);
        try { out.add(new URL(u).href); } catch { /* URL이 아니면 원본만 */ }
    }
    return [...out];
}

/**
 * Filter Group 평가용 ChatInfo. HTML 경로와 달리 모든 필드가 구조화된 원본에서
 * 오므로 `unavailable`은 채우지 않는다.
 *
 * @param verifiedBadgeUrl 인증 마크를 배지로 취급할 때 쓸 URL (OTA constants).
 */
export function toChatInfo(chat: ChzzkSocketChat, verifiedBadgeUrl?: string): ChatInfo {
    const badges = withEncodedVariants(chat.badges);
    if (chat.verified && verifiedBadgeUrl) badges.push(verifiedBadgeUrl);
    const text = stripEmojiTokens(chat.message, chat.emojis);
    return {
        badges,
        textContents: text ? [text] : [],
        loginName: chat.nickname,
        nickName: chat.nickname,
        ...(chat.channelId ? { channelId: chat.channelId } : {}),
    };
}

/** 2단계 구독자 닉네임 꾸미기 (v2 API `effectType`). */
export type NicknameEffect =
    | { type: 'gradient'; lightEnd: string; darkEnd: string }   // SG — 글자에 시작색→끝색
    | { type: 'highlight'; lightBg: string; darkBg: string }    // SH — 글자 뒤 배경색
    | { type: 'stealth' };                                       // SS — 투명 글자

export interface NicknameColor {
    light: string;
    dark: string;
    effect?: NicknameEffect;
}

interface NicknameColorTable {
    hashPalette: { light: string[]; dark: string[] };
    codes: Record<string, { light?: string; dark?: string; effect?: NicknameEffect }>;
}

/**
 * 치지직이 채팅 닉네임을 그릴 때의 색 결정(번들 닉네임 컴포넌트)을 옮긴 것.
 *  1. 칭호 색이 있으면 그것 — 코드와 꾸미기를 모두 무시한다.
 *  2. colorCode가 표에 있으면 그 색과 꾸미기(SG 그라데이션, SH 하이라이트, SS 투명).
 *     표: v2 `/nickname/color/codes`(CC·SG·SH·SS) + 번들 내장 CD 코드. 그리는 단계에선
 *     스트리머·매니저 예외가 없다(`makeMessage`의 역할 예외는 표에 없는 코드일 때만 의미가 있다).
 *  3. 없으면(실측 87%가 표에 없는 CC000) userIdHash + chatChannelId 글자 코드 합으로
 *     40색 해시 팔레트.
 */
export function resolveNicknameColor(
    chat: Pick<ChzzkSocketChat, 'uid' | 'anonymous' | 'nicknameColorCode' | 'titleColor' | 'chatChannelId'>,
    table: NicknameColorTable = nicknameColors as NicknameColorTable,
): NicknameColor {
    if (chat.titleColor) return { light: chat.titleColor, dark: chat.titleColor };

    const hit = chat.nicknameColorCode ? table.codes[chat.nicknameColorCode] : undefined;
    if (hit?.dark) {
        return { light: hit.light ?? hit.dark, dark: hit.dark, ...(hit.effect ? { effect: hit.effect } : {}) };
    }

    // host는 익명 후원에 userIdHash ''인 가짜 profile을 쓴다.
    const seed = (chat.anonymous ? '' : chat.uid) + (chat.chatChannelId ?? '');
    let sum = 0;
    for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
    const { light, dark } = table.hashPalette;
    return { light: light[sum % light.length], dark: dark[sum % dark.length] };
}
