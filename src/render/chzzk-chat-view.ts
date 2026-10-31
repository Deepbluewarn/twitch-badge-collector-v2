import { CHZZK_MSG_TYPE, resolveNicknameColor, type ChzzkSocketChat, type NicknameColor } from "@/platform/chzzk-socket";
import { verifiedMarkUrl } from "@/platform/chzzk-verified";
import { escapeHtml } from "./template";
import { msToTime } from "@/utils/utils-common";

/**
 * 소켓 채팅 → 템플릿에 넣을 값(뷰 모델). 템플릿 편집 페이지에서 쓸 수 있는 필드 목록이
 * 곧 이 인터페이스다. 필드를 바꾸면 사용자 템플릿이 깨질 수 있으니 추가만 하는 걸 원칙으로.
 *
 * DOM을 쓰지 않는 순수 모듈.
 */

export type ChzzkChatKind = 'chat' | 'donation' | 'subscription' | 'gift';

export interface ChzzkChatView {
    kind: ChzzkChatKind;
    nickname: string;
    anonymous: boolean;
    /** 원문 (이모지 토큰 포함). */
    message: string;
    /**
     * 화면용 본문 HTML — 텍스트는 escape, 이모지는 <img>. 클린봇·블라인드 처리가
     * 여기 들어 있어서 어떤 템플릿을 써도 가리기가 빠지지 않는다. `{{{messageHtml}}}`.
     */
    messageHtml: string;
    hasMessage: boolean;
    badges: { url: string }[];
    verified: boolean;
    /** 인증 마크 이미지 — 인증 사용자일 때만. */
    verifiedIconUrl?: string;
    /** "14:05" 같은 표시용 시각. 다시보기는 영상 안의 위치("12:34", "1:02:03"). */
    time: string;
    /** ms epoch. */
    timestamp: number;
    nickColorLight: string;
    nickColorDark: string;
    /**
     * 2단계 구독자 닉네임 꾸미기: 'gradient'(SG) / 'highlight'(SH) / 'stealth'(SS) / ''(없음).
     * 기본 템플릿은 `tbc-chat-nick--{{nickEffect}}` 클래스로 CSS에 넘긴다.
     */
    nickEffect: '' | 'gradient' | 'highlight' | 'stealth';
    /**
     * 닉네임 색 CSS 변수 묶음 — style 속성에 그대로 넣는다. 꾸미기에 필요한 끝색·배경색까지 담긴다.
     * 예: `--tbc-nick-light:#ECB21B;--tbc-nick-dark:#F3E659;--tbc-nick-light-end:#FF6D65;…`
     */
    nickStyle: string;
    cleanbot: boolean;
    blinded: boolean;
    isChat: boolean;
    isDonation: boolean;
    isSubscription: boolean;
    isGift: boolean;
    /**
     * amountText는 "1,000치즈", amountNumber는 단위 없이 "1,000" (기본 템플릿은 치즈 아이콘 옆에 쓴다).
     * level은 금액 단계 0~4 (donationLevel) — 금액이 없으면 없다. 금액별 모양은 HTML에서 이걸로.
     */
    donation?: { amount: number; amountText: string; amountNumber: string; level?: number; mission: boolean; missionText?: string };
    subscription?: { month: number; tierName: string };
    /**
     * 구독권 선물 (type 12). 실측(2026-10-11)상 두 갈래로 온다:
     *  - 채널 선물(toChannel): 보낸 사람 프로필 + quantity
     *  - 받은 사람 알림: 받는 사람마다 한 건씩, 보낸 사람은 익명(프로필 없음) + receiverNickname
     * tierName은 채널의 구독 등급 이름("○○이 구독권"의 ○○).
     */
    gift?: { toChannel: boolean; quantity: number; tierName: string; receiverNickname: string };
}

/** 뷰 모델 안의 날 HTML 필드 — compileTemplate의 rawAllowed. */
export const CHZZK_VIEW_RAW_FIELDS = ['messageHtml'] as const;

export interface ChzzkViewLabels {
    anonymous: string;
    cleanbot: string;
    blinded: string;
    currency: string;
}

export const DEFAULT_LABELS: ChzzkViewLabels = {
    anonymous: '익명의 후원자',
    cleanbot: '클린봇이 부적절한 표현을 감지했습니다',
    blinded: '블라인드 처리된 메시지입니다',
    currency: '치즈',
};

export interface ChzzkViewOptions {
    labels?: Partial<ChzzkViewLabels>;
    formatTime?: (ms: number) => string;
}

const defaultFormatTime = (ms: number) =>
    new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });

/** 텍스트는 escape, 이모지 토큰은 <img>. 모르는 토큰은 글자 그대로 둔다(host와 동일). */
export function messageToHtml(message: string, emojis: Record<string, string>): string {
    let out = '';
    let last = 0;
    for (const m of message.matchAll(/\{:([^:{}]+):\}/g)) {
        const url = emojis[m[1]];
        if (!url) continue;
        out += escapeHtml(message.slice(last, m.index));
        out += `<img class="tbc-chat-emoji" src="${escapeHtml(url)}" alt="${escapeHtml(m[1])}">`;
        last = m.index! + m[0].length;
    }
    return out + escapeHtml(message.slice(last));
}

function nickStyleOf(c: NicknameColor): string {
    const vars: [string, string][] = [['light', c.light], ['dark', c.dark]];
    if (c.effect?.type === 'gradient') vars.push(['light-end', c.effect.lightEnd], ['dark-end', c.effect.darkEnd]);
    if (c.effect?.type === 'highlight') vars.push(['light-bg', c.effect.lightBg], ['dark-bg', c.effect.darkBg]);
    // 값은 API·번들 색 문자열이지만, 템플릿에서 escape되더라도 속성을 벗어나지 못하게 색 모양만 통과시킨다.
    return vars.filter(([, v]) => /^[#a-zA-Z0-9(),.\s%]+$/.test(v)).map(([k, v]) => `--tbc-nick-${k}:${v}`).join(';');
}

/**
 * 후원 카드 색 단계 — host 번들의 후원 채팅 규칙과 같다 (1만 미만 0, 10만 미만 1, 50만 미만 2,
 * 100만 미만 3, 그 위 4). 금액이 없으면 null(회색 카드).
 */
export function donationLevel(amount: number): number | null {
    if (!(amount > 0)) return null;
    return amount < 1e4 ? 0 : amount < 1e5 ? 1 : amount < 5e5 ? 2 : amount < 1e6 ? 3 : 4;
}

export function kindOf(type: number): ChzzkChatKind {
    if (type === CHZZK_MSG_TYPE.DONATION) return 'donation';
    if (type === CHZZK_MSG_TYPE.SUBSCRIPTION) return 'subscription';
    if (type === CHZZK_MSG_TYPE.SUBSCRIPTION_GIFT) return 'gift';
    return 'chat';
}

export function toChzzkChatView(chat: ChzzkSocketChat, opts: ChzzkViewOptions = {}): ChzzkChatView {
    const labels = { ...DEFAULT_LABELS, ...opts.labels };
    const kind = kindOf(chat.type);
    const color = resolveNicknameColor(chat);

    // 클린봇: 기본으로 가리고 클릭하면 원문을 이탤릭으로 (2026-10-10 결정).
    // Container는 sanitize → JSX 변환을 거쳐 이벤트 핸들러가 남지 않으므로 <details>로 CSS만으로 동작시킨다.
    // 운영자 블라인드(BLIND 등)는 원문을 볼 수 없다 (host와 동일).
    const body = messageToHtml(chat.message, chat.emojis);
    const cleanbot = chat.status === 'CBOTBLIND';
    const blinded = chat.status !== 'NORMAL' && !cleanbot;
    const messageHtml = blinded
        ? `<span class="tbc-chat-blinded">${escapeHtml(labels.blinded)}</span>`
        : cleanbot
            ? `<details class="tbc-chat-cleanbot"><summary>${escapeHtml(labels.cleanbot)}</summary><i>${body}</i></details>`
            : body;

    const x = chat.extras as Record<string, any>;
    const amount = Number(x.payAmount) || 0;
    const level = donationLevel(amount);

    return {
        kind,
        nickname: chat.anonymous ? labels.anonymous : chat.nickname,
        anonymous: chat.anonymous,
        message: chat.message,
        messageHtml,
        hasMessage: chat.message.trim().length > 0,
        badges: chat.badges.map(url => ({ url })),
        verified: chat.verified,
        // 마크 종류(파트너, 챌린저, 공식)에 맞는 그림 — host와 같은 이미지
        ...(chat.verified ? { verifiedIconUrl: verifiedMarkUrl(chat.verifiedMarkType) } : {}),
        time: chat.playerTime !== undefined ? msToTime(chat.playerTime) : (opts.formatTime ?? defaultFormatTime)(chat.time),
        timestamp: chat.time,
        nickColorLight: color.light,
        nickColorDark: color.dark,
        nickEffect: color.effect?.type ?? '',
        nickStyle: nickStyleOf(color),
        cleanbot,
        blinded,
        isChat: kind === 'chat',
        isDonation: kind === 'donation',
        isSubscription: kind === 'subscription',
        isGift: kind === 'gift',
        ...(kind === 'donation' ? {
            donation: {
                amount,
                amountText: `${amount.toLocaleString('ko-KR')}${labels.currency}`,
                amountNumber: amount.toLocaleString('ko-KR'),
                ...(level !== null ? { level } : {}),
                mission: x.donationType === 'MISSION',
                ...(typeof x.missionText === 'string' ? { missionText: x.missionText } : {}),
            },
        } : {}),
        ...(kind === 'subscription' ? {
            subscription: { month: Number(x.month) || 0, tierName: typeof x.tierName === 'string' ? x.tierName : '' },
        } : {}),
        ...(kind === 'gift' ? {
            gift: {
                toChannel: x.giftType === 'SUBSCRIPTION_GIFT',
                quantity: Number(x.quantity) || 0,
                tierName: typeof x.giftTierName === 'string' ? x.giftTierName : '',
                receiverNickname: typeof x.receiverNickname === 'string' ? x.receiverNickname : '',
            },
        } : {}),
    };
}
