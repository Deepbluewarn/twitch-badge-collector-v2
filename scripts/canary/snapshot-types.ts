/**
 * Canary 봇 스냅샷 스키마.
 *
 * 브라우저 컨텍스트(page.evaluate) 안과 Node 스크립트 양쪽에서 공유.
 * 확장의 diagnose.ts와 유사하지만 봇 관점 — adapter 안 씀, 순수 DOM 관찰.
 */

export interface SelectorSample {
    name: string;
    selector?: string;
    /** 현재 DOM에서 매칭된 개수. persist 시 strip. */
    count?: number;
    /** required 여부. false면 count=0을 실패로 안 침. */
    required: boolean;
    /** 매칭된 element들의 class 리스트 (첫 매칭 하나만). persist 시 strip. */
    matchedClasses?: string[] | null;
    /** persist 후 로드에서만 세팅 — count>0이었는지 (diff에 사용). */
    present?: boolean;
    /**
     * selector list(콤마) branch별 매칭 수. rev 14부터 fragile selector는 여러 후보를
     * 콤마로 나열한다 — branch 하나가 죽어도 전체는 계속 매칭되므로 total만 보면
     * canary가 조용해진다. branch별로 봐야 "절반 죽음"을 조기에 잡는다.
     */
    branchCounts?: Array<{ selector: string; count: number }> | null;
    /** persist용 — branch selector 문자열 → count>0이었는지. */
    branchPresence?: Record<string, boolean>;
    /**
     * 이 selector가 깨졌을 때 봇이 라이브 DOM에서 직접 검증해본 대체 후보들.
     * hash만 치환한 문자열을 실제로 querySelectorAll 해보고 cardinality까지 확인한
     * 결과 — "후보가 여러 개라 애매함"으로 포기하지 않고 auto-fix를 낼 근거.
     */
    candidates?: AutoFixProbe[] | null;
}

/**
 * 대체 selector 후보 1개의 라이브 검증 결과.
 */
export interface AutoFixProbe {
    /** 치환해서 만든 후보 selector 전체 문자열 */
    selector: string;
    /** 어떤 치환을 했는지 (예: `_container_zw6kq_` → `_container_1mc5x_`) */
    replaced: string;
    /** 문서 전체 매칭 수 */
    docCount: number;
    /**
     * 기대 cardinality를 만족한 채팅 item 비율 (0~1). 1에 가까울수록 "원래 그 selector가
     * 하던 일"을 그대로 한다는 뜻. 예: displayName은 채팅당 정확히 1개여야 하는데,
     * `_container_w9pvh_`로 치환하면 채팅당 2개가 잡혀 점수가 떨어진다 — 이 점수가
     * 없으면 단순히 "매칭 수가 많은" 오답이 auto-fix로 올라간다.
     */
    score: number;
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
    /** 채팅 wrapper 안 첫 chat element의 텍스트 제거 outerHTML (구조 뼈대). persist 시 strip. */
    sampleSkeleton?: string | null;
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
    /** 이 페이지에서 인식한 채팅 item 수 — 후보 검증 점수의 분모. */
    chatItemCount?: number;
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
