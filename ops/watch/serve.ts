/**
 * 현황판을 LAN에 연다. render.ts가 쓴 public/index.html을 내주고,
 * /contact는 익명 문의(Analytics Engine tbc_contact)를 열 때마다 읽어 거르지 않고 그대로 보여 준다.
 * systemd 사용자 서비스(badge-dashboard.service)로 돈다. 포트는 env PORT, 기본 3400.
 * 코드가 바뀌면 pull 작업이 서비스를 다시 띄운다.
 */
import { readFileSync } from 'fs';
import { createServer } from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { sql } from '../usage-report.ts';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '../public/index.html');
const PORT = Number(process.env.PORT ?? 3400);
// Analytics Engine 보관 기간
const CONTACT_DAYS = 90;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function kst(at: string): string {
    return new Date(`${at.replace(' ', 'T')}Z`).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
}

async function contactPage(): Promise<string> {
    let rows: Awaited<ReturnType<typeof sql>>;
    try {
        rows = await sql(`SELECT timestamp AS at, blob1 AS text, blob2 AS v, blob3 AS b, blob4 AS email FROM tbc_contact
            WHERE timestamp > NOW() - INTERVAL '${CONTACT_DAYS}' DAY ORDER BY at DESC`);
    } catch (e) {
        // 데이터셋은 첫 문의가 들어올 때 생긴다. 그 전엔 열을 못 찾는다며 422
        // (별칭을 붙인 열을 ORDER BY에 원래 이름으로 써도 같은 422가 나서 빈 목록으로 보인다)
        if (!String(e).includes('unable to find type of column')) throw e;
        rows = [];
    }
    const items = rows.map((r) => `<li><div class="meta">${esc(kst(String(r.at)))} ${esc([r.v && `v${r.v}`, r.b, r.email].filter(Boolean).join(' '))}</div><p>${esc(String(r.text))}</p></li>`);
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>익명 문의</title><style>
body{font:15px/1.6 system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;background:#fff;color:#111}
@media(prefers-color-scheme:dark){body{background:#111;color:#eee}li{border-color:#333!important}.meta{color:#999!important}}
ul{list-style:none;padding:0}li{border-top:1px solid #ddd;padding:12px 0}.meta{color:#666;font-size:13px}p{margin:4px 0 0;white-space:pre-wrap;word-break:break-word}
</style></head><body><h1>익명 문의 (최근 ${CONTACT_DAYS}일 ${rows.length}건)</h1><p><a href="/">현황판</a></p><ul>${items.join('')}</ul></body></html>`;
}

createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/contact') {
        try {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(await contactPage());
        } catch (e) {
            res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`문의를 못 읽음: ${e}`);
        }
        return;
    }
    if (req.method !== 'GET' || (req.url !== '/' && !req.url?.startsWith('/?'))) {
        res.writeHead(404).end();
        return;
    }
    try {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }).end(readFileSync(FILE));
    } catch {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('아직 현황판이 없음');
    }
}).listen(PORT, '0.0.0.0', () => console.log(`[serve] :${PORT}`));
