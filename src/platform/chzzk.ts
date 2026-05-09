import { ChatInfo } from "@/interfaces/chat";
import { PlatformAdapter } from "./";

// Chzzk 채팅 영역 위/아래 고정 UI 높이 — 드래그 수식 보정에 사용
const CHZZK_HEADER_OFFSET = 77;
const CHZZK_FOOTER_OFFSET = 62;

function checkVerifiedBadge(chat_clone: Element): boolean {
    const verifiedBadge = (
        chat_clone.getElementsByClassName("name_icon__zdbVH")[0]
    ) as HTMLElement;

    if (verifiedBadge === undefined) return false;

    const text = verifiedBadge.getElementsByClassName('blind')[0].textContent;

    return text === '인증 마크';
}

export class ChzzkAdapter implements PlatformAdapter {
    readonly type = 'chzzk' as const;

    extract(node: Node): ChatInfo | undefined {
        const nodeElement = node as HTMLElement;
        if (nodeElement.nodeType !== 1) return;
        if (nodeElement.parentElement?.id !== 'tbc-chzzk-chat-list-wrapper') return;
        if (nodeElement.classList.contains('live_chatting_popup_profile_header__OWnnU')) return;

        const chat_clone = nodeElement.cloneNode(true) as Element;

        const display_name = chat_clone.getElementsByClassName(
            "name_text__yQG50"
        )[0];

        if (!display_name) return;

        let loginName: string = "";
        let nickName: string = "";

        if (display_name) {
            loginName = display_name.textContent!;
            nickName = display_name.textContent!;
        }

        const badges = (
            chat_clone.getElementsByClassName("badge_container__a64XB")
        );

        const textContents = (
            chat_clone.getElementsByClassName("live_chatting_message_text__DyleH")
        );

        const donationTextContents = (
            chat_clone.getElementsByClassName("live_chatting_donation_message_text__XbDKP")
        );

        const badgeArr = Array.from(badges).map((badge) => badge.getElementsByTagName("img")[0].src);
        const textArr = Array.from(textContents).map((text) => text.textContent);
        const donationTextArr = Array.from(donationTextContents).map((text) => text.textContent);

        const verifiedBadge = checkVerifiedBadge(chat_clone);

        if (verifiedBadge) {
            badgeArr.push("https://ssl.pstatic.net/static/nng/glive/image/icon_official_mark.png");
        }

        return {
            badges: [...badgeArr],
            textContents: [...textArr, ...donationTextArr],
            loginName: loginName,
            nickName: nickName,
        } as ChatInfo;
    }

    getCurrentChannelId(): string | null {
        return window.location.pathname.split('/')[2] ?? null;
    }

    getPageMode(): 'live' | 'video' | 'unknown' {
        const pathSegment = window.location.pathname.split('/')[1];
        if (pathSegment === 'video') return 'video';
        if (pathSegment === 'live') return 'live';
        return 'unknown';
    }

    computeDragRatio(rect: DOMRect, clientY: number): number {
        const usableHeight = rect.height - CHZZK_HEADER_OFFSET - CHZZK_FOOTER_OFFSET;
        const ratio = (1 - (clientY - rect.y - CHZZK_HEADER_OFFSET) / usableHeight) * 100;
        return Math.max(0, Math.min(100, Math.round(ratio)));
    }
}
