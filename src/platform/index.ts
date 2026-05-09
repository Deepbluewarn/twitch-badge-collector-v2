import { ChatExtractor } from "@/interfaces/chat";
import { TwitchAdapter } from "./twitch";
import { ChzzkAdapter } from "./chzzk";

/**
 * Platform별로 묶인 *런타임 행동* + *UI 표현* 모음. CONTEXT.md의 Platform 도메인 개념의 어댑터.
 *
 * 한 Host page당 하나의 PlatformAdapter 인스턴스가 살아있고,
 * 채팅 추출 / 현재 채널 식별 / 페이지 모드 / 드래그 수식과 더불어
 * UI 측의 브랜딩 / 배지 URL 변환 / 채팅 정렬 방식까지 제공한다.
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

    /** 사용자에게 보여줄 platform 이름 (한국어) */
    readonly displayName: string;

    /** Filter UI에서 platform 식별용 색상 */
    readonly brandColor: string;

    /**
     * 배지 식별자(필터에 저장된 value) → 실제 이미지 URL.
     * Twitch는 CDN URL을 조립, Chzzk는 value 자체가 URL이라 그대로 반환.
     */
    getBadgeImageUrl(value: string, density: '1x' | '2x' | '4x'): string;

    /**
     * 배지 이미지 URL → 비교 가능한 식별자.
     * Twitch는 URL에서 UUID 추출, Chzzk는 URL 자체를 식별자로 사용.
     */
    getBadgeIdentity(url: string): string;

    /**
     * Host page의 채팅 정렬 방식. Container 내부 정렬과 trim 방향이 모두 이걸로 파생됨.
     * - `'newest-top'`: 새 채팅이 위에 추가됨 (Chzzk 라이브)
     * - `'newest-bottom'`: 새 채팅이 아래에 추가됨 (Twitch)
     */
    readonly chatOrder: 'newest-top' | 'newest-bottom';

    /**
     * 복제된 채팅 노드에 platform 특화 후처리를 적용 (예: 시간 표시 prepend).
     * Container에 삽입되기 직전에 호출됨.
     */
    prepareChatClone(clone: HTMLElement): void;
}

const adapters = {
    twitch: new TwitchAdapter(),
    chzzk: new ChzzkAdapter(),
} as const;

/** Platform 문자열로 adapter 인스턴스 조회. UI 컴포넌트에서 사용. */
export function getAdapter(type: 'twitch' | 'chzzk'): PlatformAdapter {
    return adapters[type];
}

/** 배지 이미지 `<img srcSet>` 문자열 조립. 1x/2x/4x 모두 포함. */
export function getBadgeSrcSet(adapter: PlatformAdapter, value: string): string {
    const densities: ('1x' | '2x' | '4x')[] = ['1x', '2x', '4x'];
    return densities.map(d => `${adapter.getBadgeImageUrl(value, d)} ${d}`).join(', ');
}
