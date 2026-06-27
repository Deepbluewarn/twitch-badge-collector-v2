/**
 * OTA selectors 갱신 — background SW에서 사용.
 *
 * Source: jsDelivr CDN (GitHub raw 미러). 무료, rate limit 관대, 12h 캐시 (긴급 fix는
 * https://purge.jsdelivr.net 으로 강제 갱신 가능).
 *
 * Flow:
 *  1. fetch JSON
 *  2. validate via setManifest (schema/rev 체크 내장)
 *  3. 적용 성공 시 storage.local에 저장 (다음 page reload 때 모든 컨텍스트가 읽음)
 *  4. 실패 (네트워크 / 검증) 시 silent — bundled / 기존 storage 값 유지
 */
import { setManifest, getManifest, SelectorsManifest } from './host-selectors';

// OTA target은 bundled-selectors.prod.json (production 검증된 selector).
// master `bundled-selectors.json`은 옛 빌드 호환용으로만 유지 (그쪽은 v2.18.15 이전
// 사용자가 fetch하는 URL). 신 빌드(이 코드 포함)는 .prod.json만 참조하므로 master
// 파일 자유 편집해도 신 사용자에 영향 X.
const SELECTORS_URL = 'https://cdn.jsdelivr.net/gh/Deepbluewarn/twitch-badge-collector-v2@master/src/platform/bundled-selectors.prod.json';
const STORAGE_KEY = 'tbcv2-selectors-manifest';
const FETCHED_AT_KEY = 'tbcv2-selectors-fetched-at';
const TTL_MS = 6 * 60 * 60 * 1000; // 6시간

export async function fetchAndApplyOta(): Promise<{ updated: boolean; rev?: number; error?: string }> {
    try {
        const res = await fetch(SELECTORS_URL, { cache: 'no-cache' });
        if (!res.ok) return { updated: false, error: `HTTP ${res.status}` };
        const json = await res.json();

        const beforeRev = getManifest().rev;
        const applied = setManifest(json);
        if (!applied) {
            // schemaVersion mismatch 또는 rev <= 현재 → 무시
            return { updated: false, rev: beforeRev };
        }

        const afterRev = getManifest().rev;
        // 적용된 것을 storage에도 영속화 (다른 컨텍스트가 다음 reload 때 사용)
        await browser.storage.local.set({
            [STORAGE_KEY]: json as SelectorsManifest,
            [FETCHED_AT_KEY]: Date.now(),
        });
        console.log('[ota-fetch] applied selectors rev', afterRev);
        return { updated: true, rev: afterRev };
    } catch (e) {
        console.warn('[ota-fetch] fetch failed', e);
        return { updated: false, error: String(e) };
    }
}

export async function fetchIfStale(): Promise<void> {
    try {
        const res = await browser.storage.local.get(FETCHED_AT_KEY);
        const fetchedAt = res[FETCHED_AT_KEY] as number | undefined;
        if (fetchedAt && Date.now() - fetchedAt < TTL_MS) {
            // fresh — skip
            return;
        }
    } catch { /* fall through and fetch */ }
    await fetchAndApplyOta();
}
