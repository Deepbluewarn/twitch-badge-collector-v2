import type { ChzzkChatKind } from "./chzzk-chat-view";

/**
 * 치지직 채팅 템플릿 본문 — 기본 템플릿과, 설정 페이지의 "모양" 선택지가 만드는 템플릿.
 *
 * 모양(TemplateLook)을 고르면 네 종류 템플릿을 한 번에 만든다. 저장소엔 결과 문자열만
 * 들어간다 — 모양은 저장하지 않고 detectLook으로 문자열에서 거꾸로 알아낸다. 그래서 사용자가
 * 직접 고친 템플릿과 모양 선택이 서로 다른 값을 갖는 일이 없다.
 */

export type ChzzkTemplates = Record<ChzzkChatKind, string>;

export interface TemplateLook {
    /** 일반 채팅 배치. 후원·구독·선물 카드는 배치와 상관없이 같다. */
    layout: 'inline' | 'stacked' | 'bubble';
    badges: boolean;
    size: 'normal' | 'large';
}

export const LOOK_LAYOUTS = ['inline', 'stacked', 'bubble'] as const;
export const LOOK_SIZES = ['normal', 'large'] as const;
export const DEFAULT_LOOK: TemplateLook = { layout: 'inline', badges: true, size: 'normal' };

const indent = (s: string) => s.split('\n').map(l => `    ${l}`).join('\n');

/** 이름 앞 공통 부분: 시각 · 배지 · 닉네임 · 인증 마크. */
function head(badges: boolean) {
    return `<span class="tbcv2-chat-time">{{time}}</span>
${badges ? `{{#badges}}
    <img class="tbc-chat-badge" src="{{url}}" alt="">
{{/badges}}
` : ''}<span class="tbc-chat-nick tbc-chat-nick--{{nickEffect}}" style="{{nickStyle}}">{{nickname}}</span>
{{#verifiedIconUrl}}
    <img class="tbc-chat-verified" src="{{verifiedIconUrl}}" alt="">
{{/verifiedIconUrl}}`;
}

function chat(h: string, layout: TemplateLook['layout']) {
    if (layout === 'stacked') return `<div class="tbc-chat-line">
${indent(h)}
</div>
<div class="tbc-chat-text">{{{messageHtml}}}</div>
`;
    if (layout === 'bubble') return `<div class="tbc-chat-line">
${indent(h)}
</div>
<div class="tbc-chat-bubble">{{{messageHtml}}}</div>
`;
    return `${h}
<span class="tbc-chat-text">{{{messageHtml}}}</span>
`;
}

/** 후원 카드 — host처럼 이름 줄, 본문, 맨 아래 금액 순서. 금액이 없는 후원은 금액 줄을 뺀다. */
function donation(h: string) {
    return `<div class="tbc-chat-event-head">
${indent(h)}
</div>
{{#donation.missionText}}
    <div class="tbc-chat-mission">{{donation.missionText}}</div>
{{/donation.missionText}}
{{#hasMessage}}
    <div class="tbc-chat-text">{{{messageHtml}}}</div>
{{/hasMessage}}
{{#donation.amount}}
    <div class="tbc-chat-event-foot">
        <strong class="tbc-chat-amount tbc-chat-cheese">{{donation.amountNumber}}</strong>
    </div>
{{/donation.amount}}
`;
}

/** 2026-10-28 전의 후원 템플릿 (금액이 이름 줄 끝). 저장된 모양을 알아보고 옮기는 데만 쓴다. */
function legacyDonation(h: string) {
    return `<div class="tbc-chat-event-head">
${indent(h)}
    <strong class="tbc-chat-amount">{{donation.amountText}}</strong>
</div>
{{#donation.missionText}}
    <div class="tbc-chat-mission">{{donation.missionText}}</div>
{{/donation.missionText}}
{{#hasMessage}}
    <div class="tbc-chat-text">{{{messageHtml}}}</div>
{{/hasMessage}}
`;
}

/**
 * 모양에 맞는 네 종류 템플릿. 편집기에 그대로 보이므로 읽기 좋게 줄을 나눠 둔다 — 줄바꿈
 * 공백은 렌더 때 지워진다(stripNewlineWhitespace).
 */
export function buildTemplates(look: TemplateLook, legacy = false): ChzzkTemplates {
    const h = head(look.badges);
    const out: ChzzkTemplates = {
        chat: chat(h, look.layout),
        donation: legacy ? legacyDonation(h) : donation(h),
        subscription: `<div class="tbc-chat-event-head">
${indent(h)}
    <strong class="tbc-chat-amount">{{subscription.month}}개월 구독</strong>
    {{#subscription.tierName}}
        <span class="tbc-chat-tier">{{subscription.tierName}}</span>
    {{/subscription.tierName}}
</div>
{{#hasMessage}}
    <div class="tbc-chat-text">{{{messageHtml}}}</div>
{{/hasMessage}}
`,
        // 채널 선물은 보낸 사람 줄, 받은 사람 알림은 보낸 사람이 익명이라 받는 사람을 주어로.
        gift: `{{#gift.toChannel}}
    <div class="tbc-chat-event-head">
${indent(indent(h))}
        <strong class="tbc-chat-amount">{{gift.tierName}} 구독권 {{gift.quantity}}개 선물</strong>
    </div>
{{/gift.toChannel}}
{{^gift.toChannel}}
    <div class="tbc-chat-event-head">
        <span class="tbcv2-chat-time">{{time}}</span>
        <strong class="tbc-chat-gift-receiver">{{gift.receiverNickname}}</strong>님에게 {{gift.tierName}} 구독권 선물
    </div>
{{/gift.toChannel}}
`,
    };
    if (look.size === 'large') {
        for (const k of Object.keys(out) as ChzzkChatKind[]) {
            out[k] = `<div class="tbc-chat-large">\n${indent(out[k].trimEnd())}\n</div>\n`;
        }
    }
    return out;
}

export const DEFAULT_CHZZK_TEMPLATES: ChzzkTemplates = buildTemplates(DEFAULT_LOOK);

const ALL_LOOKS: TemplateLook[] = LOOK_LAYOUTS.flatMap(layout =>
    [true, false].flatMap(badges => LOOK_SIZES.map(size => ({ layout, badges, size }))),
);

const sameAs = (built: ChzzkTemplates, templates: ChzzkTemplates) =>
    (Object.keys(built) as ChzzkChatKind[]).every(k => built[k] === templates[k]);

/**
 * 템플릿 네 개가 어떤 모양 선택과 정확히 같으면 그 모양. 직접 고쳤으면 null.
 * 예전 후원 템플릿으로 만든 모양도 같은 모양으로 본다 — 다시 고르면 새 템플릿으로 바뀐다.
 */
export function detectLook(templates: ChzzkTemplates): TemplateLook | null {
    return ALL_LOOKS.find(look => sameAs(buildTemplates(look), templates))
        ?? ALL_LOOKS.find(look => sameAs(buildTemplates(look, true), templates))
        ?? null;
}

/** 예전 후원 템플릿으로 만든 모양이면 지금 템플릿으로 다시 만든 것, 아니면 null. */
export function upgradeLegacyLook(templates: ChzzkTemplates): ChzzkTemplates | null {
    if (ALL_LOOKS.some(look => sameAs(buildTemplates(look), templates))) return null;
    const look = ALL_LOOKS.find(look => sameAs(buildTemplates(look, true), templates));
    return look ? buildTemplates(look) : null;
}
