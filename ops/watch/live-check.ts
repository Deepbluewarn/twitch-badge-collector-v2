/**
 * 6시간마다: 최신 릴리스 확장을 Chromium에 올려 치지직(소켓 모드 끔, 켬), 트위치 라이브에 붙이고
 * 모아보기 창에 채팅이 들어오는지 본다. 치지직을 여는 김에 JS, CSS 번들을 받아 bundle.ts로 검사한다.
 *
 * 결과는 보고서 두 개로 상황실에 넘긴다: checks/live.json(경로마다 수집 창이 비었는지), checks/bundle.json(번들 의존, 변화).
 * 방송에 채팅이 없거나 페이지를 못 열면 그 경로는 확인 못 함이다(깨짐이 아니다).
 *
 * 필터는 "빈 키워드 포함" 하나만 넣는다. 글자가 있는 채팅은 전부 통과하므로 창의 채팅 수가 곧 수집 수다.
 * 사용자 Chrome, 프로필은 건드리지 않는다. 매번 빈 임시 프로필을 쓴다.
 *
 * 플래그: --seconds=60 (채널마다 지켜보는 시간)
 */
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import type { Finding } from './incidents.ts';
import { checkDependencies, diffLines, diffSignals, judgeDependencies, extractSignals, isChzzkBundle, type BundleFile, type BundleSignals, type Dependency, type SignalDiff } from './bundle.ts';
import { CACHE_DIR, REPO, UA, attempt, fetchJson, isError, readJson, writeCheck, writeJson } from './state.ts';

// Playwright 오류는 브라우저 실행 로그까지 붙어 길다. 첫 줄만 남긴다
const firstLine = (e: unknown) => String((e as Error)?.message ?? e).split('\n')[0].slice(0, 300);
const SECONDS = Number(process.argv.find((a) => a.startsWith('--seconds='))?.slice(10) ?? 60);

export interface LiveRun {
    name: string;
    url?: string;
    /** 방송 쪽 채팅 줄 수 (판정 근거가 있는지) */
    host: number;
    /** 모아보기 창 채팅 수 */
    pane: number;
    /** 모아보기 창 채팅 중 배지 이미지가 붙은 것 */
    paneWithBadge: number;
    /** 모아보기 창 채팅 중 닉네임이 비지 않은 것 */
    paneWithName: number;
    verdict: 'ok' | 'broken' | 'unknown';
    error?: string;
}

export interface LiveResult {
    at: number;
    version?: string;
    runs: LiveRun[];
    error?: string;
}

export interface BundleResult {
    at: number;
    signals: BundleSignals;
    dependencies: Dependency[];
    diff: SignalDiff;
    /** 변화가 있었던 실행만 쌓는다. 최근 30개 */
    history: { at: number; diff: SignalDiff }[];
}

async function latestExtension(): Promise<{ version: string; dir: string }> {
    const rel = await fetchJson<{ tag_name: string; assets: { name: string; browser_download_url: string }[] }>(
        `https://api.github.com/repos/${REPO}/releases/latest`,
    );
    const version = rel.tag_name.replace(/^v/, '');
    const dir = join(CACHE_DIR, 'ext', version);
    if (!existsSync(join(dir, 'manifest.json'))) {
        const asset = rel.assets.find((a) => a.name.endsWith('-chrome.zip'));
        if (!asset) throw new Error(`${rel.tag_name}에 chrome zip 없음`);
        const res = await fetch(asset.browser_download_url);
        if (!res.ok) throw new Error(`zip ${res.status}`);
        mkdirSync(dir, { recursive: true });
        const zip = join(dir, 'ext.zip');
        writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
        // ovm엔 unzip이 없다
        execFileSync('python3', ['-m', 'zipfile', '-e', zip, dir]);
        rmSync(zip);
    }
    return { version, dir };
}

async function chzzkLive(): Promise<string> {
    const lives = await fetchJson<{ content: { data: { channel: { channelId: string } }[] } }>(
        'https://api.chzzk.naver.com/service/v1/lives?size=10&sortType=POPULAR',
    );
    // 1위는 채팅이 너무 빨라 창이 상한에 걸린다. 5위쯤
    const list = lives.content.data;
    return `https://chzzk.naver.com/live/${list[Math.min(4, list.length - 1)].channel.channelId}`;
}

async function twitchLive(ctx: BrowserContext): Promise<string> {
    const page = await ctx.newPage();
    try {
        await page.goto('https://www.twitch.tv/directory/all', { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForSelector('a[data-a-target="preview-card-image-link"]', { timeout: 30_000 });
        const hrefs = await page.$$eval('a[data-a-target="preview-card-image-link"]', (as) => as.map((a) => a.getAttribute('href') ?? ''));
        const href = hrefs.filter((h) => /^\/[\w]+$/.test(h))[4] ?? hrefs[0];
        return `https://www.twitch.tv${href}`;
    } finally {
        await page.close();
    }
}

async function configure(ctx: BrowserContext, id: string, socket: boolean): Promise<void> {
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${id}/popup.html`);
    await page.evaluate(async (socket) => {
        const { chrome } = globalThis as unknown as { chrome: { storage: { local: { set(items: object): Promise<void> } } } };
        const filter = ['chzzk', 'twitch'].map((platform) => ({
            filterType: 'include',
            id: `watch-${platform}`,
            filterNote: '현황판 시험',
            platform,
            filters: [{ category: 'keyword', id: `watch-${platform}-1`, type: 'include', value: '' }],
        }));
        await chrome.storage.local.set({ filter, 'tbc-socket-rollout-bucket': socket ? 0 : 99 });
    }, socket);
    await page.close();
}

async function watch(ctx: BrowserContext, name: string, url: string, platform: 'chzzk' | 'twitch', files?: BundleFile[]): Promise<LiveRun> {
    const page: Page = await ctx.newPage();
    const pending: Promise<void>[] = [];
    if (files) {
        page.on('response', (res) => {
            if (!isChzzkBundle(res.url())) return;
            pending.push(res.text().then((text) => void files.push({ url: res.url(), text }), () => {}));
        });
    }
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForTimeout(SECONDS * 1000);
        await Promise.all(pending);
        const counts = await page.evaluate((platform) => {
            const items = [...document.querySelectorAll(`#${platform}-container [data-tbc-chat-key], #tbc-floating-${platform} [data-tbc-chat-key]`)];
            const host = platform === 'chzzk'
                ? document.querySelectorAll('aside#aside-chatting [class*="_chatting_message_"]').length
                : document.querySelectorAll('.chat-line__message').length;
            return {
                host,
                pane: items.length,
                paneWithBadge: items.filter((el) => el.querySelector('img')).length,
                paneWithName: items.filter((el) => (el.textContent ?? '').trim().length > 0).length,
            };
        }, platform);
        const verdict = counts.pane > 0 ? 'ok' : counts.host > 0 ? 'broken' : 'unknown';
        return { name, url, ...counts, verdict };
    } catch (e) {
        return { name, url, host: 0, pane: 0, paneWithBadge: 0, paneWithName: 0, verdict: 'unknown', error: firstLine(e) };
    } finally {
        await page.close();
    }
}

async function main(): Promise<void> {
    const result: LiveResult = { at: Date.now(), runs: [] };
    const files: BundleFile[] = [];
    const profile = mkdtempSync(join(tmpdir(), 'tbc-watch-'));
    let ctx: BrowserContext | undefined;
    try {
        const ext = await latestExtension();
        result.version = ext.version;
        ctx = await chromium.launchPersistentContext(profile, {
            channel: 'chromium',
            headless: true,
            userAgent: UA,
            viewport: { width: 1500, height: 950 },
            args: [`--disable-extensions-except=${ext.dir}`, `--load-extension=${ext.dir}`],
        });
        const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 30_000 }));
        const id = new URL(worker.url()).host;

        const chzzkUrl = await chzzkLive();
        await configure(ctx, id, false);
        result.runs.push(await watch(ctx, '치지직 (소켓 끔)', chzzkUrl, 'chzzk', files));
        await configure(ctx, id, true);
        result.runs.push(await watch(ctx, '치지직 (소켓 켬)', chzzkUrl, 'chzzk'));
        const twitchUrl = await attempt(() => twitchLive(ctx!));
        if (typeof twitchUrl === 'string') result.runs.push(await watch(ctx, '트위치', twitchUrl, 'twitch'));
        else result.runs.push({ name: '트위치', host: 0, pane: 0, paneWithBadge: 0, paneWithName: 0, verdict: 'unknown', error: `방송 찾기 실패: ${twitchUrl.error}` });
    } catch (e) {
        result.error = firstLine(e);
    } finally {
        await ctx?.close();
        rmSync(profile, { recursive: true, force: true });
    }
    writeJson('live', result);
    writeCheck({
        check: 'live',
        at: result.at,
        status: result.error ? 'error' : result.runs.some((r) => r.verdict === 'broken') ? 'issue' : 'ok',
        note: result.error,
        unknownParts: result.runs.filter((r) => r.verdict === 'unknown').map((r) => ({ part: r.name, note: r.error ?? '방송 채팅 없음' })),
        findings: result.runs.filter((r) => r.verdict === 'broken').map((r) => ({
            key: `live:${r.name}:empty-pane`,
            part: r.name,
            level: 'broken',
            title: `확장 실제 시험 ${r.name}: 수집 창이 비었음`,
            lines: [`방송 채팅 ${r.host}줄, 수집 창 0줄 (v${result.version})`, ...(r.url ? [r.url] : [])],
        })),
    });

    // 확장을 못 띄웠어도 번들 검사는 한다. 확장 없는 브라우저로 페이지만 연다
    if (!files.length) {
        const fallback = await attempt(async () => {
            const browser = await chromium.launch();
            try {
                const ctx = await browser.newContext({ userAgent: UA });
                await watch(ctx, '번들', await chzzkLive(), 'chzzk', files);
            } finally {
                await browser.close();
            }
        });
        if (isError(fallback)) console.error(`[live] 번들 받기 실패: ${fallback.error}`);
    }

    if (!files.length) {
        writeCheck({ check: 'bundle', at: Date.now(), status: 'unknown', note: '치지직 번들을 받지 못함', findings: [] });
    } else {
        const prev = readJson<BundleResult>('bundle');
        const signals = extractSignals(files);
        const dependencies = judgeDependencies(await checkDependencies(files, signals), prev?.dependencies);
        const diff = diffSignals(prev?.signals, signals);
        const changed = Object.keys(diff.added).length + Object.keys(diff.removed).length > 0;
        const history = [...(changed ? [{ at: Date.now(), diff }] : []), ...(prev?.history ?? [])].slice(0, 30);
        writeJson('bundle', { at: Date.now(), signals, dependencies, diff, history } satisfies BundleResult);
        const findings: Finding[] = dependencies.filter((d) => d.status === 'gone').map((d) => ({
            key: `bundle:gone:${d.name}`,
            level: 'risk',
            title: `번들에서 확장이 기대던 이름이 사라짐: ${d.name}`,
            lines: [`${d.kind}, ${d.where}${d.detail ? `, ${d.detail}` : ''}`],
        }));
        // 가장 최근 변화 하나. 다음 변화가 오면 조용히 닫힌다
        if (history[0]) findings.push({ key: `bundle-change:${history[0].at}`, level: 'info', title: '치지직 번들 변화', lines: diffLines(history[0].diff).map((l) => (l.length > 300 ? `${l.slice(0, 300)}…` : l)) });
        writeCheck({ check: 'bundle', at: Date.now(), status: findings.length ? 'issue' : 'ok', findings });
    }
    console.log(`[live] ${new Date().toISOString()} ${result.version ?? '-'} ${result.runs.map((r) => `${r.name} ${r.verdict} ${r.pane}/${r.host}`).join(', ')}${result.error ? ` error ${result.error}` : ''}`);
}

main().catch((err) => {
    console.error(`[live] ${new Date().toISOString()}`, err);
    process.exit(1);
});
