import { ChatExtractor } from "@/interfaces/chat";

/**
 * Platform별로 묶인 *런타임 행동* 모음. CONTEXT.md의 Platform 도메인 개념의 어댑터.
 *
 * 한 Host page당 하나의 PlatformAdapter 인스턴스가 살아있고,
 * 채팅 추출 / 현재 채널 식별 / 페이지 모드 / 드래그 수식을 제공한다.
 *
 * 같은 Adapter Interface 뒤에 TwitchAdapter / ChzzkAdapter 두 구현이 있다.
 */
export interface PlatformAdapter extends ChatExtractor {
    readonly type: 'twitch' | 'chzzk';

    /**
     * Host page URL에서 추출한 현재 채널 식별자.
     * Twitch는 path[1] (channel login), Chzzk는 path[2] (numeric channel ID).
     * 페이지가 채널 페이지가 아니면 null 가능.
     */
    getCurrentChannelId(): string | null;

    /**
     * Host page의 모드. content-script init이 어떤 Container를 만들지 결정할 때 사용.
     */
    getPageMode(): 'live' | 'video' | 'unknown';

    /**
     * 드래그 시 커서 Y 좌표를 Container ratio (0–100, 정수)로 변환.
     * 결과는 clamp 처리되어 반환된다.
     */
    computeDragRatio(rect: DOMRect, clientY: number): number;
}
