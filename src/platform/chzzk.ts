import { BadgeInterface, ChatInfo, UnavailableChatField } from "@/interfaces/chat";
import type { PlatformAdapter } from "./";
import { msToTime } from "@/utils/utils-common";
import { createChzzkAPI, ChzzkAPI } from "@/api/chzzk";
import { CHAT_ATTR } from "@/interfaces/chat-attributes";
import { getPlatformConfig, detectPageMode, extractChannelId, getBrokenSelectors } from "./host-selectors";

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

        // selector 하나가 깨져도 전량 폐기하지 않는다. 못 뽑은 필드만 unavailable로
        // 표시해 넘기면 evaluateFilterGroup이 그 필드를 쓰는 composite만 건너뛴다.
        // rev 13에서 displayName(username class hash) 하나 때문에 채팅이 100% 유실된
        // 사고를 부분 유실로 완화하는 경로.
        const unavailable: UnavailableChatField[] = [];

        const display_name = chat_clone.querySelector(sel.displayName);
        const badges = chat_clone.querySelectorAll(sel.badge);
        const textContents = chat_clone.querySelectorAll(sel.messageText);
        const donationTextContents = sel.donationText
            ? chat_clone.querySelectorAll(sel.donationText)
            : [];

        // 채팅이 아닌 노드(list_bottom marker, padding item, popup 등)는 아무 필드도
        // 안 잡힌다. 그건 "selector 깨짐"이 아니라 "채팅이 아님" 이므로 여기서 걸러야
        // 한다 — unavailable을 잔뜩 달아 흘려보내면 필터 로그가 쓰레기로 찬다.
        if (!display_name && textContents.length === 0 && donationTextContents.length === 0) return;

        const nameText = display_name?.textContent ?? "";
        if (!display_name) unavailable.push('name');

        // 배지/본문은 per-chat 부재가 "selector 깨짐"을 뜻하지 않는다 — 배지 없는 채팅,
        // 이모티콘만 있는 채팅이 정상적으로 존재한다. 그래서 이 둘은 페이지 단위 판정
        // (selector-health가 채우는 broken 레지스트리)에만 의존한다. 반면 작성자가 없는
        // 채팅은 없으므로 name은 per-chat 부재로 바로 확정할 수 있다.
        const broken = getBrokenSelectors();
        if (broken.has('badge')) unavailable.push('badge');
        if (broken.has('messageText')) unavailable.push('keyword');

        // selector를 hash 없는 형태로 넓히면 <img> 없는 노드를 잡을 여지가 생긴다.
        // 예전 코드는 `getElementsByTagName("img")[0].src`로 바로 접근해서 그 순간
        // TypeError가 나고 extract 전체가 죽었다. img 없는 매칭은 그냥 버린다.
        const badgeArr = Array.from(badges)
            .map((badge) => badge.getElementsByTagName("img")[0]?.src)
            .filter((src): src is string => !!src);
        const textArr = Array.from(textContents).map((text) => text.textContent);
        const donationTextArr = Array.from(donationTextContents).map((text) => text.textContent);

        if (checkVerifiedBadge(chat_clone) && (cfg().constants?.verifiedBadgeImageUrl as string)) {
            badgeArr.push((cfg().constants?.verifiedBadgeImageUrl as string));
        }

        return {
            badges: [...badgeArr],
            textContents: [...textArr, ...donationTextArr],
            loginName: nameText,
            nickName: nameText,
            ...(unavailable.length > 0 ? { unavailable } : {}),
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
