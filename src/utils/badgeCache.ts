/**
 * 배지 목록 캐시 — `browser.storage.local`에 영속.
 *
 * 동기:
 *  - 배지 목록은 거의 변하지 않음 (가끔 추가/디자인 변경 정도)
 *  - 서버 요청 최소화 + 서버 다운 시에도 동작
 *
 * 동작:
 *  - cache hit + fresh(< TTL) → 캐시 반환, 네트워크 미접속
 *  - cache miss 또는 stale → 네트워크 fetch → 성공 시 캐시 갱신
 *  - 네트워크 fetch 실패 → 있는 캐시(stale 포함) 그대로 반환. 캐시도 없으면 throw
 *
 * 키 형식: `badges:<platform>:<scope>:<channel|global>`
 */
import { BadgeInterface } from '@/interfaces/chat';
import { PlatformAdapter } from '@/platform';

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일
const KEY_PREFIX = 'badges:';

interface CachedBadges {
    data: BadgeInterface[];
    fetchedAt: number;
}

interface FetchOpts {
    scope: 'global' | 'channel';
    channelLogin?: string;
}

function cacheKey(adapter: PlatformAdapter, opts: FetchOpts): string {
    const channel = opts.scope === 'channel' ? (opts.channelLogin ?? '') : 'global';
    return `${KEY_PREFIX}${adapter.type}:${opts.scope}:${channel}`;
}

async function loadCache(key: string): Promise<CachedBadges | null> {
    try {
        const res = await browser.storage.local.get(key);
        const v = res[key] as CachedBadges | undefined;
        if (!v || !Array.isArray(v.data) || typeof v.fetchedAt !== 'number') return null;
        return v;
    } catch {
        return null;
    }
}

async function saveCache(key: string, data: BadgeInterface[]): Promise<void> {
    try {
        await browser.storage.local.set({
            [key]: { data, fetchedAt: Date.now() } satisfies CachedBadges,
        });
    } catch (e) {
        console.warn('[badgeCache] save failed', e);
    }
}

export async function fetchBadgesCached(
    adapter: PlatformAdapter,
    opts: FetchOpts,
): Promise<BadgeInterface[]> {
    const key = cacheKey(adapter, opts);
    const cached = await loadCache(key);

    // fresh — 네트워크 안 침
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
        return cached.data;
    }

    // stale or miss — fetch 시도
    try {
        const data = await adapter.fetchBadges(opts);
        // empty 응답이 들어오면 캐시 덮어쓰지 않음 (서버 일시 오류 방어).
        // 실제로 빈 배지 셋이 정상인 경우엔 캐시가 없으니 그대로 반환.
        if (data.length > 0) {
            await saveCache(key, data);
        } else if (cached) {
            console.warn('[badgeCache] empty response — keeping stale cache', key);
            return cached.data;
        }
        return data;
    } catch (e) {
        if (cached) {
            console.warn('[badgeCache] fetch failed — using stale cache', key, e);
            return cached.data;
        }
        throw e;
    }
}
