// 빌드한 확장(.output/chrome-mv3)에 예시 필터를 넣고 필터 목록 카드를 찍는다.
// 한국어는 치지직 필터, 영어는 트위치 필터. 결과: shots/filters-ko.png, shots/filters-en.png
// 실행: npm run build 뒤 node docs/store-images/capture.mjs
import { chromium } from "../../node_modules/playwright/index.mjs";
import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = resolve(HERE, "../../.output/chrome-mv3");
const SHOTS = join(HERE, "shots");
mkdirSync(SHOTS, { recursive: true });

let n = 0;
const id = () => "demo" + n++;
const f = (platform, filterType, filters, extra = {}) => ({ filterType, id: id(), filterNote: "", filters, platform, ...extra });
const kw = v => ({ category: "keyword", id: id(), type: "include", value: v });
const name = v => ({ category: "name", id: id(), type: "include", value: v });

// 지어낸 채널, 닉네임만 쓴다
const G = "https://ssl.pstatic.net/static/nng/glive/";
const cz = (img, badgeName) => ({ category: "badge", id: id(), type: "include", value: G + img, badgeName });
const KO = [
  f("chzzk", "include", [cz("icon/streamer.png", "역할: 스트리머")], { markerColor: "#FFC107" }),
  f("chzzk", "include", [cz("icon/manager.png", "역할: 채널 관리자")], { markerColor: "#4ade80" }),
  f("chzzk", "include", [cz("badge/cheatkey_12m.png", "구독: 치트키 보유자 12개월"), kw("질문")], { markerColor: "#f472b6", filterChannelId: "demo-ch", filterChannelName: "노을빛방송" }),
  f("chzzk", "include", [name("단골손님")], { markerColor: "#60a5fa", filterNote: "매일 오는 분" }),
  f("chzzk", "include", [kw("공지")], { markerColor: "#a78bfa" }),
  f("chzzk", "include", [cz("icon/gold.png", "후원: 영광의 1등")], { markerColor: "#fb923c" }),
  f("chzzk", "exclude", [name("도배봇")]),
  f("chzzk", "sleep", [cz("image/icon_partner_mark.png", "역할: 파트너 마크")]),
];
// 트위치 전역 배지 (src/defaultFilters.ts와 같은 값)
const tw = (value, badgeName, badgeSetId) => ({ category: "badge", id: id(), type: "include", value, badgeName, badgeSetId });
const BROADCASTER = ["5527c58c-fb7d-422d-b71b-f309dcb85cc1", "Broadcaster", "broadcaster/1"];
const MODERATOR = ["3267646d-33f0-4b17-b3df-f923a41db1d0", "Moderator", "moderator/1"];
const VIP = ["b817aba4-fad8-49e2-b88a-7cc744dfa6ec", "VIP", "vip/1"];
const VERIFIED = ["d12a2e27-16f6-41d0-ab77-b780518f00a3", "Verified", "partner/1"];
const EN = [
  f("twitch", "include", [tw(...BROADCASTER)], { markerColor: "#FFC107" }),
  f("twitch", "include", [tw(...MODERATOR)], { markerColor: "#4ade80" }),
  f("twitch", "include", [tw(...VIP), kw("!song")], { markerColor: "#f472b6", filterChannelId: "sunsetstream", filterChannelName: "sunsetstream" }),
  f("twitch", "include", [name("regular_viewer")], { markerColor: "#60a5fa", filterNote: "here every day" }),
  f("twitch", "include", [kw("giveaway")], { markerColor: "#a78bfa" }),
  f("twitch", "exclude", [name("nightbot")]),
  f("twitch", "sleep", [tw(...VERIFIED)]),
];

async function capture(lang, filters, platformLabel, firstChip, out) {
  const profile = mkdtempSync(join(tmpdir(), "tbc-store-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2,
    locale: lang === "ko" ? "ko-KR" : "en-US",
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--lang=${lang === "ko" ? "ko" : "en-US"}`],
  });
  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent("serviceworker");
    const p = await ctx.newPage();
    await p.goto(`chrome-extension://${new URL(sw.url()).host}/setting.html`);
    await p.waitForTimeout(1000);
    await p.evaluate(async F => { await chrome.storage.local.set({ filter: F }); }, filters);
    await p.reload();
    await p.waitForTimeout(1200);
    // 치지직은 기본 선택. 이름이 옆 메뉴에도 있어 누르지 않는다
    if (platformLabel) await p.getByText(platformLabel, { exact: true }).first().click();
    await p.waitForTimeout(1500);
    // 첫 필터 칩에서 위로 올라가 목록 카드 전체를 잡는다
    const clip = await p.getByText(firstChip, { exact: true }).first().evaluate(e => {
      while (e && !(e.getBoundingClientRect().width > 900)) e = e.parentElement;
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    await p.screenshot({ path: join(SHOTS, out), clip });
  } finally {
    await ctx.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

await capture("ko", KO, null, "역할: 스트리머", "filters-ko.png");
await capture("en", EN, "Twitch", "Broadcaster", "filters-en.png");
