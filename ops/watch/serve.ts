/**
 * 현황판을 LAN에 연다. render.ts가 쓴 public/index.html 하나만 내준다.
 * systemd 사용자 서비스(badge-dashboard.service)로 돈다. 포트는 env PORT, 기본 3400.
 */
import { readFileSync } from 'fs';
import { createServer } from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '../public/index.html');
const PORT = Number(process.env.PORT ?? 3400);

createServer((req, res) => {
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
