import DOMPurify from "dompurify";
import type { ChzzkSocketChat } from "@/platform/chzzk-socket";
import { CHAT_ATTR } from "@/interfaces/chat-attributes";
import { compileTemplate, type CompiledTemplate } from "./template";
import { DEFAULT_CHZZK_TEMPLATES, type ChzzkTemplates } from "./chzzk-templates";
import { CHZZK_VIEW_RAW_FIELDS, toChzzkChatView, type ChzzkChatKind, type ChzzkViewOptions } from "./chzzk-chat-view";

/**
 * 소켓 채팅 → Container에 넣을 채팅 요소.
 *
 * HTML 경로가 넘기던 원본 복제본과 같은 자리(PassedChat.clone)에 들어간다 — Container,
 * 저장(persistence), 캡처는 손대지 않는다. 그래서 루트에 같은 CHAT_ATTR을 단다.
 */

export { DEFAULT_CHZZK_TEMPLATES, type ChzzkTemplates } from "./chzzk-templates";

const cache = new Map<string, CompiledTemplate>();
function compiled(src: string): CompiledTemplate {
    let t = cache.get(src);
    if (!t) {
        t = compileTemplate(src, CHZZK_VIEW_RAW_FIELDS);
        cache.set(src, t);
    }
    return t;
}

const DANGEROUS_TAGS = 'script,style,iframe,frame,object,embed,link,meta,base,form,input,button,textarea,select,svg,math,template';
const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction', 'srcset', 'poster', 'background'];

/**
 * DOMPurify 뒤의 2차 방어. DOMPurify 결과는 파서 구현에 기대는데, 테스트 환경(happy-dom)에서는
 * 맨 앞 <script> 뒤 요소의 on* 속성이 그대로 남는 것을 확인했다. 브라우저에서는 DOMPurify만으로
 * 충분하겠지만, 사용자 템플릿이 페이지 안에서 렌더되는 경로라 어느 환경에서든 같은 결과를 보장한다.
 */
function scrub(root: Element) {
    root.querySelectorAll(DANGEROUS_TAGS).forEach(el => el.remove());
    for (const el of [root, ...root.querySelectorAll('*')]) {
        for (const attr of [...el.attributes]) {
            const name = attr.name.toLowerCase();
            if (name.startsWith('on')) { el.removeAttribute(attr.name); continue; }
            if (URL_ATTRS.includes(name)) {
                // 브라우저는 URL 앞뒤 공백과 제어 문자를 무시하므로 지우고 판정한다 ("java\tscript:" 등).
                const v = attr.value.replace(/[\u0000-\u0020\u007f-\u009f]/g, '').toLowerCase();
                const scheme = /^([a-z][a-z0-9+.-]*):/.exec(v)?.[1];
                const ok = !scheme || scheme === 'http' || scheme === 'https'
                    || (scheme === 'data' && el.tagName === 'IMG' && v.startsWith('data:image/'));
                if (!ok) el.removeAttribute(attr.name);
            }
        }
    }
}

export interface RenderOptions extends ChzzkViewOptions {
    templates?: Partial<ChzzkTemplates>;
}

/**
 * 템플릿으로 채팅 요소를 만든다. 사용자 템플릿이 문법 오류면 그 종류만 기본 템플릿으로
 * 대체한다 — 채팅이 사라지는 것보다 기본 모양으로라도 보이는 게 낫다.
 */
export function renderChzzkChat(chat: ChzzkSocketChat, opts: RenderOptions = {}): HTMLElement {
    const view = toChzzkChatView(chat, opts);
    const userSrc = opts.templates?.[view.kind];

    let html: string;
    try {
        html = compiled(userSrc ?? DEFAULT_CHZZK_TEMPLATES[view.kind]).render(view);
    } catch {
        html = compiled(DEFAULT_CHZZK_TEMPLATES[view.kind]).render(view);
    }

    // 사용자 템플릿에 있을 수 있는 스크립트·이벤트 속성·javascript: URL 제거.
    // 루트는 템플릿이 아니라 우리가 만든다 — 템플릿이 무엇이든 요소 하나로 떨어지게.
    const root = document.createElement('div');
    root.className = `tbc-chat tbc-chat--${view.kind}`;
    if (view.cleanbot) root.classList.add('tbc-chat--cleanbot');
    // 후원 카드 색은 금액 단계로 — 템플릿이 무엇이든 붙도록 루트에 단다.
    if (view.donation?.level !== undefined) root.classList.add(`tbc-chat--level${view.donation.level}`);
    // 칭호가 있는 사람(스트리머·매니저 등)의 일반 채팅은 host가 본문을 칭호 색으로 칠한다.
    // 템플릿에 넣지 않고 루트 변수로 — 사용자 템플릿에도 같이 먹는다. 색 모양만 통과.
    if (view.kind === 'chat' && chat.titleColor && /^#[0-9a-fA-F]{3,8}$/.test(chat.titleColor)) {
        root.classList.add('tbc-chat--titled');
        root.style.setProperty('--tbc-title-color', chat.titleColor);
    }
    root.appendChild(DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true }));
    scrub(root);

    root.setAttribute(CHAT_ATTR.KEY, chat.id);
    // 다시보기는 HTML 경로와 같이 영상 안의 위치를 시각으로 단다.
    root.setAttribute(CHAT_ATTR.TIME, String(chat.playerTime ?? chat.time));
    if (chat.playerTime !== undefined) root.setAttribute(CHAT_ATTR.REPLAY_CHAT, 'true');
    root.setAttribute(CHAT_ATTR.BADGES, JSON.stringify(chat.badges));
    return root;
}
