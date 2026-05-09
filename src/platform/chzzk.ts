import { BadgeInterface, ChatInfo } from "@/interfaces/chat";
import type { PlatformAdapter } from "./";
import { msToTime } from "@/utils/utils-common";
import { createChzzkAPI, ChzzkAPI } from "@/api/chzzk";

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

    readonly displayName = '치지직';
    readonly brandColor = '#00ffa3e6';

    readonly chatOrder = 'newest-top' as const;

    readonly supportsChannelBadgeQuery = false;

    private api: ChzzkAPI = createChzzkAPI();

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

    getBadgeImageUrl(value: string, _density: '1x' | '2x' | '4x'): string {
        // Chzzk는 배지 식별자 자체가 이미 이미지 URL이라 그대로 반환. density는 무시.
        return value;
    }

    getBadgeIdentity(url: string): string {
        // Chzzk는 URL 자체가 식별자.
        return url;
    }

    prepareChatClone(clone: HTMLElement): void {
        // 복제된 채팅의 username 컨테이너에 시간 표시를 prepend.
        const usernameElem = clone.getElementsByClassName(
            'live_chatting_username_container__m1-i5 live_chatting_username_is_message__jvTvP'
        )[0] as HTMLElement;
        if (!usernameElem) return;

        const time = parseInt(clone.getAttribute('data-tbc-chat-time') ?? '0', 10);
        const isReplay = clone.getAttribute('data-tbc-chat-replay-chat');
        const chatTimeStr = isReplay
            ? msToTime(time)
            : new Date(time).toLocaleTimeString(navigator.language, { hour: '2-digit', minute: '2-digit', hour12: false });

        const chatTime = document.createElement('div');
        chatTime.classList.add('tbcv2-chat-time');
        chatTime.textContent = chatTimeStr;
        usernameElem.classList.add('tbcv2-chat-username');
        usernameElem.style.display = 'inline-flex';
        usernameElem.prepend(chatTime);
    }

    async fetchBadges(_opts: { scope: 'global' | 'channel'; channelLogin?: string }): Promise<BadgeInterface[]> {
        // Chzzk는 채널별 배지 개념이 없어 scope/channelLogin 모두 무시.
        const badges = await this.api.fetchBadges();
        return badges.map(badge => ({
            id: badge.id,
            badgeImage: {
                badge_img_url_1x: badge.image,
                badge_img_url_2x: badge.image,
                badge_img_url_4x: badge.image,
            },
            channel: 'Global',
            note: badge.name,
            badgeName: badge.name,
            filterType: 'include',
        } as BadgeInterface));
    }
}
