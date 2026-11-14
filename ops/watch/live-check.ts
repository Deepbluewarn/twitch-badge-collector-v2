/**
 * 최신 릴리스 확장을 Chromium에 올려 라이브에 붙이고 수집 창에 채팅이 들어오는지 본다.
 *
 *   live-check.ts         6시간마다: 치지직(소켓 모드 끔), 트위치. 치지직을 여는 김에 JS, CSS 번들을 받아 bundle.ts로 검사한다.
 *                         보고서 checks/live.json(경로마다 수집 창이 없거나 비었는지), checks/bundle.json(번들 의존, 변화)
 *   live-check.ts --main  1시간마다: 주 경로 시험. 치지직(소켓 모드 켬) 하나를 보고 판정은 main-path.ts. 보고서 checks/main.json
 *
 * 방송 채팅 수는 화면 줄 수와 페이지 웹소켓 메시지(확장 파서로 읽은 채팅) 중 큰 쪽이다.
 * 채팅이 MIN_HOST_CHATS 미만이거나 페이지를 못 열면 다음 순위 방송으로 다시 본다(STREAM_TRIES곳까지).
 * 끝내 채팅이 없으면 그 경로는 확인 못 함이다(깨짐이 아니다).
 *
 * 확장은 GitHub 릴리스 zip을 버전별로 캐시한다(CACHE_DIR/ext, 최근 KEEP_VERSIONS개). 받기는 다시 시도하고,
 * 릴리스 정보를 끝내 못 받으면 캐시의 가장 높은 버전으로 시험한다.
 * 주 경로 시험은 스토어 버전(info 작업이 모은 값)이 최신 릴리스와 다르면 같은 방송에서 스토어 버전도 시험한다.
 *
 * 필터는 "빈 키워드 포함" 하나만 넣는다. 글자가 있는 채팅은 전부 통과하므로 창의 채팅 수가 곧 수집 수다.
 * 사용자 Chrome, 프로필은 건드리지 않는다. 매번 빈 임시 프로필을 쓴다.
 *
 * 플래그: --seconds=60 (채널마다 지켜보는 시간. --main은 90)
 * 시험용: --ext=<폴더> 릴리스 대신 이 확장, --url=<치지직 방송>[,<다음 방송>...] 인기 목록 대신 이 방송들
 */
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { chromium, type BrowserContext, type Page } from 'playwright';
import type { CheckReport, Finding } from './incidents.ts';
import bundledManifest from '../../src/platform/bundled-selectors.prod.json' with { type: 'json' };
import { hostChats, judgeMain, mergeStoreReport, type ContentSample, type MainRun, type OtaRevs, type PageObservation, type ShadowMismatch } from './main-path.ts';
import { checkDependencies, diffLines, diffSignals, judgeDependencies, extractSignals, isChzzkBundle, type BundleFile, type BundleSignals, type Dependency, type SignalDiff } from './bundle.ts';
import { CACHE_DIR, REPO, UA, attempt, fetchJson, isError, readJson, writeCheck, writeJson } from './state.ts';

// Playwright 오류는 브라우저 실행 로그까지 붙어 길다. 첫 줄만 남긴다
const firstLine = (e: unknown) => String((e as Error)?.message ?? e).split('\n')[0].slice(0, 300);
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MAIN = process.argv.includes('--main');
// 주 경로 시험은 비교 도구 요약(30초마다)을 두 번은 받으려고 더 오래 본다
const SECONDS = Number(process.argv.find((a) => a.startsWith('--seconds='))?.slice(10) ?? (MAIN ? 90 : 60));
/** 시험용: 확장 대신 이 폴더를 올린다 (일부러 고장 낸 빌드로 판정을 확인할 때) */
const EXT_DIR = process.argv.find((a) => a.startsWith('--ext='))?.slice(6);
/** 시험용: 인기 목록 대신 이 치지직 방송들을 본다 (쉼표로 구분, 채팅이 적으면 다음) */
const CHZZK_URL = process.argv.find((a) => a.startsWith('--url='))?.slice(6);
/** 방송 채팅이 이보다 적으면 다음 순위 방송으로 */
const MIN_HOST_CHATS = 10;
const STREAM_TRIES = 3;
const KEEP_VERSIONS = 5;

// 확장의 소켓 파서. ops tsconfig로는 src의 경로 별칭을 따라갈 수 없어 경로를 변수로 두고 불러온다(tsx는 실행한다)
const PARSER = '../../src/platform/chzzk-socket.ts';
const { parseChzzkPacket } = (await import(PARSER)) as { parseChzzkPacket: (packet: unknown) => unknown[] };

export interface LiveRun {
    name: string;
    url?: string;
    /** 방송 쪽 채팅 줄 수 (판정 근거가 있는지) */
    host: number;
    /** 수집 창 요소가 있는지 */
    paneExists?: boolean;
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

interface Release {
    tag_name: string;
    assets: { name: string; browser_download_url: string }[];
}
interface Extension {
    version: string;
    dir: string;
}

const EXT_CACHE = join(CACHE_DIR, 'ext');
const versionDir = (version: string) => join(EXT_CACHE, version);
const isCached = (version: string) => existsSync(join(versionDir(version), 'manifest.json'));
const semver = (v: string) => v.split('.').map(Number);
const newestFirst = (a: string, b: string) => {
    const [x, y] = [semver(a), semver(b)];
    return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
};

/** 캐시에 있는 버전, 높은 순 */
function cachedVersions(): string[] {
    if (!existsSync(EXT_CACHE)) return [];
    return readdirSync(EXT_CACHE).filter((v) => /^\d+\.\d+\.\d+$/.test(v) && isCached(v)).sort(newestFirst);
}

/** 실패하면 기다렸다가 다시. 마지막 실패는 던진다 */
async function retry<T>(fn: () => Promise<T>, waits = [5_000, 20_000]): Promise<T> {
    for (const wait of waits) {
        try {
            return await fn();
        } catch {
            await new Promise((r) => setTimeout(r, wait));
        }
    }
    return fn();
}

/** 릴리스의 chrome zip을 받아 버전 폴더에 푼다. 반쯤 푼 폴더가 남지 않게 임시 폴더에 풀고 이름을 바꾼다 */
async function download(rel: Release): Promise<Extension> {
    const version = rel.tag_name.replace(/^v/, '');
    if (isCached(version)) return { version, dir: versionDir(version) };
    const asset = rel.assets.find((a) => a.name.endsWith('-chrome.zip'));
    if (!asset) throw new Error(`${rel.tag_name}에 chrome zip 없음`);
    const data = await retry(async () => {
        const res = await fetch(asset.browser_download_url);
        if (!res.ok) throw new Error(`zip ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
    });
    const dir = versionDir(version);
    const tmp = `${dir}.tmp`;
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    const zip = join(tmp, 'ext.zip');
    writeFileSync(zip, data);
    // ovm엔 unzip이 없다
    execFileSync('python3', ['-m', 'zipfile', '-e', zip, tmp]);
    rmSync(zip);
    rmSync(dir, { recursive: true, force: true });
    renameSync(tmp, dir);
    for (const old of cachedVersions().slice(KEEP_VERSIONS)) rmSync(versionDir(old), { recursive: true, force: true });
    return { version, dir };
}

async function latestExtension(): Promise<Extension> {
    if (EXT_DIR) return { version: `local ${EXT_DIR}`, dir: EXT_DIR };
    const rel = await attempt(() => retry(() => fetchJson<Release>(`https://api.github.com/repos/${REPO}/releases/latest`)));
    if (!isError(rel)) return download(rel);
    const cached = cachedVersions()[0];
    if (!cached) throw new Error(`릴리스 정보를 못 받음: ${rel.error}`);
    console.error(`[live] 릴리스 정보를 못 받아 캐시의 v${cached}로 시험: ${rel.error}`);
    return { version: cached, dir: versionDir(cached) };
}

/** 이 버전의 릴리스. 캐시에 있으면 받지 않는다 */
async function releaseExtension(version: string): Promise<Extension> {
    if (isCached(version)) return { version, dir: versionDir(version) };
    return download(await retry(() => fetchJson<Release>(`https://api.github.com/repos/${REPO}/releases/tags/v${version}`)));
}

/** info 작업이 모은 Chrome 웹 스토어 버전 */
function storeVersion(): string | undefined {
    const info = readJson<{ stores?: { chrome?: { version?: string | null } } }>('info');
    const v = info?.stores?.chrome?.version ?? undefined;
    return v && /^\d+\.\d+\.\d+$/.test(v) ? v : undefined;
}

/** 1위는 채팅이 너무 빨라 창이 상한에 걸린다. 5위부터 STREAM_TRIES곳 */
const fromFifth = (urls: string[]) => urls.slice(Math.max(0, Math.min(4, urls.length - STREAM_TRIES))).slice(0, STREAM_TRIES);

async function chzzkLives(): Promise<string[]> {
    if (CHZZK_URL) return CHZZK_URL.split(',');
    const lives = await fetchJson<{ content: { data: { channel: { channelId: string } }[] } }>(
        'https://api.chzzk.naver.com/service/v1/lives?size=10&sortType=POPULAR',
    );
    return fromFifth(lives.content.data.map((d) => `https://chzzk.naver.com/live/${d.channel.channelId}`));
}

async function twitchLives(ctx: BrowserContext): Promise<string[]> {
    const page = await ctx.newPage();
    try {
        await page.goto('https://www.twitch.tv/directory/all', { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForSelector('a[data-a-target="preview-card-image-link"]', { timeout: 30_000 });
        const hrefs = await page.$$eval('a[data-a-target="preview-card-image-link"]', (as) => as.map((a) => a.getAttribute('href') ?? ''));
        return fromFifth(hrefs.filter((h) => /^\/[\w]+$/.test(h)).map((h) => `https://www.twitch.tv${h}`));
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
            // 닉네임이 \u0000이 아님: 모든 채팅이 통과한다. 빈 키워드는 글자 없는 채팅(글 없는 후원 등)을 빠뜨린다
            filters: [{ category: 'name', id: `watch-${platform}-1`, type: 'exclude', value: '\u0000' }],
        }));
        await chrome.storage.local.set({ filter, 'tbc-socket-rollout-bucket': socket ? 0 : 99 });
    }, socket);
    await page.close();
}

/** 페이지 하나를 SECONDS 동안 보고 방송 채팅, 소켓, 수집 창을 잰다. 페이지를 못 열면 던진다 */
/** 확장의 비교 도구(socket-shadow.ts)가 콘솔에 남기는 줄. 서식 문자(%c)와 스타일 인자가 같이 온다 */
function readShadowLine(text: string, into: ContentSample): void {
    const m = /(\w+) 불일치 \(type (\d+) (\w+)\) (\S+)\n\s*html:\s+(.*)\n\s*socket:\s+(.*?)(?: color:[^\n]*)?$/s.exec(text);
    if (m) {
        const json = (v: string) => {
            try {
                return JSON.parse(v);
            } catch {
                return v;
            }
        };
        into.mismatches.push({ field: m[1], type: Number(m[2]), status: m[3], id: m[4], html: json(m[5]), socket: json(m[6].trim()) } satisfies ShadowMismatch);
        return;
    }
    const s = /일치 (\d+) \/ 불일치 (\d+) \/ 소켓만 (\d+) \/ html만 (\d+)/.exec(text);
    if (s) into.shadowSummary = { matched: +s[1], mismatched: +s[2], socketOnly: +s[3], htmlOnly: +s[4] };
}

async function observe(ctx: BrowserContext, url: string, platform: 'chzzk' | 'twitch', files?: BundleFile[], compare = false): Promise<PageObservation> {
    const page: Page = await ctx.newPage();
    const pending: Promise<void>[] = [];
    const sockets: PageObservation['sockets'] = [];
    if (files) {
        page.on('response', (res) => {
            if (!isChzzkBundle(res.url())) return;
            pending.push(res.text().then((text) => void files.push({ url: res.url(), text }), () => {}));
        });
    }
    if (platform === 'chzzk') {
        // 탭이 확장(ISOLATED)에 넘기는 window 메시지를 페이지에서 센다 (ws-tap.ts, TBC_SOCKET_CHAT_ACTION)
        await page.addInitScript((compare) => {
            const w = window as unknown as { __tbcWatchTap: number; __tbcWatchChats: unknown[] };
            w.__tbcWatchTap = 0;
            w.__tbcWatchChats = [];
            // 비교 도구는 이 값이 있으면 켜진다 (socket-shadow.ts isSocketShadowEnabled)
            if (compare) {
                try {
                    localStorage.setItem('tbc:socket-shadow', '1');
                } catch {
                    // 저장소를 못 쓰면 비교 없이
                }
            }
            window.addEventListener('message', (e) => {
                if (e.source !== window || e.data?.action !== 'tbc-socket-chat' || e.data?.kind !== 'chats') return;
                const chats = (e.data.chats ?? []) as { id: string; type: number; status: string; nickname: string; anonymous: boolean; message: string; badges: string[] }[];
                w.__tbcWatchTap += chats.length;
                if (compare) for (const c of chats) w.__tbcWatchChats.push({ id: c.id, type: c.type, status: c.status, nickname: c.nickname ?? '', anonymous: !!c.anonymous, message: c.message ?? '', badges: c.badges ?? [] });
            });
        }, compare);
        page.on('websocket', (ws) => {
            const entry = { url: ws.url(), chats: 0 };
            sockets.push(entry);
            ws.on('framereceived', ({ payload }) => {
                if (typeof payload !== 'string') return;
                try {
                    entry.chats += parseChzzkPacket(JSON.parse(payload)).length;
                } catch {
                    // JSON이 아닌 메시지
                }
            });
        });
    }
    const content: ContentSample | undefined = compare ? { chats: [], items: [], mismatches: [] } : undefined;
    if (content) page.on('console', (msg) => {
        const text = msg.text();
        if (text.includes('[TBC shadow]')) readShadowLine(text, content);
    });
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForTimeout(SECONDS * 1000);
        await Promise.all(pending);
        const counts = await page.evaluate(({ platform, container }) => {
            const panes = [...document.querySelectorAll(`#${platform}-container, #tbc-floating-${platform}`)];
            const items = panes.flatMap((p) => [...p.querySelectorAll('[data-tbc-chat-key]')]);
            let containerCount = 0;
            try {
                containerCount = container ? document.querySelectorAll(container).length : 0;
            } catch {
                // 선택자 문법 오류
            }
            const WS = (globalThis as unknown as { WebSocket: Record<symbol, unknown> }).WebSocket;
            return {
                domChats: platform === 'chzzk'
                    ? document.querySelectorAll('aside#aside-chatting [class*="_chatting_message_"]').length
                    : document.querySelectorAll('.chat-line__message').length,
                tapInstalled: WS[Symbol.for('tbc.chzzkSocketTap')] === true,
                tapDelivered: (window as unknown as { __tbcWatchTap?: number }).__tbcWatchTap ?? 0,
                paneExists: panes.length > 0,
                pane: items.length,
                paneWithBadge: items.filter((el) => el.querySelector('img')).length,
                paneWithName: items.filter((el) => (el.textContent ?? '').trim().length > 0).length,
                container: containerCount,
                chats: (window as unknown as { __tbcWatchChats?: unknown[] }).__tbcWatchChats ?? [],
                items: items.map((el) => ({
                    key: el.getAttribute('data-tbc-chat-key') ?? '',
                    text: el.textContent ?? '',
                    // 원본 복제(치지직 마크업)와 직접 그리기(템플릿의 .tbc-chat-badge, src/render/chzzk-templates.ts) 둘 다
                    nameImgs: el.querySelectorAll('[aria-haspopup="true"] img, [class*="_nickname_"] img, img.tbc-chat-badge').length,
                })),
            };
        }, { platform, container: platform === 'chzzk' ? bundledManifest.platforms.chzzk.selectors.chatRoomLive : '' });
        const { chats, items, ...rest } = counts;
        if (content) Object.assign(content, { chats, items });
        return { url, sockets, ...rest, ...(content ? { content } : {}) };
    } finally {
        await page.close();
    }
}

/** 방송을 순서대로 보다가 채팅이 MIN_HOST_CHATS 이상인 첫 결과. 끝내 모자라면 마지막 결과, 모두 못 열면 마지막 오류를 던진다 */
async function observeBusy(ctx: BrowserContext, urls: string[], platform: 'chzzk' | 'twitch', files?: BundleFile[], compare = false): Promise<PageObservation> {
    if (!urls.length) throw new Error('볼 방송이 없음');
    let last: PageObservation | undefined;
    let error: unknown;
    for (const url of urls) {
        // 번들은 마지막으로 본 방송 것만
        files?.splice(0);
        try {
            last = await observe(ctx, url, platform, files, compare);
            if (hostChats(last) >= MIN_HOST_CHATS) return last;
            console.error(`[live] ${url} 방송 채팅 ${hostChats(last)}줄, 다음 방송으로`);
        } catch (e) {
            error = e;
            console.error(`[live] ${url} 못 봄, 다음 방송으로: ${firstLine(e)}`);
        }
    }
    if (last) return last;
    throw error;
}

async function watch(ctx: BrowserContext, name: string, urls: string[], platform: 'chzzk' | 'twitch', files?: BundleFile[]): Promise<LiveRun> {
    const url = urls[0];
    try {
        const o = await observeBusy(ctx, urls, platform, files);
        const host = hostChats(o);
        const verdict = o.pane > 0 ? 'ok' : host > 0 ? 'broken' : 'unknown';
        return { name, url: o.url, host, paneExists: o.paneExists, pane: o.pane, paneWithBadge: o.paneWithBadge, paneWithName: o.paneWithName, verdict };
    } catch (e) {
        return { name, url, host: 0, pane: 0, paneWithBadge: 0, paneWithName: 0, verdict: 'unknown', error: firstLine(e) };
    }
}

/** 확장을 올린 브라우저를 띄워 fn을 돌린다. 매번 빈 임시 프로필 */
async function withExtension<T>(ext: Extension, fn: (ctx: BrowserContext, id: string) => Promise<T>): Promise<T> {
    const profile = mkdtempSync(join(tmpdir(), 'tbc-watch-'));
    let ctx: BrowserContext | undefined;
    try {
        ctx = await chromium.launchPersistentContext(profile, {
            channel: 'chromium',
            headless: true,
            userAgent: UA,
            viewport: { width: 1500, height: 950 },
            args: [`--disable-extensions-except=${ext.dir}`, `--load-extension=${ext.dir}`],
        });
        const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 30_000 }));
        return await fn(ctx, new URL(worker.url()).host);
    } finally {
        await ctx?.close();
        rmSync(profile, { recursive: true, force: true });
    }
}

/** 배지 그림 URL → 묶음 id (data/chzzk-badges.json) */
function badgeGroups(): Map<string, string> {
    const list = JSON.parse(readFileSync(join(REPO_ROOT, 'data/chzzk-badges.json'), 'utf8')) as { groups: { id: string; badges: { imageUrl: string }[] }[] };
    return new Map(list.groups.flatMap((g) => g.badges.map((b) => [b.imageUrl, g.id] as [string, string])));
}

/**
 * 선택자 rev 세 가지. 확장이 받아 적용한 것은 확장 저장소(ota-fetch.ts STORAGE_KEY)에서,
 * 확장에 든 것은 그 릴리스 태그의 파일에서, jsDelivr 것은 사용자와 같은 주소에서 읽는다. 모르면 비워 둔다
 */
async function otaRevs(ctx: BrowserContext, id: string, version: string): Promise<OtaRevs> {
    const page = await ctx.newPage();
    let applied: number | undefined;
    try {
        await page.goto(`chrome-extension://${id}/popup.html`);
        applied = await page.evaluate(async () => {
            const { chrome } = globalThis as unknown as { chrome: { storage: { local: { get(key: string): Promise<Record<string, { rev?: number } | undefined>> } } } };
            return (await chrome.storage.local.get('tbcv2-selectors-manifest'))['tbcv2-selectors-manifest']?.rev;
        });
    } finally {
        await page.close();
    }
    const bundled = await attempt(async () => (JSON.parse(execFileSync('git', ['show', `v${version}:src/platform/bundled-selectors.prod.json`], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as { rev: number }).rev);
    const cdn = await attempt(async () => (await fetchJson<{ rev: number }>(`https://cdn.jsdelivr.net/gh/${REPO}@master/src/platform/bundled-selectors.prod.json`)).rev);
    return { applied, bundled: isError(bundled) ? undefined : bundled, cdn: isError(cdn) ? undefined : cdn };
}

/** 소켓 모드를 켠 치지직 라이브를 이 확장으로 본다 */
async function mainRun(ext: Extension | (() => Promise<Extension>), urls: string[] | (() => Promise<string[]>)): Promise<MainRun> {
    const run: MainRun = { at: Date.now() };
    try {
        const e = typeof ext === 'function' ? await ext() : ext;
        run.version = e.version;
        await withExtension(e, async (ctx, id) => {
            await configure(ctx, id, true);
            Object.assign(run, await observeBusy(ctx, typeof urls === 'function' ? await urls() : urls, 'chzzk', undefined, true));
            // 확장은 뜨자마자 선택자를 받는다. 다 본 뒤에 읽는다
            run.ota = await otaRevs(ctx, id, e.version);
        });
    } catch (e) {
        run.error = firstLine(e);
    }
    return run;
}

/** 비교 재료는 크다. 현황판 상태에는 건수만 남긴다 */
function summarize(run: MainRun) {
    const { content, ...kept } = run;
    return { ...kept, content: content && { chats: content.chats.length, items: content.items.length, mismatches: content.mismatches.length, shadowSummary: content.shadowSummary } };
}

function logLine(run: MainRun, report: CheckReport): string {
    const { content } = run;
    const total = (run.sockets ?? []).map((s) => `${s.url} ${s.chats}`).join(', ');
    const cmp = content ? ` compare=${content.shadowSummary ? `${content.shadowSummary.matched}/${content.shadowSummary.mismatched}/htmlOnly ${content.shadowSummary.htmlOnly}` : 'none'} chats=${content.chats.length} items=${content.items.length}` : '';
    const ota = run.ota ? ` ota=${run.ota.applied ?? '-'}/${run.ota.bundled ?? '-'}/${run.ota.cdn ?? '-'}` : '';
    return `${run.version ?? '-'} ${report.status}${cmp}${ota}${report.note ? ` (${report.note})` : ''} pane=${run.paneExists ? run.pane : 'none'} dom=${run.domChats ?? '-'} tap=${run.tapInstalled ?? '-'}/${run.tapDelivered ?? '-'} sockets=[${total}] ${report.findings.map((f) => f.key).join(', ')}`;
}

/** 주 경로 시험: 최신 릴리스, 스토어 버전이 다르면 같은 방송에서 스토어 버전도 */
async function mainPath(): Promise<void> {
    const groups = badgeGroups();
    const latest = await mainRun(latestExtension, chzzkLives);
    let report = judgeMain(latest, groups);
    const store = EXT_DIR ? undefined : storeVersion();
    let storeRun: MainRun | undefined;
    if (store && store !== latest.version) {
        storeRun = await mainRun(() => releaseExtension(store), latest.url ? [latest.url] : chzzkLives);
        report = mergeStoreReport(report, judgeMain(storeRun, groups), store);
    }
    // 비교 재료는 알림을 조사할 때 보도록 따로 둔다(덮어쓴다)
    if (latest.content) writeJson('main-content', latest.content);
    if (storeRun?.content) writeJson('main-content-store', storeRun.content);
    writeJson('main', { ...summarize(latest), ...(storeRun ? { store: summarize(storeRun) } : {}) });
    writeCheck(report);
    const at = new Date().toISOString();
    console.log(`[main] ${at} ${logLine(latest, judgeMain(latest, groups))}`);
    if (storeRun) console.log(`[main] ${at} 스토어 ${logLine(storeRun, judgeMain(storeRun, groups))}`);
}

async function main(): Promise<void> {
    if (MAIN) return mainPath();
    const result: LiveResult = { at: Date.now(), runs: [] };
    const files: BundleFile[] = [];
    try {
        // 소켓 모드 켬은 1시간마다 도는 주 경로 시험(--main)이 본다
        const ext = await latestExtension();
        result.version = ext.version;
        await withExtension(ext, async (ctx, id) => {
            await configure(ctx, id, false);
            result.runs.push(await watch(ctx, '치지직 (소켓 끔)', await chzzkLives(), 'chzzk', files));
            const twitchUrls = await attempt(() => twitchLives(ctx));
            if (!isError(twitchUrls)) result.runs.push(await watch(ctx, '트위치', twitchUrls, 'twitch'));
            else result.runs.push({ name: '트위치', host: 0, pane: 0, paneWithBadge: 0, paneWithName: 0, verdict: 'unknown', error: `방송 찾기 실패: ${twitchUrls.error}` });
        });
    } catch (e) {
        result.error = firstLine(e);
    }
    writeJson('live', result);
    writeCheck({
        check: 'live',
        at: result.at,
        status: result.error ? 'error' : result.runs.some((r) => r.verdict === 'broken') ? 'issue' : 'ok',
        note: result.error,
        unknownParts: result.runs.filter((r) => r.verdict === 'unknown').map((r) => ({ part: r.name, note: r.error ?? '방송 채팅 없음' })),
        findings: result.runs.filter((r) => r.verdict === 'broken').map((r) => ({
            key: `live:${r.name}:${r.paneExists === false ? 'no-pane' : 'empty-pane'}`,
            part: r.name,
            level: 'broken',
            title: `확장 실제 시험 ${r.name}: ${r.paneExists === false ? '수집 창이 생기지 않음' : '수집 창이 비었음'}`,
            lines: [`방송 채팅 ${r.host}줄, 수집 창 0줄 (v${result.version})`, ...(r.url ? [r.url] : [])],
        })),
    });

    // 확장을 못 띄웠어도 번들 검사는 한다. 확장 없는 브라우저로 페이지만 연다
    if (!files.length) {
        const fallback = await attempt(async () => {
            const browser = await chromium.launch();
            try {
                const ctx = await browser.newContext({ userAgent: UA });
                await watch(ctx, '번들', await chzzkLives(), 'chzzk', files);
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
