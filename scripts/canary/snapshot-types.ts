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
 * chzzk 배지 인벤토리 v2. **이미지 컨텐츠(sha256) 기반** — URL만 다르면 같은 이미지
 * 재fetch 안 하고 같은 배지로 인식. 채널별 자산(subscription/*)은 수집 대상 X.
 *
 * v1 (URL 기반)에서 마이그레이션 자동. 처음 배지 canary 돌 때 옛 파일 있으면 재해싱 후 v2로 덮음.
 */
export interface BadgeInventory {
    version: 2;
    updatedAt: string;
    /** sha256 hex → 그 이미지 hash를 가진 배지 정보 */
    badges: Record<string, BadgeEntry>;
}

export interface BadgeUrlHistory {
    url: string;
    firstSeenAt: string;
    lastSeenAt: string;
}

export interface BadgeEntry {
    firstSeenAt: string;
    lastSeenAt: string;
    seenCount: number;
    /** UI/디버그용 — 가장 최근 관찰된 URL */
    latestUrl: string;
    /** 같은 hash로 등장한 모든 URL 이력 (분석용) */
    urls: BadgeUrlHistory[];
}

/**
 * v1 → v2 마이그레이션용 옛 스키마 타입. 로드 시점에 detect 후 재해싱.
 */
export interface BadgeInventoryV1 {
    version: 1;
    updatedAt: string;
    entries: Record<string, { firstSeenAt: string; lastSeenAt: string; seenCount: number }>;
}
