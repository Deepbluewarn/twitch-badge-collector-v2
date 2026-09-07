import { BadgeInterface, ChatInfo } from "@/interfaces/chat";
import type { PlatformAdapter } from "./";
import { msToTime } from "@/utils/utils-common";
import { createChzzkAPI, ChzzkAPI } from "@/api/chzzk";
import { CHAT_ATTR } from "@/interfaces/chat-attributes";
import { getPlatformConfig, detectPageMode, extractChannelId } from "./host-selectors";

const cfg = () => getPlatformConfig('chzzk');

function checkVerifiedBadge(chat_clone: Element): boolean {
    // ponytail: verifiedIcon class hash 롤링에 매번 selector 갱신하지 말고
    // aria/accessibility 라벨 '인증 마크' 텍스트로 직접 검사. chzzk가 이 라벨
    // 바꾸면 여기 텍스트 하나 갱신. selector 하나 없애서 rev bump 부담도 감소.
    const sel = cfg().selectors;
    if (!sel.blindText) return false;
    return Array.from(chat_clone.querySelectorAll(sel.blindText))
        .some(b => b.textContent === '인증 마크');
}

export class ChzzkAdapter implements PlatformAdapter {
    readonly type = 'chzzk' as const;

    readonly displayName = '치지직';
    readonly brandColor = '#00ffa3e6';

    readonly chatOrder = 'newest-top' as const;

    readonly supportsChannelBadgeQuery = false;

    readonly supportsChatPersistence = true;

    private api: ChzzkAPI = createChzzkAPI();

    extract(node: Node): ChatInfo | undefined {
        const nodeElement = node as HTMLElement;
        if (nodeElement.nodeType !== 1) return;
        if (nodeElement.parentElement?.id !== 'tbc-chzzk-chat-list-wrapper') return;

        const sel = cfg().selectors;
        // popup profile 등 채팅이 아닌 노드 무시
        if (sel.popupProfileHeader && nodeElement.matches(sel.popupProfileHeader)) return;

        const chat_clone = nodeElement.cloneNode(true) as Element;

        const display_name = chat_clone.querySelector(sel.displayName);
        if (!display_name) return;

        let loginName: string = "";
        let nickName: string = "";

        if (display_name) {
            loginName = display_name.textContent!;
            nickName = display_name.textContent!;
        }

        const badges = chat_clone.querySelectorAll(sel.badge);
        const textContents = chat_clone.querySelectorAll(sel.messageText);
        const donationTextContents = sel.donationText
            ? chat_clone.querySelectorAll(sel.donationText)
            : [];

        const badgeArr = Array.from(badges).map((badge) => badge.getElementsByTagName("img")[0].src);
        const textArr = Array.from(textContents).map((text) => text.textContent);
        const donationTextArr = Array.from(donationTextContents).map((text) => text.textContent);

        if (checkVerifiedBadge(chat_clone) && (cfg().constants?.verifiedBadgeImageUrl as string)) {
            badgeArr.push((cfg().constants?.verifiedBadgeImageUrl as string));
        }

        return {
            badges: [...badgeArr],
            textContents: [...textArr, ...donationTextArr],
            loginName: loginName,
            nickName: nickName,
        } as ChatInfo;
    }

    getCurrentChannelId(): string | null {
        return extractChannelId(window.location.pathname, cfg());
    }

    getPageMode(): 'live' | 'video' | 'unknown' {
        return detectPageMode(window.location.pathname, cfg());
    }

    computeDragRatio(rect: DOMRect, clientY: number): number {
        // constants는 OTA로 갈아끼워지는 값 — manifest에서 통째로 빠질 수 있고,
        // 그러면 undefined가 산술에 섞여 결과가 NaN이 된다. clamp의 Math.max/min은
        // NaN을 통과시키므로 여기서 막지 않으면 NaN이 그대로 저장까지 흘러간다.
        const headerOffset = Number(cfg().constants?.dragHeaderOffset ?? 0) || 0;
        const footerOffset = Number(cfg().constants?.dragFooterOffset ?? 0) || 0;

        const usableHeight = rect.height - headerOffset - footerOffset;

        // 채팅창이 아직 레이아웃 전(높이 0)이거나 offset이 높이보다 클 때. 0으로 나누면
        // ±Infinity가 되고 clamp가 그걸 0이나 100으로 접어서, 사용자가 "한쪽 100%"를
        // 고른 것처럼 저장된다. NaN을 돌려 호출측(doDrag)이 이 프레임을 버리게 한다.
        if (!(usableHeight > 0)) return NaN;

        const ratio = (1 - (clientY - rect.y - headerOffset) / usableHeight) * 100;
        if (!Number.isFinite(ratio)) return NaN;

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
        const usernameSel = cfg().selectors.usernameContainer;
        if (!usernameSel) return;
        const usernameElem = clone.querySelector<HTMLElement>(usernameSel);
        if (!usernameElem) return;

        const time = parseInt(clone.getAttribute(CHAT_ATTR.TIME) ?? '0', 10);
        const isReplay = clone.getAttribute(CHAT_ATTR.REPLAY_CHAT);
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
