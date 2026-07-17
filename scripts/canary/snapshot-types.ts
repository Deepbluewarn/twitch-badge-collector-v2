/**
 * Canary 봇 스냅샷 스키마.
 *
 * 브라우저 컨텍스트(page.evaluate) 안과 Node 스크립트 양쪽에서 공유.
 * 확장의 diagnose.ts와 유사하지만 봇 관점 — adapter 안 씀, 순수 DOM 관찰.
 */

export interface SelectorSample {
    name: string;
    selector: string;
    /** 현재 DOM에서 매칭된 개수 */
    count: number;
    /** required 여부. false면 count=0을 실패로 안 침. */
    required: boolean;
    /** 매칭된 element들의 class 리스트 (첫 매칭 하나만). fingerprint용. */
    matchedClasses: string[] | null;
}

export interface CanarySnapshot {
    /** 어느 페이지 컨텍스트 스냅샷 */
    pageMode: 'live' | 'video';
    /** 스냅샷 뜬 시각 */
    capturedAt: string;
    /** 스냅샷을 찍은 URL (채널ID 포함) */
    url: string;
    /** 우리 selector들의 매칭 결과 */
    selectors: SelectorSample[];
    /** 채팅창 못 찾아 fallback layer 사용했는지 */
    anchorLayer: 'L1' | 'L2' | 'L3' | 'L4' | 'none';
    /** 채팅 wrapper 안 첫 chat element의 텍스트 제거 outerHTML (구조 뼈대) */
    sampleSkeleton: string | null;
    /** 스냅샷 뜰 때 봇이 봤던 chzzk manifest.rev (봇에 박힌 최신 bundled) */
    manifestRev: number;
    /** 병렬 방문 시 스냅샷 만드는 데 참여한 채널 수 (대표 스냅샷 선정 근거). */
    channelsVisited?: number;
    /** 채널별 required pass 여부 (다수결 검증용). */
    channelStatuses?: Array<{ url: string; requiredPass: boolean; anchorLayer: string }>;
}

/**
 * 채널 하나 방문 결과. 여러 채널 결과를 오케스트레이터가 병합해 CanarySnapshot 만듦.
 */
export interface ChannelVisitResult {
    url: string;
    ok: boolean;
    error?: string;
    anchorLayer: 'L1' | 'L2' | 'L3' | 'L4' | 'none';
    selectors: SelectorSample[];
    sampleSkeleton: string | null;
    /** 이 채널 방문 중 관찰된 배지 이미지 URL 집합. */
    badgeUrls: string[];
}

/**
 * chzzk 배지 인벤토리. url → 처음 관찰된 시각(ISO).
 * canary가 매 실행마다 union 병합. 없어진 배지는 지우지 않음 — 그 스트리머가 지금
 * 방송 안 할 뿐일 수 있음.
 */
export interface BadgeInventory {
    version: 1;
    updatedAt: string;
    entries: Record<string, { firstSeenAt: string; lastSeenAt: string; seenCount: number }>;
}
