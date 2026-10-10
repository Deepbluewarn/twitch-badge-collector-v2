import { CHZZK_MSG_TYPE, resolveNicknameColor, type ChzzkSocketChat } from "@/platform/chzzk-socket";
import { escapeHtml } from "./template";

/**
 * 소켓 채팅 → 템플릿에 넣을 값(뷰 모델). 템플릿 편집 페이지에서 쓸 수 있는 필드 목록이
 * 곧 이 인터페이스다. 필드를 바꾸면 사용자 템플릿이 깨질 수 있으니 추가만 하는 걸 원칙으로.
 *
 * DOM을 쓰지 않는 순수 모듈.
 */

export type ChzzkChatKind = 'chat' | 'donation' | 'subscription';

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
    /** "14:05" 같은 표시용 시각. */
    time: string;
    /** ms epoch. */
    timestamp: number;
    nickColorLight: string;
    nickColorDark: string;
    cleanbot: boolean;
    blinded: boolean;
    isChat: boolean;
    isDonation: boolean;
    isSubscription: boolean;
    donation?: { amount: number; amountText: string; mission: boolean; missionText?: string };
    subscription?: { month: number; tierName: string };
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
    verifiedIconUrl?: string;
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

function kindOf(type: number): ChzzkChatKind {
    if (type === CHZZK_MSG_TYPE.DONATION) return 'donation';
    if (type === CHZZK_MSG_TYPE.SUBSCRIPTION) return 'subscription';
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

    return {
        kind,
        nickname: chat.anonymous ? labels.anonymous : chat.nickname,
        anonymous: chat.anonymous,
        message: chat.message,
        messageHtml,
        hasMessage: chat.message.trim().length > 0,
        badges: chat.badges.map(url => ({ url })),
        verified: chat.verified,
        ...(chat.verified && opts.verifiedIconUrl ? { verifiedIconUrl: opts.verifiedIconUrl } : {}),
        time: (opts.formatTime ?? defaultFormatTime)(chat.time),
        timestamp: chat.time,
        nickColorLight: color.light,
        nickColorDark: color.dark,
        cleanbot,
        blinded,
        isChat: kind === 'chat',
        isDonation: kind === 'donation',
        isSubscription: kind === 'subscription',
        ...(kind === 'donation' ? {
            donation: {
                amount,
                amountText: `${amount.toLocaleString('ko-KR')}${labels.currency}`,
                mission: x.donationType === 'MISSION',
                ...(typeof x.missionText === 'string' ? { missionText: x.missionText } : {}),
            },
        } : {}),
        ...(kind === 'subscription' ? {
            subscription: { month: Number(x.month) || 0, tierName: typeof x.tierName === 'string' ? x.tierName : '' },
        } : {}),
    };
}
