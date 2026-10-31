// compose.html의 .frame[data-out]을 각각 PNG로 찍는다. 결과: out/ko/*.png, out/en/*.png
// 실행: node docs/store-images/render.mjs (필터 목록 화면이 바뀌었으면 capture.mjs 먼저)
import { chromium } from "../../node_modules/playwright/index.mjs";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
await page.goto("file://" + join(HERE, "compose.html"));
await page.evaluate(() => document.fonts.ready);
await page.waitForLoadState("networkidle");
for (const frame of await page.locator(".frame[data-out]").all()) {
  const out = join(HERE, "out", await frame.getAttribute("data-out"));
  mkdirSync(dirname(out), { recursive: true });
  await frame.screenshot({ path: out });
  console.log(out);
}
await browser.close();
