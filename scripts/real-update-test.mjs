#!/usr/bin/env node
/**
 * 실제 Chrome 업데이터로 확장 업데이트를 시험한다 — 배포 전에 돌린다(CLAUDE.md "릴리스 전 실제 업데이트 시험").
 *
 * CDP `Extensions.loadUnpacked`로 다시 불러오는 시험은 옛 버전이 내려가고 새 버전이 뜨는 빈틈이 아주 짧아,
 * 그 빈틈에서 터지는 문제가 안 보인다(v2.24.0: 빈틈에 채팅이 들어오면 모아보기 창이 통째로 비었다).
 * 여기서는 스토어와 같은 경로를 탄다: 서명한 패키지(CRX)를 설치하고, 업데이트 서버가 새 버전을 내주면
 * Chrome 업데이터가 받아서 갈아 끼운다. 스토어 대신 로컬 서버를 쓸 뿐이다.
 *
 *   node scripts/real-update-test.mjs <옛 버전 zip|폴더> <새 버전 폴더> [옵션]
 *     --socket on|off   치지직 소켓 모드(설치별 숫자를 고정). 기본 off. 둘 다 시험할 것
 *     --filter ㅋ       재현용 키워드 필터(치지직). 기본 ㅋ, 빈 값이면 넣지 않음
 *     --url <주소>      처음 열 방송. 기본은 지금 시청자가 많은 치지직 라이브 30위쯤
 *
 *   예) npm run zip 이전 버전 zip → node scripts/real-update-test.mjs .output/...-2.24.0-chrome.zip .output/chrome-mv3
 *
 * 띄운 뒤:
 *   http://localhost:8765/update   업데이트 서버를 새 버전으로 바꾸고 Chrome 업데이터를 바로 돌린다
 *   http://localhost:8765/gap      확장을 껐다 7초 뒤 켠다 — 빈틈을 길게 만들어 그동안 창이 버티는지 본다
 *   http://localhost:8765/state    탭 상태(모아보기 채팅 수, 숨긴 옛 창, 안내 띠)
 * 시험 브라우저 주소창에 쳐도 되고 curl로 불러도 된다. Ctrl+C로 끝낸다.
 *
 * 쓰는 것: Playwright의 Chromium(설치돼 있어야 함), 사용자의 Chrome·프로필은 건드리지 않는다.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] ?? '' : def; };
const [oldArg, newArg] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!oldArg || !newArg) {
    console.error('usage: node scripts/real-update-test.mjs <옛 버전 zip|폴더> <새 버전 폴더> [--socket on|off] [--filter ㅋ] [--url 주소]');
    process.exit(2);
}
const SOCKET = opt('socket', 'off') === 'on';
const FILTER = opt('filter', 'ㅋ');
const PORT = 8765, CDP_PORT = 9334;
const UPDATE_URL = `http://localhost:${PORT}/update.xml`;
const CHROME = chromium.executablePath();
if (!existsSync(CHROME)) { console.error(`Chromium 없음: ${CHROME} — npx playwright install chromium`); process.exit(1); }

const dir = mkdtempSync(join(tmpdir(), 'tbc-real-update-'));
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

// 서명 키 — 같은 키로 서명해야 두 패키지가 같은 확장(ID)으로 인식된다.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const keyPath = join(dir, 'key.pem');
writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
const ID = [...createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 32)]
    .map(c => String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 16))).join('');

function prepare(src, name, version) {
    const out = join(dir, name);
    mkdirSync(out);
    if (src.endsWith('.zip')) execFileSync('unzip', ['-q', resolve(src), '-d', out]);
    else cpSync(resolve(src), out, { recursive: true });
    const m = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
    m.update_url = UPDATE_URL;
    if (version) m.version = version;
    writeFileSync(join(out, 'manifest.json'), JSON.stringify(m));
    execFileSync(CHROME, ['--headless=new', `--pack-extension=${out}`, `--pack-extension-key=${keyPath}`, '--no-message-box'], { stdio: 'ignore' });
    return { crx: `${out}.crx`, version: m.version };
}
const older = prepare(oldArg, 'old');
// 새 빌드는 버전이 1.2.3 같은 개발값일 수 있다 — 옛 버전보다 커야 업데이트로 받는다.
const bump = v => v.split('.').map(Number).map((n, i, a) => (i === a.length - 1 ? n + 1 : n)).join('.');
const newerRaw = JSON.parse(readFileSync(join(resolve(newArg), 'manifest.json'), 'utf8')).version;
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 4; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0); return 0; };
const newer = prepare(newArg, 'new', cmp(newerRaw, older.version) > 0 ? newerRaw : bump(older.version));
log(`확장 ID ${ID}: ${older.version} → ${newer.version}`);

let serving = older;
const updateXml = () => `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${ID}'><updatecheck codebase='http://localhost:${PORT}/${serving === older ? 'old' : 'new'}.crx' version='${serving.version}' /></app>
</gupdate>`;

// 외부 설치: 사용자 데이터 폴더의 External Extensions에 CRX를 적어 두면 Chrome이 시작하며 설치한다.
const profile = join(dir, 'profile');
mkdirSync(join(profile, 'External Extensions'), { recursive: true });
writeFileSync(join(profile, 'External Extensions', `${ID}.json`), JSON.stringify({ external_crx: older.crx, external_version: older.version }));

let browser, ctx;
const extPage = async () => ctx.pages().find(p => p.url().startsWith('chrome://extensions')) ?? (async () => {
    const p = await ctx.newPage(); await p.goto('chrome://extensions'); return p;
})();
const tabs = () => ctx.pages().filter(p => /chzzk\.naver\.com|twitch\.tv/.test(p.url()));

async function state() {
    const out = [];
    for (const p of tabs()) {
        const type = p.url().includes('chzzk') ? 'chzzk' : 'twitch';
        out.push({ url: p.url(), ...await p.evaluate(t => ({
            pane: document.querySelectorAll(`#${t}-container [data-tbc-chat-key], #tbc-floating-${t} [data-tbc-chat-key]`).length,
            stale: document.querySelectorAll('[id$="-stale"]').length,
            notice: !!document.getElementById('tbcv2-updated-notice'),
            pageAgeSec: Math.round(performance.now() / 1000),
        }), type).catch(e => ({ error: e.message })) });
    }
    return { version: await (await extPage()).evaluate(id => chrome.management.get(id).then(e => e.version), ID), tabs: out };
}

/** 탭마다 0.2초 간격으로 모아보기 채팅 수를 기록하고, ms 뒤에 바뀐 지점만 돌려준다. */
async function record(ms, action) {
    for (const p of tabs()) await p.evaluate(() => {
        const t0 = performance.now(); window.__tbcRec = [];
        clearInterval(window.__tbcRecTimer);
        window.__tbcRecTimer = setInterval(() => {
            const pane = document.querySelector('[id="chzzk-container"], [id="twitch-container"], [id^="tbc-floating-"]:not([id$="-stale"])');
            window.__tbcRec.push([Math.round(performance.now() - t0), pane ? pane.querySelectorAll('[data-tbc-chat-key]').length : -1,
                !!document.getElementById('tbcv2-updated-notice')]);
        }, 200);
    }).catch(() => {});
    await action();
    await new Promise(r => setTimeout(r, ms));
    const result = [];
    for (const p of tabs()) {
        const rec = await p.evaluate(() => { clearInterval(window.__tbcRecTimer); return window.__tbcRec; }).catch(() => []);
        let last = '';
        result.push({ url: p.url(), changes: rec.filter(([, n, notice]) => { const k = `${n}/${notice}`; const c = k !== last; last = k; return c; })
            .map(([t, n, notice]) => `${t}ms 모아보기 ${n === -1 ? '창 없음' : n}${notice ? ' 안내 띠' : ''}`) });
    }
    return result;
}

createServer(async (req, res) => {
    const send = (code, body, type = 'application/json; charset=utf-8') => { res.writeHead(code, { 'Content-Type': type }); res.end(body); };
    try {
        const path = req.url.split('?')[0];
        if (path === '/update.xml') return send(200, updateXml(), 'application/xml');
        if (path === '/old.crx' || path === '/new.crx') return send(200, readFileSync(path === '/old.crx' ? older.crx : newer.crx), 'application/x-chrome-extension');
        if (path === '/update') {
            serving = newer;
            log(`업데이트: 서버가 ${newer.version}을 내준다. Chrome 업데이터 실행`);
            const r = await record(12000, async () => { await (await extPage()).evaluate(() => new Promise(ok => chrome.developerPrivate.autoUpdate(ok))); });
            return send(200, JSON.stringify({ ...(await state()), record: r }, null, 2));
        }
        if (path === '/gap') {
            log('빈틈 시험: 확장을 끄고 7초 뒤 켠다');
            const ext = await extPage();
            const r = await record(7000, () => ext.evaluate(id => chrome.management.setEnabled(id, false), ID));
            await ext.evaluate(id => chrome.management.setEnabled(id, true), ID);
            return send(200, JSON.stringify({ record: r, note: '다시 켜도 열린 탭엔 새 코드가 안 들어간다 — 새로고침하고 다음 시험' }, null, 2));
        }
        if (path === '/state') return send(200, JSON.stringify(await state(), null, 2));
        send(404, 'not found');
    } catch (e) { send(500, String(e?.stack ?? e)); }
}).listen(PORT, '127.0.0.1');

const proc = spawn(CHROME, [`--user-data-dir=${profile}`, `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=1500,950', 'chrome://extensions'], { stdio: 'ignore' });
process.on('SIGINT', () => { proc.kill(); process.exit(0); });
for (let i = 0; i < 50 && !browser; i++) {
    await new Promise(r => setTimeout(r, 300));
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`).catch(() => undefined);
}
ctx = browser.contexts()[0];

// 설치 확인 후 시험 조건 설정(소켓 모드 고정, 재현용 필터). 확장 페이지에서 storage를 직접 쓴다.
for (let i = 0; i < 30; i++) {
    const v = await (await extPage()).evaluate(id => chrome.management.get(id).then(e => e.version).catch(() => null), ID);
    if (v) break;
    await new Promise(r => setTimeout(r, 500));
}
const setup = await ctx.newPage();
await setup.goto(`chrome-extension://${ID}/popup.html`);
await setup.evaluate(async ({ socket, filter }) => {
    const set = { 'tbc-socket-rollout-bucket': socket ? 0 : 99 };
    if (filter) {
        const { filter: list = [] } = await chrome.storage.local.get('filter');
        if (!list.some(f => f.id === 'real-update-test')) list.push({ filterType: 'include', id: 'real-update-test', filterNote: '실제 업데이트 시험', platform: 'chzzk',
            filters: [{ category: 'keyword', id: 'real-update-test-1', type: 'include', value: filter }] });
        set.filter = list;
    }
    await chrome.storage.local.set(set);
}, { socket: SOCKET, filter: FILTER });
await setup.close();

let url = opt('url', '');
if (!url) {
    const lives = await (await fetch('https://api.chzzk.naver.com/service/v1/lives?size=30&sortType=POPULAR', { headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
    const list = lives.content.data;
    url = `https://chzzk.naver.com/live/${list[list.length - 1].channel.channelId}`;
}
await (await ctx.newPage()).goto(url);
log(`준비 끝: ${older.version} 설치, 소켓 모드 ${SOCKET ? '켬' : '끔'}, ${url}`);
log(`채팅이 쌓이면 http://localhost:${PORT}/update (실제 업데이트) 또는 /gap (빈틈 시험), 상태는 /state`);
