/**
 * 직접 그린 채팅과 치지직 원본을 같은 페이지에서 나란히 찍는다 — src/render/chzzk-chat.css 기본 모양 맞추기용.
 *
 * 렌더러(src/render/chzzk-render.ts)를 esbuild로 묶어 페이지에 넣고, 소켓으로 받은 같은 채팅을
 * 원본 채팅창 왼쪽에 우리 모양으로 그린다. 다크와 라이트를 한 장씩, 후원·구독·선물 샘플(template-samples)을 한 장 찍는다.
 *
 * --cards: 샘플 대신 원본 채팅창에 진짜 후원·구독 카드가 뜰 때까지 시청자 많은 라이브를 돌며 기다렸다가
 * 다크와 라이트로 찍는다. 카드가 화면 안에 있는 동안 찍어야 하므로 뜨자마자 찍는다.
 *  - COMPARE_CHANNELS  돌아볼 라이브 수 (기본 8)
 *  - COMPARE_SECONDS   채널마다 기다리는 시간 (기본 180)
 *
 * 출력: captures/chzzk-chat-compare/<채널>-<theme>.png, --cards는 <채널>-card-<theme>.png
 * (실제 시청자 채팅이 찍히므로 커밋 금지)
 *
 * 실행: npx tsx scripts/capture/chzzk-chat-compare.ts [channelId] [--cards]
 */
import { chromium, type Page } from '@playwright/test';
import { buildSync } from 'esbuild';
import { mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import bundledManifest from '../../src/platform/bundled-selectors.prod.json' with { type: 'json' };
import { discoverChannels } from '../canary/discover-channels.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(REPO_ROOT, 'captures', 'chzzk-chat-compare');
const CARDS = process.argv.includes('--cards');
const CHANNEL_ARG = process.argv.slice(2).find(a => !a.startsWith('--'));
const CARD_CHANNELS = Math.max(1, parseInt(process.env.COMPARE_CHANNELS ?? '8', 10));
const CARD_SECONDS = Math.max(10, parseInt(process.env.COMPARE_SECONDS ?? '180', 10));

/** 원본 채팅창의 후원·구독 카드 — 항목 안 profile의 class로 알아본다 (chzzk-chat-style 실측) */
const HOST_CARD = '[class*="_is_donation_"], [class*="_is_subscription_"]';

type Theme = 'dark' | 'light' | 'cards';

async function shoot(page: Page, channel: string, theme: Theme, verified: string | undefined, name: string) {
    const box = await page.evaluate(({ theme, verified }) => {
        // 옛 규칙은 theme_dark class, 새 디자인 변수는 data-theme="light"를 본다 (기본이 다크)
        document.documentElement.classList.toggle('theme_dark', theme !== 'light');
        document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'theme_dark';
        const msg = [...document.querySelectorAll('[class*="_chatting_message_"]')].pop()!;
        let list: Element = msg;
        while (list.parentElement && !/^_item_/.test(list.className as string)) list = list.parentElement;
        list = list.parentElement!;
        const aside = list.closest('aside')!;
        const r = aside.getBoundingClientRect();
        const lr = list.getBoundingClientRect();
        let panel = document.getElementById('tbc-clone__chzzkui');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'tbc-clone__chzzkui';
            panel.className = 'tbcv2_chatTime_off';
            document.body.appendChild(panel);
        }
        Object.assign(panel.style, {
            position: 'fixed', zIndex: '99999', top: `${r.top}px`, left: `${r.left - r.width}px`,
            width: `${lr.width}px`, height: `${r.height}px`, overflow: 'hidden',
            background: getComputedStyle(aside).backgroundColor, flexDirection: 'column',
            justifyContent: 'flex-end', display: 'flex',
        });
        // 모아보기 창(#tbc-clone__chzzkui)처럼 채팅이 flex 항목이어야 위아래 여백이 겹치지 않는다
        const inner = document.createElement('div');
        inner.style.cssText = 'display: flex; flex-direction: column';
        panel.replaceChildren(inner);
        const n = list.children.length;
        const total = (window as unknown as { __tbcRenderInto: (p: HTMLElement, n: number, v?: string, samples?: boolean) => number })
            .__tbcRenderInto(inner, n, verified, theme === 'cards');
        return { x: r.left - r.width, y: r.top, width: r.width * 2, height: r.height, total };
    }, { theme, verified });
    const file = join(OUT_DIR, `${channel}-${name}.png`);
    await page.screenshot({ path: file, clip: box });
    console.log(`[compare] ${name} socket chats=${box.total} → ${file}`);
}

/** 원본 채팅창에 카드가 화면 안에 보이면 true */
function hostCardVisible(page: Page) {
    return page.evaluate((sel) => {
        const aside = document.querySelector('[class*="_chatting_message_"]')?.closest('aside');
        if (!aside) return false;
        const a = aside.getBoundingClientRect();
        return [...aside.querySelectorAll(sel)].some(el => {
            const r = el.getBoundingClientRect();
            return r.height > 0 && r.top >= a.top + 120 && r.bottom <= a.bottom - 150;
        });
    }, HOST_CARD);
}

async function main() {
    const bundle = buildSync({
        entryPoints: [join(REPO_ROOT, 'scripts/capture/chzzk-chat-compare-entry.ts')],
        bundle: true, write: false, format: 'iife', platform: 'browser',
        alias: { '@': join(REPO_ROOT, 'src') },
        define: { 'import.meta.env.MODE': '"production"', 'import.meta.env.DEV': 'false' },
    }).outputFiles[0].text;
    const css = readFileSync(join(REPO_ROOT, 'src/render/chzzk-chat.css'), 'utf8')
        + readFileSync(join(REPO_ROOT, 'src/entrypoints/chzzk.content/style.css'), 'utf8');
    const verified = (bundledManifest as { platforms: { chzzk: { constants?: Record<string, unknown> } } })
        .platforms.chzzk.constants?.verifiedBadgeImageUrl as string | undefined;

    mkdirSync(OUT_DIR, { recursive: true });
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, locale: 'ko-KR' });
    const channels = CHANNEL_ARG ? [CHANNEL_ARG] : await discoverChannels(ctx, { max: CARDS ? CARD_CHANNELS : 1 });
    const page = await ctx.newPage();
    await page.addInitScript(bundle);

    for (const channel of channels) {
        await page.goto(`https://chzzk.naver.com/live/${channel}`, { waitUntil: 'domcontentloaded' });
        try {
            await page.waitForSelector('[class*="_chatting_message_"]', { timeout: 30000 });
        } catch {
            console.log(`[compare] ${channel}: 채팅이 안 보여 넘어간다`);
            continue;
        }
        await page.addStyleTag({ content: css });
        if (!CARDS) {
            await page.waitForTimeout(15000);
            for (const theme of ['dark', 'light', 'cards'] as const) await shoot(page, channel, theme, verified, theme);
            break;
        }
        console.log(`[compare] ${channel}: 카드를 ${CARD_SECONDS}초까지 기다린다`);
        const until = Date.now() + CARD_SECONDS * 1000;
        while (Date.now() < until && !(await hostCardVisible(page))) await page.waitForTimeout(1000);
        if (!(await hostCardVisible(page))) continue;
        await shoot(page, channel, 'dark', verified, 'card-dark');
        await shoot(page, channel, 'light', verified, 'card-light');
        break;
    }
    await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
