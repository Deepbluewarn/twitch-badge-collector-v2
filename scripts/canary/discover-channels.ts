/**
 * chzzk 라이브 채널 discovery — 여러 소스 union으로 최대한 다양한 채널 pool 확보.
 *
 * 소스:
 *  1. API `sortType=POPULAR` (인기순, viewer desc)
 *  2. API `sortType=LATEST` (최근 시작한 방송, 다른 스트리머 grouping)
 *  3. 홈 페이지 스크레이핑 fallback (API 지역 차단 시)
 *
 * 배지 커버리지 확보엔 다양성이 중요 (인기 top 30만 매일 겹치면 신규 배지 안 잡힘).
 */
import type { BrowserContext } from '@playwright/test';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

interface LiveEntry {
    channelId: string;
    concurrentUserCount: number;
}

async function fetchApiLives(sortType: 'POPULAR' | 'LATEST', size: number): Promise<LiveEntry[]> {
    try {
        const url = `https://api.chzzk.naver.com/service/v1/lives?size=${size}&sortType=${sortType}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        });
        if (!res.ok) {
            console.warn(`[discover] chzzk API ${sortType} status=${res.status}`);
            return [];
        }
        const json = await res.json() as {
            content?: {
                data?: Array<{
                    channelId?: string;
                    channel?: { channelId?: string };
                    concurrentUserCount?: number;
                }>
            }
        };
        const items = json?.content?.data ?? [];
        return items
            .map(it => ({
                channelId: it.channelId ?? it.channel?.channelId ?? '',
                concurrentUserCount: it.concurrentUserCount ?? 0,
            }))
            .filter(it => it.channelId);
    } catch (e) {
        console.warn(`[discover] API ${sortType} fail: ${String(e).slice(0, 200)}`);
        return [];
    }
}

async function fetchHomeChannels(context: BrowserContext, limit: number): Promise<string[]> {
    const page = await context.newPage();
    try {
        await page.goto('https://chzzk.naver.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        try {
            await page.waitForSelector('a[href*="/live/"]', { timeout: 15000 });
        } catch { return []; }
        // 스크롤 아래로 유도 → lazy 카드 로드
        await page.evaluate(() => window.scrollBy(0, 2000));
        await page.waitForTimeout(2000);
        return await page.evaluate((max) => {
            (globalThis as unknown as { __name?: (fn: unknown) => unknown }).__name ??= (fn) => fn;
            const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/live/"]'));
            const seen = new Set<string>();
            for (const a of links) {
                const m = a.getAttribute('href')?.match(/^\/live\/([a-f0-9]{20,})/);
                if (m && !seen.has(m[1])) {
                    seen.add(m[1]);
                    if (seen.size >= max) break;
                }
            }
            return Array.from(seen);
        }, limit);
    } finally {
        await page.close();
    }
}

/**
 * union으로 최대한 다양한 채널 확보. 반환 순서 = concurrentUserCount desc 우선, 그 다음 발견 순서.
 */
export async function discoverChannels(context: BrowserContext, opts: { max: number }): Promise<string[]> {
    const perSource = Math.min(50, opts.max); // chzzk API가 size 상한 있음
    const [popular, latest] = await Promise.all([
        fetchApiLives('POPULAR', perSource),
        fetchApiLives('LATEST', perSource),
    ]);

    const merged = new Map<string, number>(); // channelId → viewer count
    for (const e of popular) {
        merged.set(e.channelId, Math.max(merged.get(e.channelId) ?? 0, e.concurrentUserCount));
    }
    for (const e of latest) {
        merged.set(e.channelId, Math.max(merged.get(e.channelId) ?? 0, e.concurrentUserCount));
    }

    // API가 아무것도 못 가져왔으면 홈 스크레이핑
    if (merged.size === 0) {
        console.warn('[discover] API 소스 모두 실패 — 홈 fallback');
        const homeIds = await fetchHomeChannels(context, opts.max);
        return homeIds;
    }

    console.log(`[discover] popular=${popular.length} + latest=${latest.length} → union ${merged.size}`);

    return Array.from(merged.entries())
        .sort(([, a], [, b]) => b - a)
        .map(([id]) => id)
        .slice(0, opts.max);
}

/** 다시보기는 이보다 길어야 고른다 (짧은 클립성 다시보기는 채팅이 거의 없다) */
const MIN_VOD_SECONDS = 30 * 60;

/**
 * 다시보기 번호. 인기 라이브 채널마다 가장 최근 다시보기 하나. 인기 채널이라 채팅이 많다.
 * 방송 중인 채널의 최근 다시보기는 지난 방송이라 끝까지 올라와 있다.
 */
export async function discoverVideos(opts: { max: number }): Promise<number[]> {
    const channels = (await fetchApiLives('POPULAR', 50)).map(e => e.channelId);
    const videos: number[] = [];
    for (const id of channels) {
        if (videos.length >= opts.max) break;
        try {
            const res = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${id}/videos?sortType=LATEST&pagingType=PAGE&page=0&size=5`, {
                headers: { 'User-Agent': UA, 'Accept': 'application/json' },
            });
            if (!res.ok) continue;
            const json = await res.json() as { content?: { data?: Array<{ videoNo?: number; videoType?: string; duration?: number; adult?: boolean }> } };
            const pick = (json.content?.data ?? []).find(v => v.videoNo && v.videoType === 'REPLAY' && (v.duration ?? 0) >= MIN_VOD_SECONDS && !v.adult);
            if (pick?.videoNo) videos.push(pick.videoNo);
        } catch (e) {
            console.warn(`[discover] ${id} 다시보기 목록 fail: ${String(e).slice(0, 200)}`);
        }
    }
    console.log(`[discover] 다시보기 ${videos.length}개 (인기 채널 ${channels.length}곳에서)`);
    return videos;
}
