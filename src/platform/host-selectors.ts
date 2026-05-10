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
import bundled from './bundled-selectors.json';

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

/**
 * Manifest가 외부 source(storage/postMessage)로 적용 시도까지 끝나면 resolve되는 promise.
 * 사용자(content script, inject 등)는 observer attach 전에 await 권장 — bundled로 attach
 * 하면 Twitch가 selector 바꿨을 때 새 OTA 값으로 자동 갱신 안 됨 (re-attach 필요).
 */
export const manifestReady: Promise<void> = (async () => {
    // ISOLATED context: storage 직접 읽기
    if (typeof browser !== 'undefined' && browser.storage?.local) {
        try {
            const res = await browser.storage.local.get('tbcv2-selectors-manifest');
            const stored = res['tbcv2-selectors-manifest'] as SelectorsManifest | undefined;
            if (stored) setManifest(stored);
        } catch { /* storage 못 읽음 — bundled 유지 */ }
        return;
    }

    // MAIN world (inject): browser undefined → ISOLATED content가 postMessage로 전송할 때까지 대기.
    // 200ms 안에 안 오면 그냥 bundled로 진행 (content script 부재 등 edge case).
    if (typeof window !== 'undefined') {
        await new Promise<void>((resolve) => {
            let done = false;
            const handler = (e: MessageEvent) => {
                if (e.source !== window) return;
                if (e.data?.type !== 'tbcv2-selectors-manifest') return;
                setManifest(e.data.manifest);
                if (!done) { done = true; window.removeEventListener('message', handler); resolve(); }
            };
            window.addEventListener('message', handler);
            setTimeout(() => {
                if (!done) { done = true; window.removeEventListener('message', handler); resolve(); }
            }, 200);
        });
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

/** Storage / postMessage broadcast용 key */
export const SELECTORS_STORAGE_KEY = 'tbcv2-selectors-manifest';
export const SELECTORS_MESSAGE_TYPE = 'tbcv2-selectors-manifest';
