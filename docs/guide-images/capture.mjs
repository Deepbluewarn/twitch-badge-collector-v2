// 사이트 기능 안내(badgecollector.dev/extension/guide/)에 넣는 확장 화면을 찍는다.
// 빌드한 확장(.output/chrome-mv3)에 지어낸 필터, 채널, 보관 채팅을 넣고, 치지직 API와 방송 탭은 지어낸 응답으로 바꿔 끼운다.
// 실행: npm run build 뒤 node docs/guide-images/capture.mjs [출력 폴더]
//   출력 기본값: ../badgecollector-site/public/extension/guide
//   --debug 를 붙이면 자르기 전 전체 화면도 남긴다
//   --live 는 방송 화면 쪽만 찍는다(실제 치지직 방송, 1분 남짓). --url=<방송 주소>로 방송을 고른다
import { chromium } from "../../node_modules/playwright/index.mjs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = resolve(HERE, "../../.output/chrome-mv3");
const args = process.argv.slice(2);
const DEBUG = args.includes("--debug");
const OUT = resolve(args.find(a => !a.startsWith("--")) ?? resolve(HERE, "../../../badgecollector-site/public/extension/guide"));
mkdirSync(OUT, { recursive: true });

// 지어낸 채널, 시청자만 쓴다. 사진은 글자 한 자를 얹은 색 동그라미
const avatar = (ch, bg) => "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${bg}"/><text x="32" y="42" font-size="28" text-anchor="middle" fill="#fff" font-family="sans-serif">${ch}</text></svg>`);
const CHANNELS = [
  { channelId: "aaaa1111", channelName: "노을빛방송", channelImageUrl: avatar("노", "#f59e0b"), verifiedMark: true, verifiedMarkType: "PARTNER" },
  { channelId: "bbbb2222", channelName: "고양이수다", channelImageUrl: avatar("고", "#10b981"), verifiedMark: false },
  { channelId: "cccc3333", channelName: "새벽게임단", channelImageUrl: avatar("새", "#6366f1"), verifiedMark: false },
];
const USERS = [
  { channelId: "u0001", channelName: "단골손님", channelImageUrl: avatar("단", "#ec4899"), verifiedMark: false },
  { channelId: "u0002", channelName: "단골손님2", channelImageUrl: avatar("단", "#0ea5e9"), verifiedMark: false },
  { channelId: "u0003", channelName: "단골집사장", channelImageUrl: avatar("단", "#84cc16"), verifiedMark: false },
];

const G = "https://ssl.pstatic.net/static/nng/glive/";
let n = 0;
const id = () => "g" + n++;
const f = (filters, extra = {}) => ({ filterType: "include", id: id(), filterNote: "", filters, platform: "chzzk", ...extra });
const badge = (img, badgeName) => ({ category: "badge", id: id(), type: "include", value: G + img, badgeName });
const FILTERS = [
  f([badge("icon/streamer.png", "역할: 스트리머")], { markerColor: "#FFC107" }),
  f([badge("icon/manager.png", "역할: 채널 관리자")], { markerColor: "#4ade80", filterChannelId: "aaaa1111", filterChannelName: "노을빛방송", filterChannelImage: CHANNELS[0].channelImageUrl }),
  f([{ category: "name", id: id(), type: "include", value: "단골손님", userId: "u0001", userImage: USERS[0].channelImageUrl }], { markerColor: "#60a5fa", filterNote: "매일 오는 분" }),
  f([{ category: "keyword", id: id(), type: "include", value: "공지" }], { markerColor: "#a78bfa", filterChannelId: "bbbb2222", filterChannelName: "고양이수다", filterChannelImage: CHANNELS[1].channelImageUrl }),
];

// 보관함: 노을빛방송 어제 저녁 방송
const STREAMER = G + "icon/streamer.png", MANAGER = G + "icon/manager.png";
const ARCHIVE_LINES = [
  ["노을빛", [STREAMER], "오늘 방송 여기까지! 다들 고마워요"],
  ["노을빛매니저", [MANAGER], "공지: 다음 방송은 금요일 저녁 8시입니다"],
  ["단골손님", [], "오늘도 재밌었어요 금요일에 봐요"],
  ["노을빛", [STREAMER], "금요일엔 시청자 참여 게임 할게요"],
  ["노을빛매니저", [MANAGER], "참여 신청은 방송 시작 10분 전부터 받습니다"],
  ["노을빛", [STREAMER], "아 그리고 다음 주 화요일은 쉽니다"],
  ["단골손님", [], "푹 쉬세요!"],
  ["노을빛매니저", [MANAGER], "클립 올려 주신 분들 감사합니다"],
];
const MARKER = { 노을빛: "#FFC107", 노을빛매니저: "#4ade80", 단골손님: "#60a5fa" };

async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "tbc-guide-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, viewport: { width: 1040, height: 1000 }, deviceScaleFactor: 2, locale: "ko-KR",
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--lang=ko"],
  });
  // 치지직 방송 탭이 열려 있는 것처럼: 확장 페이지의 tabs.query, tabs.sendMessage를 지어낸 응답으로
  await ctx.addInitScript(({ CHANNELS, USERS }) => {
    if (location.protocol !== "chrome-extension:") return;
    const all = [...CHANNELS, ...USERS];
    chrome.tabs.query = async () => [{ id: 4242, url: "https://chzzk.naver.com/live/aaaa1111", active: true, discarded: false }];
    chrome.tabs.sendMessage = async (_tab, msg) => {
      if (msg?.type === "tbc-chzzk-api") {
        const q = /search\/channels\?keyword=([^&]*)/.exec(msg.path);
        if (q) {
          const k = decodeURIComponent(q[1]);
          return { status: 200, body: { code: 200, content: { data: all.filter(c => c.channelName.includes(k)).map(channel => ({ channel })) } } };
        }
        const c = all.find(c => c.channelId === /channels\/([^/?]+)/.exec(msg.path)?.[1]);
        return c ? { status: 200, body: { code: 200, content: c } } : { status: 404, body: null };
      }
      if (msg?.type === "tbc-channel-info") return { platform: "chzzk", channelId: "aaaa1111", off: false };
      throw new Error("Could not establish connection. Receiving end does not exist.");
    };
  }, { CHANNELS, USERS });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker");
  const host = new URL(sw.url()).host;
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${host}/setting.html`);
  await p.waitForTimeout(800);
  await p.evaluate(async ({ FILTERS, CHANNELS, LINES, MARKER }) => {
    const now = Date.now();
    await chrome.storage.local.set({
      filter: FILTERS,
      chatArchive: { enabled: true, days: 30 },
      archiveChannelNames: Object.fromEntries(CHANNELS.map(c => [c.channelId, { name: c.channelName, image: c.channelImageUrl, at: now }])),
    });
    const db = await new Promise((ok, no) => {
      const r = indexedDB.open("tbc-chat-archive", 1);
      r.onupgradeneeded = () => {
        const chats = r.result.createObjectStore("chats", { keyPath: "id" });
        chats.createIndex("channelTime", ["channel", "time"]);
        chats.createIndex("savedAt", "savedAt");
        r.result.createObjectStore("channels", { keyPath: "channel" });
      };
      r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
    });
    const tx = db.transaction(["chats", "channels"], "readwrite");
    const start = new Date(); start.setDate(start.getDate() - 1); start.setHours(22, 41, 0, 0);
    const put = (cid, lines) => {
      const channel = `chzzk:${cid}:live`;
      lines.forEach(([nickname, badges, text], i) => {
        const time = start.getTime() + i * 47_000;
        tx.objectStore("chats").put({ id: `${channel}|${i}`, channel, time, savedAt: time, nickname, text, badges, kind: "chat", marker: MARKER[nickname] });
      });
      tx.objectStore("channels").put({ channel, platform: "chzzk", channelId: cid, mode: "live", lastAt: start.getTime() + lines.length * 47_000 });
    };
    put("aaaa1111", LINES);
    put("bbbb2222", LINES.slice(0, 3).map(([, b, t]) => ["고양이집사", b, t]));
    put("cccc3333", LINES.slice(0, 5).map(([, b, t]) => ["새벽대장", b, t]));
    await new Promise(ok => { tx.oncomplete = ok; });
  }, { FILTERS, CHANNELS, LINES: ARCHIVE_LINES, MARKER });
  return { ctx, p, host };
}

/** el에서 위로 올라가 너비가 minWidth 넘는 상자를 찾아 그만큼 찍는다 */
async function shot(p, name, locator, { minWidth = 0, pad = 0 } = {}) {
  if (DEBUG) await p.screenshot({ path: join(OUT, `debug-${name}.png`), fullPage: true });
  const r = await locator.evaluate((e, minWidth) => {
    while (e.parentElement && e.getBoundingClientRect().width < minWidth) e = e.parentElement;
    const b = e.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }, minWidth);
  await p.screenshot({ path: join(OUT, `${name}.png`), clip: { x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 } });
  console.log("saved", name);
}

/** from 글자가 든 상자 위쪽부터 to 글자가 든 상자 아래쪽까지. 글자에서 위로 올라가 너비가 minWidth 넘는 상자를 쓴다 */
// padY: 위아래 여백을 따로 줄 때 (바로 위아래에 다른 카드가 붙어 있으면 0)
// card: from이 든 둥근 카드 전체를 찍는다 (to는 무시). 카드 안쪽만 자르면 가장자리에 옆 테두리가 걸린다
async function shotRange(p, name, from, to, { minWidth = 600, toWidth = minWidth, pad = 12, padY = pad, maxHeight = 0, fromBox = false, card = false } = {}) {
  if (DEBUG) await p.screenshot({ path: join(OUT, `debug-${name}.png`), fullPage: true });
  const r = await p.evaluate(({ from, to, minWidth, toWidth, maxHeight, fromBox, card }) => {
    const el = (text, minWidth) => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let t = w.nextNode(); t; t = w.nextNode()) {
        if (t.textContent.trim() !== text) continue;
        let e = t.parentElement;
        if (!e.getClientRects().length) continue;
        while (e.parentElement && e.getBoundingClientRect().width < minWidth) e = e.parentElement;
        return e;
      }
      throw new Error("not found: " + text);
    };
    const box = (text, minWidth) => el(text, minWidth).getBoundingClientRect();
    if (card) {
      let e = el(from, minWidth);
      while (e.parentElement && getComputedStyle(e).borderTopLeftRadius === "0px") e = e.parentElement;
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    const a = box(from, minWidth), b = box(to, toWidth);
    // fromBox: 가로는 from 상자에 맞춘다 (to가 그 안에 뜨는 목록일 때)
    const x = fromBox ? a.x : Math.min(a.x, b.x), right = fromBox ? a.right : Math.max(a.right, b.right);
    const y = Math.min(a.y, b.y);
    let height = Math.max(a.bottom, b.bottom) - y;
    if (maxHeight) height = Math.min(height, maxHeight);
    return { x, y, width: right - x, height };
  }, { from, to, minWidth, toWidth, maxHeight, fromBox, card });
  await p.screenshot({ path: join(OUT, `${name}.png`), clip: { x: r.x - pad, y: r.y - padY, width: r.width + pad * 2, height: r.height + padY * 2 } });
  console.log("saved", name);
}

// 방송 화면 쪽(모아보기, 캡처, 팝오버)은 실제 치지직 방송을 띄워 찍는다. 시청자 닉네임, 채팅, 구독 배지, 후원 순위는
// 찍기 전에 지어낸 것으로 바꾸고, 새로 들어오는 채팅도 바로 바꾼다. 찍은 뒤 사람이 한 번 더 확인할 것.
const FAKE_NAMES = ["달빛산책", "치즈한조각", "오늘도출근", "새벽감성", "고양이집사", "라면두개", "초록사과", "구름위산책", "느긋한하루", "바닷가소년",
  "주말엔게임", "별빛수집가", "파란우산", "따뜻한라떼", "단골손님", "졸린펭귄", "산책하는곰", "노란우비"];
const FAKE_LAUGH = ["ㅋㅋㅋㅋㅋ", "ㅋㅋㅋ 이게 되네", "ㅋㅋㅋㅋㅋㅋㅋㅋ", "아 ㅋㅋ 진짜", "ㅋㅋㅋ 타이밍 봐", "ㅋㅋ 나만 웃겨?", "ㅋㅋㅋㅋ 레전드"];
const FAKE_TEXT = ["안녕하세요", "오늘 방송 재밌네요", "방금 그거 뭐였죠", "와 대박", "화질 좋다", "점심 뭐 드셨어요", "오늘 몇 시까지 해요?", "GG",
  "이거 어떻게 깨요", "다음 판 가자", "목소리 좋다", "와 소름", ...FAKE_LAUGH];

async function anonymize(p) {
  await p.evaluate(({ NAMES, LAUGH, TEXT, BADGE }) => {
    if (window.__anon) return window.__anon();
    const pick = (arr, key) => { let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0; return arr[Math.abs(h) % arr.length]; };
    // 모아보기 목록은 React가 노드를 그대로 두고 글자만 바꾸기도 해서, 표시를 남기지 않고 지어낸 글자가 아니면 늘 다시 쓴다
    const fake = new Set([...NAMES, ...LAUGH, ...TEXT]), names = new Set(NAMES);
    // 치지직 채팅 닉네임, 팝오버 막대, 확장이 직접 그린 줄(새로고침 전에 모인 채팅)의 닉네임
    const NICKS = '[class*="_nickname_"] [class*="_text_"], .tbcv2-float-nick, .tbc-chat-nick';
    const fix = () => {
      for (const el of document.querySelectorAll(NICKS)) {
        if (!names.has(el.textContent)) el.textContent = pick(NAMES, el.textContent);
      }
      // 채팅 한 줄 안의 다른 글자(본문, 후원 문구)는 전부. 한 줄 = 닉네임 하나만 든 가장 큰 상자 (모아보기는 data-tbc-chat-key)
      const NICK = '[class*="_nickname_"] [class*="_text_"]';
      const items = new Set(document.querySelectorAll("[data-tbc-chat-key]"));
      for (const nick of document.querySelectorAll(NICK)) {
        if (nick.closest("[data-tbc-chat-key], .tbcv2-float")) continue;
        let row = nick;
        while (row.parentElement && row.parentElement.tagName !== "ASIDE" && row.parentElement.querySelectorAll(NICK).length === 1) row = row.parentElement;
        items.add(row);
      }
      const keep = /^[\d,.:\s]*$/;
      for (const item of items) {
        // 채널 이모티콘도 그 채널 그림이라 글자로 (한 줄에 하나만 남기고 지운다)
        // 치지직 공통 그림(ssl.pstatic.net/static: 치즈, 기본 이모티콘)과 배지는 그대로
        const emotes = [...item.querySelectorAll("img")].filter(img => !img.closest('[class*="_nickname_"], [class*="_icon_"]') && img.src.includes("nng-phinf") && !img.src.includes("/badge/"));
        emotes.forEach((img, i) => i === 0 ? img.replaceWith(document.createTextNode(pick(LAUGH, img.src))) : img.remove());
        const w = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
        for (let t = w.nextNode(); t; t = w.nextNode()) {
          const v = t.textContent.trim();
          if (!v || keep.test(v) || fake.has(v)) continue;
          if (t.parentElement.closest('[class*="_nickname_"], .tbc-chat-nick, .tbcv2-chat-time, button:not([class*="_nickname_"])')) continue;
          t.textContent = pick(v.includes("ㅋ") ? LAUGH : TEXT, v);
        }
      }
      for (const nick of document.querySelectorAll(".tbcv2-float-nick")) {
        const t = nick.nextSibling;
        if (t?.nodeType === 3 && !fake.has(t.textContent)) t.textContent = pick(t.textContent.includes("ㅋ") ? LAUGH : TEXT, t.textContent);
      }
      for (const el of document.querySelectorAll(NICKS)) {
        if (!names.has(el.textContent)) el.textContent = pick(NAMES, el.textContent);
      }
      // 채널마다 그린 구독 배지는 일반 배지로
      for (const img of document.querySelectorAll('img[src*="/subscription/"]')) if (img.src !== BADGE) img.src = BADGE;
    };
    const hide = () => {
      // 후원 순위(시청자 닉네임), 입력창 안내. 채팅창 위 순위 띠는 이름표 없이 메달만 있어서 class로
      for (const el of document.querySelectorAll('aside [class*="ranking" i]')) if (!el.closest('[class*="ranking" i] [class*="ranking" i]')) el.style.display = "none";
      for (const el of document.querySelectorAll("aside *")) {
        if (el.childElementCount === 0 && /파워 랭킹|후원 랭킹/.test(el.textContent)) {
          let box = el; while (box.parentElement && box.parentElement.tagName !== "ASIDE" && box.parentElement.childElementCount < 3) box = box.parentElement;
          box.style.display = "none";
        }
      }
    };
    const all = () => { fix(); hide(); };
    new MutationObserver(all).observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(all, 50);
    window.__anon = all;
    all();
  }, { NAMES: FAKE_NAMES, LAUGH: FAKE_LAUGH, TEXT: FAKE_TEXT, BADGE: G + "badge/cheatkey_12m.png" });
}

async function live() {
  const { ctx, p } = await launch();
  try {
    // 모아보기가 잘 차도록 ㅋ 키워드 필터를 더하고, 수집 표시 색을 보이게
    await p.evaluate(async () => {
      const { filter } = await chrome.storage.local.get("filter");
      filter.push({ filterType: "include", id: "kk", filterNote: "", platform: "chzzk", markerColor: "#60a5fa", filters: [{ category: "keyword", id: "kk1", type: "include", value: "ㅋ" }] });
      await chrome.storage.local.set({ filter });
    });
    const lives = await (await fetch("https://api.chzzk.naver.com/service/v1/lives?size=10&sortType=POPULAR", { headers: { "User-Agent": "Mozilla/5.0" } })).json();
    const url = args.find(a => a.startsWith("--url="))?.slice(6) ?? `https://chzzk.naver.com/live/${lives.content.data[3].channel.channelId}`;
    console.log("방송", url);
    const tab = await ctx.newPage();
    await tab.setViewportSize({ width: 1280, height: 1000 });
    await tab.goto(url);
    await anonymize(tab);
    await tab.waitForTimeout(90000);
    if (DEBUG) writeFileSync(join(OUT, "debug-rows.html"), await tab.evaluate(() =>
      [...document.querySelectorAll("#chzzk-container [data-tbc-chat-key]")].slice(-12).map(e => e.outerHTML).join("\n\n")));
    const chatBox = () => tab.evaluate(() => {
      const a = document.querySelector("#chzzk-container, #tbc-floating-chzzk").closest("aside"); const r = a.getBoundingClientRect();
      const input = [...a.querySelectorAll("textarea, [contenteditable], [class*='input']")].map(e => e.getBoundingClientRect().top).filter(t => t > 300)[0] ?? r.bottom;
      return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, input - r.y - 8) };
    });
    // 7. 캡처: 팝업의 "채팅 캡쳐 시작"과 같은 메시지를 보내고 채팅 세 줄을 고른다
    const sw = ctx.serviceWorkers()[0];
    await sw.evaluate(async () => {
      const [t] = await chrome.tabs.query({ url: "*://chzzk.naver.com/*" });
      await chrome.tabs.sendMessage(t.id, { type: "tbc-start-capture" });
    });
    await tab.waitForTimeout(800);
    // 목록 창 안에 통째로 보이는 줄 가운데 아래쪽 세 줄(사이 하나 건너)을 고른다.
    // 맨 아래 줄은 피한다: 새 채팅이 들어오면 위로 밀려 올라가므로 아래쪽이어야 찍을 때까지 창 안에 남는다
    await tab.evaluate(() => {
      const rows = [...document.querySelectorAll("#chzzk-container [data-tbc-chat-key]")];
      let box = rows[0]?.parentElement;
      while (box && box.scrollHeight <= box.clientHeight) box = box.parentElement;
      const c = box.getBoundingClientRect();
      const visible = rows.filter(e => {
        const r = e.getBoundingClientRect();
        return r.height > 0 && r.top >= c.top && r.bottom <= c.bottom;
      });
      const n = visible.length;
      for (const i of [n - 5, n - 4, n - 2]) visible[i]?.click();
    });
    // 붐비는 방송이면 고른 줄이 금방 위로 밀려 올라가 바로 찍는다
    await tab.waitForTimeout(100);
    await anonymize(tab);
    await tab.screenshot({ path: join(OUT, "capture.png"), clip: await chatBox() });
    console.log("saved capture");
    if (DEBUG) await tab.screenshot({ path: join(OUT, "debug-capture.png") });
    // 8. 팝오버
    await tab.keyboard.press("Escape");
    await p.evaluate(() => chrome.storage.local.set({ displayMode: "floating" }));
    await tab.reload();
    await anonymize(tab);
    await tab.waitForTimeout(30000);
    // 닫혀 있는 평소 모습 (채팅창은 그대로, 위에 막대 한 줄)
    await tab.screenshot({ path: join(OUT, "popover-closed.png"), clip: await chatBox() });
    console.log("saved popover-closed");
    await tab.locator("#tbc-floating-chzzk").click({ position: { x: 40, y: 10 } });
    await tab.waitForTimeout(1000);
    await anonymize(tab);
    await tab.screenshot({ path: join(OUT, "popover.png"), clip: await chatBox() });
    console.log("saved popover");
  } finally {
    await ctx.close();
  }
}

if (args.includes("--live")) { await live(); process.exit(0); }

const { ctx, p, host } = await launch();
const page = path => p.goto(`chrome-extension://${host}/setting.html?initialPath=${path}`).then(() => p.waitForTimeout(1500));
try {
  // 1. 보관함
  await page("archive");
  await p.getByText("채팅 8개").click();
  await p.waitForTimeout(1200);
  await shotRange(p, "archive", "채팅 8개", "오늘 방송 여기까지! 다들 고마워요", { pad: 16 });
  // 2. 채널 지정: 필터 목록 (좁으면 칩 이름이 잘려 넓게)
  await p.setViewportSize({ width: 1280, height: 1000 });
  await page("filter");
  await shotRange(p, "channel", "모든 필터", null, { minWidth: 800, card: true, pad: 16, padY: 3 });
  // 3. 사람으로 고르기: 새 필터 추가에서 닉네임 검색
  await p.setViewportSize({ width: 1040, height: 1000 });
  await page("filter");
  await p.getByRole("button", { name: "새 필터 추가" }).click();
  await p.waitForTimeout(800);
  await p.getByText("내용", { exact: true }).locator("xpath=following::input[1]").click();
  await p.keyboard.type("단골");
  await p.waitForTimeout(1200);
  await shotRange(p, "person", "카테고리", null, { minWidth: 400, card: true, pad: 16 });
  // 4. 채팅 모양: 템플릿을 켜고 모양 코드로 예시 셋. 메시지 강조, 닉네임 강조(같은 배경과 테두리를 본문과 닉네임에), 닉네임은 파란 상자, 본문은 빨간 상자
  await page("template");
  await p.getByRole("switch").first().click();
  await p.waitForTimeout(1200);
  for (const [name, code] of [["look-text", "TBC2:RAgoAxf5nFHJMATv-A"], ["look-nick", "TBC2:RBAoAxf5nFHJMATv-A"], ["look-color", "TBC2:RBAoAxf5nFHJMATv-gv-WlpnFHJN_pqaA"]]) {
    await p.getByRole("button", { name: "모양 코드 적용" }).click();
    await p.getByRole("textbox", { name: "모양 코드 적용" }).fill(code);
    await p.getByRole("button", { name: "적용", exact: true }).click();
    await p.mouse.move(0, 0); // 미리보기에 마우스가 올라가 있으면 그 부분에 점선 테두리가 생긴다
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => {
      const find = text => {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let t = w.nextNode(); t; t = w.nextNode()) if (t.textContent.trim() === text && t.parentElement.getClientRects().length) return t.parentElement;
      };
      // 미리보기의 어두운 채팅 창
      let e = find("다들 와줘서 고마워요");
      while (e.parentElement && (getComputedStyle(e).backgroundColor === "rgba(0, 0, 0, 0)" || e.getBoundingClientRect().width < 250)) e = e.parentElement;
      const box = e.getBoundingClientRect(), last = find("공지 확인해주세요").getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: last.bottom - box.y + 6 };
    });
    await p.screenshot({ path: join(OUT, `${name}.png`), clip: r });
    console.log("saved", name);
  }
  // 5. 제외와 꺼짐, 필터 시험, 내보내기: 제외, 꺼짐 필터를 더한 목록
  await p.setViewportSize({ width: 1280, height: 1000 });
  await p.evaluate(async F => { await chrome.storage.local.set({ filter: F }); }, [
    FILTERS[0], FILTERS[2],
    f([{ category: "name", id: id(), type: "include", value: "도배봇" }], { filterType: "exclude" }),
    f([badge("image/icon_partner_mark.png", "역할: 파트너 마크")], { filterType: "sleep" }),
  ]);
  await page("filter");
  await p.mouse.move(0, 0);
  await shotRange(p, "exclude", "필터 4개", null, { minWidth: 800, card: true, pad: 16, padY: 3 });
  await shotRange(p, "export", "필터 목록", "새 필터 추가", { minWidth: 800, pad: 16, padY: 0 });
  await p.getByRole("button", { name: "필터 시험" }).click();
  await p.waitForTimeout(600);
  await p.getByPlaceholder("닉네임").first().fill("도배봇");
  await p.getByPlaceholder("채팅").first().fill("구독하고 가세요");
  await p.waitForTimeout(800);
  await shot(p, "test", p.locator('section[aria-label="필터 시험"]'), { pad: 0 });
  // 6. 팝업: 이 채널에서 사용, 채팅 캡쳐 시작
  await p.setViewportSize({ width: 320, height: 600 });
  await p.goto(`chrome-extension://${host}/popup.html`);
  await p.waitForTimeout(1500);
  await p.addStyleTag({ content: "body { padding-top: 12px }" }); // 맨 위 카드가 창 끝에 붙어 있다
  await shotRange(p, "popup", "노을빛방송", "채팅창 비율 초기화", { minWidth: 260, pad: 12 });
} catch (e) {
  await p.screenshot({ path: join(OUT, "debug-fail.png"), fullPage: true });
  throw e;
} finally {
  await ctx.close();
}
