/**
 * 1분마다: 치지직 첫 페이지 HTML이 불러오는 JS, CSS 파일 목록을 보고 배포를 감지한다.
 *
 * 치지직 HTML은 정적 파일이고 `index-BcgE118t.js`처럼 해시가 붙은 진입 파일을 직접 불러온다.
 * 배포하면 해시가 바뀐다. HTML 하나(몇 KB)만 받으므로 자주 돌려도 부담이 없다.
 *
 * 처음 보는 파일 목록이 나오면
 *  - 보고서(checks/deploy.json)에 참고 사건으로 남긴다. 상황실이 알린다 (어느 파일이 바뀌었는지, vendor만 바뀌었는지 등)
 *  - 바로 canary, socket, live, main 작업을 띄워 영향을 확인한다 (6시간 주기를 기다리지 않는다)
 * 배포 중에는 서버마다 옛 HTML과 새 HTML이 섞여 나올 수 있다. 전에 본 목록으로 돌아가는 건 알리지 않는다.
 *
 * 상태: watch/deploy.json, 보고서: watch/checks/deploy.json (가장 최근 배포 하나)
 * 가져오기에 실패하면 1로 끝난다. 보고서는 쓰지 않고 heartbeat가 멈춤으로 잡는다.
 */
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readJson, writeCheck, writeJson } from './state.ts';

const PAGE = 'https://chzzk.naver.com/';
const RUN_SH = join(dirname(fileURLToPath(import.meta.url)), '../run.sh');
/** 배포를 감지하면 바로 띄울 작업 */
const FOLLOW_UP = ['canary', 'socket', 'live', 'main'];

export interface Deploy {
    at: number;
    lastModified: string | null;
    files: string[];
    /** 해시를 뗀 이름 기준 */
    changed: string[];
    added: string[];
    removed: string[];
}

export interface DeployState {
    checkedAt: number;
    error?: string;
    lastModified: string | null;
    files: string[];
    /** 지금까지 본 파일 목록 (정렬 후 이어 붙인 것). 롤아웃 중 왔다 갔다 하는 걸 거른다 */
    seen: string[];
    history: Deploy[];
}

/** `index-BcgE118t.js` → `index.js`, `vendor--HSbxqQP.js` → `vendor.js` */
export const stem = (file: string) => file.replace(/^(.*)-[A-Za-z0-9_-]{8}\.(js|css)$/, '$1.$2');

export function bundleFiles(html: string): string[] {
    const urls = html.match(/https:\/\/ssl\.pstatic\.net\/static\/nng\/glive\/resource\/[^"'\s>]+\.(?:js|css)/g) ?? [];
    return [...new Set(urls.map((u) => u.split('/').pop()!))].sort();
}

export function compare(prev: string[], cur: string[]): Pick<Deploy, 'changed' | 'added' | 'removed'> {
    const prevBy = new Map(prev.map((f) => [stem(f), f]));
    const curBy = new Map(cur.map((f) => [stem(f), f]));
    const changed = [...curBy].filter(([s, f]) => prevBy.has(s) && prevBy.get(s) !== f).map(([s]) => s);
    const added = [...curBy.keys()].filter((s) => !prevBy.has(s));
    const removed = [...prevBy.keys()].filter((s) => !curBy.has(s));
    return { changed, added, removed };
}

const kst = (s: string | null) => (s ? new Date(s).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) : '-');

function deployLines(d: Deploy): string[] {
    const vendorOnly = d.changed.length > 0 && d.changed.every((s) => /vendor|runtime/.test(s));
    return [
        d.changed.length ? `바뀜: ${d.changed.join(', ')}` : '',
        d.added.length ? `새 파일: ${d.added.join(', ')}` : '',
        d.removed.length ? `빠진 파일: ${d.removed.join(', ')}` : '',
        vendorOnly ? '라이브러리(vendor)만 바뀜, 치지직 자체 코드는 그대로' : '',
        '카나리, 소켓, 확장 시험을 바로 돌린다',
    ].filter(Boolean);
}

function followUp(): void {
    for (const job of FOLLOW_UP) {
        // 이 작업이 끝나도 계속 돌게 떼어 낸다. 겹치면 run.sh의 잠금이 알아서 거른다
        spawn('sh', [RUN_SH, job], { detached: true, stdio: 'ignore' }).unref();
    }
}

async function main(): Promise<void> {
    const prev = readJson<DeployState>('deploy');
    const res = await fetch(PAGE, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' } });
    if (!res.ok) throw new Error(`${PAGE}: ${res.status}`);
    const html = await res.text();
    const files = bundleFiles(html);
    if (files.length === 0) throw new Error('HTML에서 번들 파일을 못 찾음 (페이지 구조가 바뀌었을 수 있음)');
    const lastModified = res.headers.get('last-modified');

    const key = files.join(' ');
    const state: DeployState = {
        checkedAt: Date.now(),
        lastModified,
        files,
        seen: prev?.seen ?? [],
        history: prev?.history ?? [],
    };

    // 처음 돌 때는 기록만 한다
    if (prev && !state.seen.includes(key)) {
        const diff = compare(prev.files, files);
        const deploy: Deploy = { at: Date.now(), lastModified, files, ...diff };
        state.history = [deploy, ...state.history].slice(0, 50);

        followUp();
        console.log(`[deploy] ${new Date().toISOString()} 배포 감지 ${JSON.stringify(diff)}`);
    }
    if (!state.seen.includes(key)) state.seen = [key, ...state.seen].slice(0, 100);
    writeJson('deploy', state);

    const last = state.history[0];
    writeCheck({
        check: 'deploy',
        at: state.checkedAt,
        status: 'ok',
        findings: last ? [{ key: `deploy:${last.at}`, level: 'info', title: `치지직 배포 감지 (HTML 수정 시각 ${kst(last.lastModified)})`, lines: deployLines(last) }] : [],
    });
}

main().catch((err) => {
    console.error(`[deploy] ${new Date().toISOString()}`, err);
    const prev = readJson<DeployState>('deploy');
    if (prev) writeJson('deploy', { ...prev, checkedAt: Date.now(), error: String(err?.message ?? err).slice(0, 300) });
    process.exit(1);
});
