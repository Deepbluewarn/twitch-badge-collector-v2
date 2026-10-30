/**
 * Chzzk 채팅 모양 수집기 — 라이브 여러 채널의 host 채팅 DOM을 보고 구조와 계산된 스타일을 모은다.
 * 소켓 채팅을 직접 그릴 때(src/render/chzzk-chat.css)의 기본 모양을 원본에 맞추는 근거 자료.
 *
 * 채팅 항목마다 요소를 "구조 경로"(해시를 뗀 class 이름의 사슬)로 묶고, 경로별로 계산된 스타일 값의
 * 분포를 센다. 본문·닉네임 글자와 이미지 주소는 기록하지 않는다. 다크 테마로 본 뒤 html의
 * theme_dark를 떼고 한 번 더 본다.
 *
 * 출력: captures/chzzk-chat-style/<ISO 시각>.json
 *
 * env:
 *  - STYLE_CHANNELS  방문할 라이브 수 (기본 12)
 *  - STYLE_SECONDS   채널마다 머무는 시간 (기본 90). 10초마다 표본을 뜬다.
 *
 * 실행: npx tsx scripts/capture/chzzk-chat-style.ts
 */
import { chromium, type BrowserContext } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { discoverChannels } from '../canary/discover-channels.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHANNELS = Math.max(1, parseInt(process.env.STYLE_CHANNELS ?? '12', 10));
const SECONDS = Math.max(10, parseInt(process.env.STYLE_SECONDS ?? '90', 10));

const PROPS = [
    'display', 'position', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'color',
    'background-color', 'background-image', 'padding', 'margin', 'border-radius', 'border',
    'vertical-align', 'gap', 'align-items', 'flex-direction', 'flex-wrap', 'white-space', 'word-break',
    'overflow-wrap', 'letter-spacing', 'text-overflow', 'overflow', 'opacity', 'max-width', 'object-fit',
    '-webkit-background-clip', 'cursor',
];

/** 경로 → 속성 → 값 → 횟수 */
type Stats = Record<string, Record<string, Record<string, number>>>;

interface Sample {
    theme: 'dark' | 'light';
    /** 항목 종류 키(항목 안 class 이름 집합) → 개수 */
    kinds: Record<string, number>;
    stats: Stats;
    /** 경로 → 등장 횟수 */
    paths: Record<string, number>;
}

async function sample(page: import('@playwright/test').Page, theme: 'dark' | 'light'): Promise<Sample> {
    return page.evaluate(({ PROPS, theme }) => {
        const strip = (c: string) => c.replace(/_[a-z0-9]{5}_\d+/g, '_').trim();
        const cls = (e: Element) => (typeof e.className === 'string' ? e.className : '')
            .split(/\s+/).filter(Boolean).map(strip).sort().join('.');
        const html = document.documentElement;
        const hadDark = html.classList.contains('theme_dark');
        if (theme === 'light') html.classList.remove('theme_dark');
        const out = { theme, kinds: {} as Record<string, number>, stats: {} as Record<string, Record<string, Record<string, number>>>, paths: {} as Record<string, number> };
        try {
            const msgs = [...document.querySelectorAll('[class*="_chatting_message_"]')];
            const items = new Set<Element>();
            for (const m of msgs) {
                // 목록 항목: 채팅 목록 바로 아래 자식
                let it: Element = m;
                while (it.parentElement && !/^_item_/.test(strip(it.className as string))) it = it.parentElement;
                items.add(it.parentElement ? it : m);
            }
            // 메시지 칸이 없는 항목(후원·구독 카드 등)도 같은 목록에 있다
            const lists = new Set([...items].map(i => i.parentElement).filter(Boolean) as Element[]);
            for (const l of lists) for (const c of l.children) items.add(c);
            for (const it of items) {
                const names = new Set<string>();
                const walk = (e: Element, path: string) => {
                    const key = `${path}>${e.tagName.toLowerCase()}${cls(e) ? '.' + cls(e) : ''}`;
                    for (const n of cls(e).split('.')) if (n) names.add(n);
                    out.paths[key] = (out.paths[key] ?? 0) + 1;
                    const cs = getComputedStyle(e);
                    const r = e.getBoundingClientRect();
                    const s = (out.stats[key] ??= {});
                    const add = (p: string, v: string) => { const m = (s[p] ??= {}); m[v] = (m[v] ?? 0) + 1; };
                    for (const p of PROPS) add(p, cs.getPropertyValue(p));
                    if (e.tagName === 'IMG' || e.tagName === 'SVG') add('box', `${Math.round(r.width)}x${Math.round(r.height)}`);
                    else add('height', String(Math.round(r.height)));
                    for (const c of e.children) walk(c, key);
                };
                walk(it, '');
                const k = [...names].sort().join(' ');
                out.kinds[k] = (out.kinds[k] ?? 0) + 1;
            }
        } finally {
            if (hadDark) html.classList.add('theme_dark');
        }
        return out;
    }, { PROPS, theme });
}

function merge(into: Stats, from: Stats) {
    for (const [path, props] of Object.entries(from)) {
        const p = (into[path] ??= {});
        for (const [prop, vals] of Object.entries(props)) {
            const v = (p[prop] ??= {});
            for (const [val, n] of Object.entries(vals)) v[val] = (v[val] ?? 0) + n;
        }
    }
}

async function visit(ctx: BrowserContext, channelId: string, acc: Record<'dark' | 'light', Stats>, kinds: Record<string, number>, paths: Record<string, number>) {
    const page = await ctx.newPage();
    try {
        await page.goto(`https://chzzk.naver.com/live/${channelId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.evaluate(() => { (globalThis as unknown as { __name?: unknown }).__name ??= (f: unknown) => f; });
        await page.waitForSelector('[class*="_chatting_message_"]', { timeout: 30000 });
        const until = Date.now() + SECONDS * 1000;
        let n = 0;
        while (Date.now() < until) {
            await page.waitForTimeout(10000);
            await page.evaluate(() => { (globalThis as unknown as { __name?: unknown }).__name ??= (f: unknown) => f; });
            for (const theme of ['dark', 'light'] as const) {
                const s = await sample(page, theme);
                merge(acc[theme], s.stats);
                if (theme === 'dark') {
                    for (const [k, c] of Object.entries(s.kinds)) kinds[k] = (kinds[k] ?? 0) + c;
                    for (const [k, c] of Object.entries(s.paths)) paths[k] = (paths[k] ?? 0) + c;
                }
            }
            n++;
        }
        console.log(`[style] ${channelId} ${n} samples`);
    } catch (e) {
        console.warn(`[style] ${channelId} failed: ${(e as Error).message.split('\n')[0]}`);
    } finally {
        await page.close();
    }
}

async function main() {
    const outDir = join(REPO_ROOT, 'captures', 'chzzk-chat-style');
    mkdirSync(outDir, { recursive: true });
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'ko-KR' });
    const channels = await discoverChannels(ctx, { max: CHANNELS });
    console.log(`[style] ${channels.length} channels, ${SECONDS}s each`);
    const acc = { dark: {} as Stats, light: {} as Stats };
    const kinds: Record<string, number> = {};
    const paths: Record<string, number> = {};
    await Promise.all(channels.map(c => visit(ctx, c, acc, kinds, paths)));
    await browser.close();
    const file = join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(file, JSON.stringify({ capturedAt: new Date().toISOString(), channels: channels.length, seconds: SECONDS, kinds, paths, styles: acc }, null, 1));
    console.log(`[style] → ${file}`);
}

main().catch(e => { console.error(e); process.exit(1); });
