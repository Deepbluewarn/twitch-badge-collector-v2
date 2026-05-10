import { BadgeInterface, ChatInfo } from "@/interfaces/chat";
import type { PlatformAdapter } from "./";
import { createTwitchAPI, TwitchAPI } from "@/api/twitch";
import { Version } from "@/interfaces/api/twitchAPI";
import { CHAT_ATTR } from "@/interfaces/chat-attributes";
import { getPlatformConfig, detectPageMode, extractChannelId } from "./host-selectors";

const TWITCH_BADGE_CDN = 'https://static-cdn.jtvnw.net/badges/v1';
const TWITCH_DENSITY_TO_PATH = { '1x': '1', '2x': '2', '4x': '3' } as const;
/** Dynamic getter — OTA로 갱신된 값을 매 호출마다 읽음. */
const cfg = () => getPlatformConfig('twitch');

function badgeMapToInterface(
    map: Map<string, Version>,
    channel: string,
    channelLogin?: string,
    channelId?: string,
): BadgeInterface[] {
    return Array.from(map.entries()).map(([key, version]) => ({
        id: `${version.image_url_1x}-${version.description}-`,
        badgeImage: {
            badge_img_url_1x: version.image_url_1x,
            badge_img_url_2x: version.image_url_2x,
            badge_img_url_4x: version.image_url_4x,
        },
        channel,
        note: version.description,
        badgeName: version.title,
        filterType: 'include',
        badgeSetId: key, // Map key (`set_id/version_id`)를 set_id로 사용 — 기존 컨벤션 유지
        channelLogin,
        channelId,
    }));
}

export class TwitchAdapter implements PlatformAdapter {
    readonly type = 'twitch' as const;

    readonly displayName = '트위치';
    readonly brandColor = '#9147ff';

    readonly chatOrder = 'newest-bottom' as const;

    readonly supportsChannelBadgeQuery = true;

    readonly supportsChatPersistence = false;

    private api: TwitchAPI = createTwitchAPI();

    extract(node: Node): ChatInfo | undefined {
        const nodeElement = node as HTMLElement;
        if (nodeElement.nodeType !== 1) return;
        if (!nodeElement.closest('#tbc-twitch-chat-list-wrapper')) return;

        const chat_clone = nodeElement.cloneNode(true) as Element;

        const sel = cfg().selectors;
        const display_name = chat_clone.querySelector(sel.displayName);
        const chatter_name = sel.chatterName
            ? chat_clone.querySelector(sel.chatterName)
            : null;

        if (!display_name && !chatter_name) return;

        let loginName: string = "";
        let nickName: string = "";
        let subLoginName: string = "";
        let subNickname: string = "";

        if (display_name) {
            loginName = display_name.getAttribute("data-a-user")?.toLowerCase()!;
            nickName = display_name.textContent?.toLowerCase()!;
        }
        if (chatter_name) {
            subLoginName = chatter_name.textContent!;
            subLoginName = subLoginName.substring(1, subLoginName.length - 1);
            subNickname = chatter_name.parentNode?.childNodes[0].textContent!;
        }

        loginName = loginName ? loginName : subLoginName;
        nickName = nickName ? nickName : subNickname;

        const textContents = chat_clone.querySelectorAll<HTMLSpanElement>(sel.messageText);
        const badgeElements = chat_clone.querySelectorAll<HTMLImageElement>(sel.badge);
        const dataBadges: string[] = JSON.parse(chat_clone.getAttribute(CHAT_ATTR.BADGES) || '[]');
        const fallbackBadges = Array.from(badgeElements)
            .map((badge) => new URL(badge.src).pathname.split("/")[3]);

        const channel = chat_clone.getAttribute(CHAT_ATTR.CHANNEL);
        const channelId = chat_clone.getAttribute(CHAT_ATTR.CHANNEL_ID);

        return {
            textContents: Array.from(textContents).map((text) => text.textContent),
            badges: [...dataBadges, ...fallbackBadges],
            loginName: loginName,
            nickName: nickName,
            channelLogin: channel,
            channelId: channelId,
        } as ChatInfo;
    }

    getCurrentChannelId(): string | null {
        return extractChannelId(window.location.pathname, cfg());
    }

    getPageMode(): 'live' | 'video' | 'unknown' {
        // Twitch는 /videos/ 가 아니면 모두 live (현재 코드 의미 유지 — detectPageMode가
        // unknown 줄 수도 있는데 livePathRegex가 ^/(?!videos/) 라서 fallthrough 시 live).
        const mode = detectPageMode(window.location.pathname, cfg());
        return mode === 'unknown' ? 'live' : mode;
    }

    computeDragRatio(rect: DOMRect, clientY: number): number {
        const ratio = (1 - (clientY - rect.y) / rect.height) * 100;
        return Math.max(0, Math.min(100, Math.round(ratio)));
    }

    getBadgeImageUrl(value: string, density: '1x' | '2x' | '4x'): string {
        return `${TWITCH_BADGE_CDN}/${value}/${TWITCH_DENSITY_TO_PATH[density]}`;
    }

    getBadgeIdentity(url: string): string {
        // Twitch CDN URL 패턴: https://static-cdn.jtvnw.net/badges/v1/<UUID>/<scale>
        try {
            return new URL(url).pathname.split('/')[3];
        } catch {
            return url;
        }
    }

    prepareChatClone(_clone: HTMLElement): void {
        // Twitch는 별도 처리 없음. 채팅 시간/사용자 정보는 inject 단에서 이미 attribute로 박혀있음.
    }

    async fetchBadges(opts: { scope: 'global' | 'channel'; channelLogin?: string }): Promise<BadgeInterface[]> {
        if (opts.scope === 'global') {
            const map = await this.api.fetchGlobalChatBadges();
            return badgeMapToInterface(map, 'Global');
        }
        if (!opts.channelLogin) return [];
        const userResp = await this.api.fetchUser('login', opts.channelLogin);
        if (!userResp.data || userResp.data.length === 0) return [];
        const user = userResp.data[0];
        const map = await this.api.fetchChannelChatBadges(user.id);
        return badgeMapToInterface(map, user.display_name, user.login, user.id);
    }
}
