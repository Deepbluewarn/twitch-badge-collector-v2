/**
 * 채널 하나 방문 → selector 매칭 + 배지 URL 수집. 브라우저 context는 호출자가 관리.
 * 여러 채널 병렬로 호출 가능 (같은 browser의 다른 page).
 */
import type { BrowserContext } from '@playwright/test';
import type { ChannelVisitResult, SelectorSample } from './snapshot-types.ts';

interface VisitOpts {
    url: string;
    /** live | video */
    pageMode: 'live' | 'video';
    /** selector 매핑 (bundled manifest.platforms.chzzk.selectors) */
    selectors: Record<string, unknown>;
    /** 이 mode에서 반드시 매칭돼야 하는 selector 이름들 */
    requiredList: string[];
    /** 채팅 message element 대기 최대 초 */
    chatWaitTimeoutMs?: number;
}

export async function visitChannel(context: BrowserContext, opts: VisitOpts): Promise<ChannelVisitResult> {
    const page = await context.newPage();
    try {
        await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Anchor layer 판정
        const anchorSel = opts.pageMode === 'live' ? opts.selectors.chatRoomLive : opts.selectors.chatRoomVod;
        let anchorLayer: ChannelVisitResult['anchorLayer'] = 'none';
        try {
            await page.waitForSelector(anchorSel as string, { timeout: 15000 });
            anchorLayer = 'L1';
        } catch {
            try {
                const l2 = opts.pageMode === 'live' ? 'aside#aside-chatting' : 'aside#vod-aside';
                await page.waitForSelector(l2, { timeout: 5000 });
                anchorLayer = 'L2';
            } catch {
                try {
                    await page.waitForSelector('aside[aria-label*="채팅"], [role="log"]', { timeout: 5000 });
                    anchorLayer = 'L3';
                } catch {
                    anchorLayer = 'none';
                }
            }
        }

        // 채팅 message 실 등장 대기
        try {
            await page.waitForSelector('[class*="_chatting_message_"]', {
                timeout: opts.chatWaitTimeoutMs ?? 25000,
            });
        } catch { /* 채팅 없는 방송 가능 */ }
        await page.waitForTimeout(3000);

        // 페이지에서 selector 매칭 + 배지 URL 수집
        const result = await page.evaluate(({ sel, requiredList, badgeSel }: {
            sel: Record<string, unknown>;
            requiredList: string[];
            badgeSel: string;
        }) => {
            (globalThis as unknown as { __name?: (fn: unknown) => unknown }).__name ??= (fn) => fn;
            const requiredNames = new Set(requiredList);

            const results: Array<{ name: string; selector: string; count: number; required: boolean; matchedClasses: string[] | null }> = [];
            for (const [name, value] of Object.entries(sel)) {
                if (typeof value !== 'string') continue;
                let count = 0;
                let matchedClasses: string[] | null = null;
                try {
                    const nodes = document.querySelectorAll(value);
                    count = nodes.length;
                    if (nodes[0]) matchedClasses = Array.from((nodes[0] as Element).classList);
                } catch { /* invalid selector */ }
                results.push({ name, selector: value, count, required: requiredNames.has(name), matchedClasses });
            }

            // 배지 URL 수집: badge selector 매칭된 element 안의 <img> 전부.
            // 구독 배지(`/glive/subscription/`)는 채널별 개별 자산이라 인벤토리 대상 X —
            // 우리가 관리하는 건 "chzzk 공용/글로벌 배지" 리스트임.
            const badgeUrls = new Set<string>();
            try {
                const badgeContainers = document.querySelectorAll(badgeSel);
                for (const c of Array.from(badgeContainers)) {
                    const img = c.querySelector('img');
                    if (!img || !img.src) continue;
                    if (img.src.includes('/glive/subscription/')) continue;
                    badgeUrls.add(img.src);
                }
            } catch { /* invalid selector */ }

            // sample skeleton
            let sampleSkeleton: string | null = null;
            const anchor = document.querySelector('aside#aside-chatting, aside#vod-aside');
            if (anchor) {
                const candidates = Array.from(anchor.querySelectorAll<HTMLElement>('div[class*="_item_"], div[class*="_chatting_"]'));
                const chat = candidates.find(el => el.querySelector('button, [class*="_nickname_"], [class*="_text_"]')) ?? candidates[0];
                if (chat) {
                    const cloned = chat.cloneNode(true) as HTMLElement;
                    const walk = (n: Node) => {
                        for (const c of Array.from(n.childNodes)) {
                            if (c.nodeType === Node.TEXT_NODE) c.textContent = '';
                            else walk(c);
                        }
                    };
                    walk(cloned);
                    sampleSkeleton = cloned.outerHTML.slice(0, 4000);
                }
            }

            return {
                selectors: results,
                sampleSkeleton,
                badgeUrls: Array.from(badgeUrls),
            };
        }, {
            sel: opts.selectors,
            requiredList: opts.requiredList,
            badgeSel: opts.selectors.badge as string,
        });

        return {
            url: opts.url,
            ok: true,
            anchorLayer,
            selectors: result.selectors as SelectorSample[],
            sampleSkeleton: result.sampleSkeleton,
            badgeUrls: result.badgeUrls,
        };
    } catch (e) {
        return {
            url: opts.url,
            ok: false,
            error: String(e).slice(0, 500),
            anchorLayer: 'none',
            selectors: [],
            sampleSkeleton: null,
            badgeUrls: [],
        };
    } finally {
        await page.close();
    }
}
