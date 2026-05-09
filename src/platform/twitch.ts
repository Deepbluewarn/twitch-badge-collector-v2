import { ChatInfo } from "@/interfaces/chat";
import { PlatformAdapter } from "./";

export class TwitchAdapter implements PlatformAdapter {
    readonly type = 'twitch' as const;

    extract(node: Node): ChatInfo | undefined {
        const nodeElement = node as HTMLElement;
        if (nodeElement.nodeType !== 1) return;
        if (!nodeElement.closest('#tbc-twitch-chat-list-wrapper')) return;

        const chat_clone = nodeElement.cloneNode(true) as Element;

        const display_name = chat_clone.getElementsByClassName(
            "chat-author__display-name"
        )[0];
        const chatter_name = chat_clone.getElementsByClassName("intl-login")[0];

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

        const textContents = (
            chat_clone.getElementsByClassName("text-fragment")
        ) as HTMLCollectionOf<HTMLSpanElement>;

        const badgeElements = chat_clone.getElementsByClassName("chat-badge") as HTMLCollectionOf<HTMLImageElement>;
        const dataBadges: string[] = JSON.parse(chat_clone.getAttribute('data-tbc-chat-badges') || '[]');
        const fallbackBadges = Array.from(badgeElements)
            .map((badge) => new URL(badge.src).pathname.split("/")[3]);

        const channel = chat_clone.getAttribute('data-tbc-chat-channel');
        const channelId = chat_clone.getAttribute('data-tbc-chat-channel-id');

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
        return window.location.pathname.split('/')[1] ?? null;
    }

    getPageMode(): 'live' | 'video' | 'unknown' {
        const pathSegment = window.location.pathname.split('/')[1];
        if (pathSegment === 'videos') return 'video';
        return 'live';
    }

    computeDragRatio(rect: DOMRect, clientY: number): number {
        const ratio = (1 - (clientY - rect.y) / rect.height) * 100;
        return Math.max(0, Math.min(100, Math.round(ratio)));
    }
}
