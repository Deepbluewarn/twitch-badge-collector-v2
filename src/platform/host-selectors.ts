/**
 * Host page DOM에 의존하는 모든 fragile 값들의 schema + 데이터 + dynamic loader.
 *
 * Phase 3 (OTA):
 *  - 데이터 source 우선순위: storage(OTA) > bundled JSON
 *  - storage 적용은 비동기. 페이지 로드 직후 ~수ms 동안은 bundled로 동작 가능.
 *  - mid-session 갱신 안 함: OTA fetch는 background가 백그라운드에서 진행, 다음 page reload부터 적용.
 *  - 두 컨텍스트 지원:
 *      ISOLATED (content script): browser.storage 직접 읽음
 *      MAIN (inject script): postMessage로 ISOLATED에서 manifest 받음
 *
 * NOT 외화 대상:
 *  - 우리 확장이 inject한 element ID — 우리 통제
 *  - 도메인 무관한 logic (drag ratio 계산, badge URL 변환 알고리즘 등)
 */
// bundled-selectors.prod.json = production용 selector. 새 빌드는 이걸 fallback으로 사용.
// 옛 bundled-selectors.json은 v2.18.15 이전 사용자의 OTA target으로만 남겨두고
// 신 빌드는 .prod.json만 참조 (master 파일 자유 편집해도 신 빌드 영향 X).
import bundled from './bundled-selectors.prod.json';

export interface PlatformHostConfig {
    livePathRegex: string;
    vodPathRegex: string;
    channelIdPathIndex: number;

    selectors: {
        chatRoomLive: string;
        chatRoomVod: string;
        video?: string;

        displayName: string;
        chatterName?: string;
        messageText: string;
        donationText?: string;
        badge: string;
        verifiedIcon?: string;
        blindText?: string;

        usernameContainer?: string;
        popupProfileHeader?: string;

        pointButton?: string;
        pointButtonContainer?: string;

        /** chzzk 풀스크린 진입 시 aside-chatting에 추가되는 class의 substring.
         *  예전엔 `live_chatting_is_folded` prefix였으나 신 패턴에선 `_is_folded_`.
         *  `Array.classList.some(c => c.includes(foldedClassSubstring))` 식으로 사용. */
        foldedClassSubstring?: string;
    };

    reactPropsPaths?: {
        live?: Record<string, string>;
        vod?: Record<string, string>;
    };

    constants?: Record<string, string | number>;
}

export interface SelectorsManifest {
    schemaVersion: number;
    rev: number;
    platforms: {
        twitch: PlatformHostConfig;
        chzzk: PlatformHostConfig;
    };
}

const BUNDLED: SelectorsManifest = bundled as SelectorsManifest;
const SUPPORTED_SCHEMA_VERSION = BUNDLED.schemaVersion;

/** 현재 활성 manifest. setManifest로 갱신. */
let CURRENT: SelectorsManifest = BUNDLED;

/** OTA / postMessage / storage 등 외부 source가 manifest 갱신할 때 호출. */
export function setManifest(next: unknown): boolean {
    if (!isValidManifest(next)) {
        console.warn('[host-selectors] invalid manifest, ignored');
        return false;
    }
    if (next.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
        console.warn('[host-selectors] schema version mismatch — got', next.schemaVersion, 'expected', SUPPORTED_SCHEMA_VERSION);
        return false;
    }
    if (next.rev <= CURRENT.rev) {
        // downgrade or same rev — 무시 (OTA 신뢰성 위해 monotonic 보장)
        return false;
    }
    CURRENT = next;
    return true;
}

/** 현재 활성 manifest 반환 (OTA 적용됐으면 그것, 아니면 bundled). */
export function getManifest(): SelectorsManifest {
    return CURRENT;
}

/** 플랫폼별 config getter — 동적. CFG를 모듈 레벨에서 캡처하지 말고 호출 시점마다 이걸로. */
export function getPlatformConfig(platform: 'twitch' | 'chzzk'): PlatformHostConfig {
    return CURRENT.platforms[platform];
}

/** Backwards-compat: 기존 코드 호환용. snapshot이라 OTA 갱신 반영 안 됨 — 가능한 getPlatformConfig 사용 권장. */
export const HOST_SELECTORS = CURRENT.platforms;

function isValidManifest(v: unknown): v is SelectorsManifest {
    if (!v || typeof v !== 'object') return false;
    const m = v as Partial<SelectorsManifest>;
    if (typeof m.schemaVersion !== 'number') return false;
    if (typeof m.rev !== 'number') return false;
    if (!m.platforms || typeof m.platforms !== 'object') return false;
    if (!m.platforms.twitch || !m.platforms.chzzk) return false;
    // selector 존재 여부 sanity check (필수 필드만)
    for (const p of ['twitch', 'chzzk'] as const) {
        const cfg = m.platforms[p];
        if (!cfg.selectors || typeof cfg.selectors !== 'object') return false;
        if (typeof cfg.selectors.chatRoomLive !== 'string') return false;
        if (typeof cfg.selectors.displayName !== 'string') return false;
        if (typeof cfg.selectors.messageText !== 'string') return false;
        if (typeof cfg.selectors.badge !== 'string') return false;
    }
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 컨텍스트별 자동 적용 — module load 시점에 한 번 실행
// ─────────────────────────────────────────────────────────────────────────────

// ─── realm 간 manifest 전달 계약 ──────────────────────────────────────────────
// IIFE(manifestReady)가 module 평가 시점에 이 값들을 동기적으로 읽으므로 반드시 위에 둔다.
// (아래에 두면 TDZ — 예전에 여기 문자열 리터럴이 박혀 있던 이유가 그것이었다.)

/** Storage key. ISOLATED 만 접근 가능. */
export const SELECTORS_STORAGE_KEY = 'tbcv2-selectors-manifest';
/** ISOLATED → MAIN: manifest 본문 전달. */
export const SELECTORS_MESSAGE_TYPE = 'tbcv2-selectors-manifest';
/** MAIN → ISOLATED: "manifest 달라". ISOLATED 가 먼저 떠서 초기 push 를 놓친 경우용. */
export const SELECTORS_REQUEST_TYPE = 'tbcv2-selectors-request';

/**
 * "이제 시작해도 된다"를 알리는 promise. **"manifest 를 받았다"가 아니다.**
 *
 * ISOLATED: storage 를 직접 읽으므로 읽기가 끝나면 곧 resolve — 그 값이 곧 최신이다.
 *
 * MAIN: browser API 가 없어 storage 를 못 읽는다. ISOLATED 가 postMessage 로 건네줘야
 * 하는데, 치지직 MAIN 은 document_start(호스트 React 보다 먼저 visibility 를 위조해야
 * 함)이고 ISOLATED 는 document_idle 이다. 그 사이에 HTML 파싱 전체가 들어가므로 MAIN 이
 * manifest 를 기다리는 건 의미가 없다 — 기다리지 않고 bundled 로 즉시 resolve 한다.
 *
 * 대신 **수신 리스너는 세션 내내 닫지 않는다.** 예전엔 200ms 타임아웃에 리스너까지 함께
 * 제거해서, 뒤늦게 도착한 manifest 가 받는 사람 없이 버려졌다. reactPropsPaths 처럼 매
 * 채팅 다시 읽는 값은 늦게 받아도 그 시점부터 바로 최신이 되므로 계속 들을 값어치가 있다.
 * (init() 이 붙잡아두는 chatRoomLive 만 다음 SPA 이동까지 옛 값으로 남는다 —
 *  host-selectors 의 "mid-session 재부착 안 함" 계약 그대로.)
 */
export const manifestReady: Promise<void> = (async () => {
    // ISOLATED context: storage 직접 읽기
    if (typeof browser !== 'undefined' && browser.storage?.local) {
        try {
            const res = await browser.storage.local.get(SELECTORS_STORAGE_KEY);
            const stored = res[SELECTORS_STORAGE_KEY] as SelectorsManifest | undefined;
            if (stored) setManifest(stored);
        } catch { /* storage 못 읽음 — bundled 유지 */ }
        return;
    }

    // MAIN world (inject)
    if (typeof window !== 'undefined') {
        // 듣기 먼저, 보내기 나중 — 순서가 반대면 그 사이에 온 응답을 놓친다.
        window.addEventListener('message', (e: MessageEvent) => {
            if (e.source !== window) return;
            if (e.data?.type !== SELECTORS_MESSAGE_TYPE) return;
            // 중복/구버전 수신은 setManifest 의 rev 단조 검사가 걸러낸다.
            setManifest(e.data.manifest);
        });

        // ISOLATED 가 이미 떠서 초기 push 를 놓쳤을 수 있으니 직접 요청도 보낸다.
        // 아직 ISOLATED 가 없으면 이 요청은 유실되지만, 그 경우 ISOLATED 가 곧 뜨면서
        // 보내는 초기 push 를 위 리스너가 받는다. 두 경로 중 하나는 반드시 걸린다.
        window.postMessage({ type: SELECTORS_REQUEST_TYPE }, '*');
    }
})();

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getAtPath<T = unknown>(obj: unknown, path: string): T | undefined {
    if (obj == null) return undefined;
    const parts = path.split('.');
    let cur: unknown = obj;
    for (const p of parts) {
        if (cur == null) return undefined;
        cur = (cur as Record<string, unknown>)[p];
    }
    return cur as T | undefined;
}

export function detectPageMode(
    pathname: string,
    config: PlatformHostConfig,
): 'live' | 'video' | 'unknown' {
    if (new RegExp(config.vodPathRegex).test(pathname)) return 'video';
    if (new RegExp(config.livePathRegex).test(pathname)) return 'live';
    return 'unknown';
}

export function extractChannelId(
    pathname: string,
    config: PlatformHostConfig,
): string | null {
    return pathname.split('/')[config.channelIdPathIndex] ?? null;
}

