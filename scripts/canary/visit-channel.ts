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

            // ── helpers ───────────────────────────────────────────────────────────
            const countOf = (s: string): number => {
                try { return document.querySelectorAll(s).length; } catch { return -1; }
            };

            // selector list를 top-level 콤마로 분리. `:has(a, b)` / `[x="a,b"]` 안의
            // 콤마는 건너뛴다 — 단순 split(',')은 그런 selector를 조각내 invalid로 만든다.
            const splitBranches = (selector: string): string[] => {
                const out: string[] = [];
                let depth = 0, quote: string | null = null, start = 0;
                for (let i = 0; i < selector.length; i++) {
                    const ch = selector[i];
                    if (quote) {
                        if (ch === '\\') i++;
                        else if (ch === quote) quote = null;
                        continue;
                    }
                    if (ch === '"' || ch === "'") { quote = ch; continue; }
                    if (ch === '(' || ch === '[') { depth++; continue; }
                    if (ch === ')' || ch === ']') { depth = Math.max(0, depth - 1); continue; }
                    if (ch === ',' && depth === 0) { out.push(selector.slice(start, i).trim()); start = i + 1; }
                }
                out.push(selector.slice(start).trim());
                return out.filter(b => b.length > 0);
            };

            // 채팅 item 목록 — 후보 검증 점수의 분모. selector가 깨진 상황에서도 잡히도록
            // 구조 앵커 여러 개를 OR로 쓴다 (일반 채팅 / 도네이션 둘 다 커버).
            const chatArea = document.querySelector('aside#aside-chatting, aside#vod-aside');
            const chatItems: Element[] = chatArea
                ? Array.from(chatArea.querySelectorAll('[class*="_item_"]'))
                    .filter(el => el.querySelector('[class*="_chatting_message_"], p[class*="_text_"], button[aria-haspopup="true"]'))
                : [];

            /**
             * 깨진 selector의 대체 후보를 라이브 DOM에서 만들어 직접 검증한다.
             *
             * 옛 auto-fix는 "같은 word를 가진 hash 후보가 2개 이상이면 애매하니 포기"
             * 였다. `_container_`처럼 흔한 word에선 항상 여러 개라서 사실상 영구 실패였고,
             * 실제로 rev 13 사고에서 canary가 감지는 했는데 PR을 못 냈다.
             * 여기서는 후보를 전부 만들어 cardinality로 채점해 오답을 걸러낸다.
             */
            const probeCandidates = (name: string, selector: string) => {
                const tokenRe = /_([a-z]+)_([a-z0-9]{4,})_/gi;
                const tokens = Array.from(selector.matchAll(tokenRe));
                if (tokens.length === 0) return [];

                // 페이지에 실제로 존재하는 class 전체
                const classes = new Set<string>();
                document.querySelectorAll('[class]').forEach(e => {
                    const cn = (e as HTMLElement).className;
                    if (typeof cn !== 'string') return;
                    cn.split(/\s+/).forEach(c => { if (c) classes.add(c); });
                });

                const built: Array<{ selector: string; replaced: string }> = [];
                for (const m of tokens) {
                    const token = m[0], word = m[1], oldHash = m[2];
                    const re = new RegExp('^_' + word + '_([a-z0-9]{4,})', 'i');
                    const hashes = new Set<string>();
                    for (const c of classes) {
                        const hm = c.match(re);
                        if (hm && hm[1] !== oldHash) hashes.add(hm[1]);
                    }
                    for (const h of hashes) {
                        built.push({
                            selector: selector.split(token).join(`_${word}_${h}_`),
                            replaced: `${token} → _${word}_${h}_`,
                        });
                    }
                }

                // 기대 cardinality — "원래 그 selector가 하던 일"의 형태.
                const CARD: Record<string, 'one' | 'atLeastOne' | 'anyDoc' | 'imgDoc'> = {
                    displayName: 'one',
                    usernameContainer: 'one',
                    messageText: 'atLeastOne',
                    chatRoomLive: 'anyDoc',
                    chatRoomVod: 'anyDoc',
                    badge: 'imgDoc',
                };
                const rule = CARD[name] ?? 'anyDoc';

                const scored = built.map(b => {
                    const docCount = countOf(b.selector);
                    let score = 0;
                    if (docCount > 0) {
                        if (rule === 'anyDoc') {
                            score = 1;
                        } else if (rule === 'imgDoc') {
                            // 모든 매칭이 <img>를 품어야 배지 selector로 쓸 수 있다.
                            let nodes: Element[] = [];
                            try { nodes = Array.from(document.querySelectorAll(b.selector)); } catch { /* skip */ }
                            score = nodes.length > 0 && nodes.every(n => !!n.getElementsByTagName('img')[0]) ? 1 : 0;
                        } else if (chatItems.length > 0) {
                            const per = chatItems.map(it => {
                                try { return it.querySelectorAll(b.selector).length; } catch { return -1; }
                            });
                            const ok = rule === 'one'
                                ? per.filter(c => c === 1).length
                                : per.filter(c => c >= 1).length;
                            score = ok / chatItems.length;
                        }
                    }
                    return { selector: b.selector, replaced: b.replaced, docCount, score };
                });

                // 0.9 미만은 오답으로 간주하고 버린다. 남은 것만 점수 내림차순.
                return scored.filter(x => x.score >= 0.9).sort((a, b) => b.score - a.score);
            };

            const results: Array<{
                name: string; selector: string; count: number; required: boolean;
                matchedClasses: string[] | null;
                branchCounts: Array<{ selector: string; count: number }> | null;
                candidates: Array<{ selector: string; replaced: string; docCount: number; score: number }> | null;
            }> = [];

            for (const [name, value] of Object.entries(sel)) {
                if (typeof value !== 'string') continue;
                // foldedClassSubstring은 selector가 아니라 class substring — 매칭 대상 X.
                if (name === 'foldedClassSubstring') continue;

                let count = 0;
                let matchedClasses: string[] | null = null;
                try {
                    const nodes = document.querySelectorAll(value);
                    count = nodes.length;
                    if (nodes[0]) matchedClasses = Array.from((nodes[0] as Element).classList);
                } catch { /* invalid selector */ }

                const branches = splitBranches(value);
                const branchCounts = branches.length > 1
                    ? branches.map(b => ({ selector: b, count: countOf(b) }))
                    : null;

                const required = requiredNames.has(name);
                const candidates = (required && count === 0) ? probeCandidates(name, value) : null;

                results.push({ name, selector: value, count, required, matchedClasses, branchCounts, candidates });
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
                chatItemCount: chatItems.length,
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
            chatItemCount: result.chatItemCount,
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
