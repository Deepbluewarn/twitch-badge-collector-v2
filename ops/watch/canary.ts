/**
 * 리포의 카나리 스크립트(scripts/canary)를 ovm에서 돌리고 결과를 현황판 상태로 남긴다.
 *
 *   npx tsx ops/watch/canary.ts selector   선택자 카나리 (Playwright로 라이브 채널 방문)
 *   npx tsx ops/watch/canary.ts socket     소켓 카나리 (채팅 소켓에 2분 붙어 패킷 형태 확인)
 *
 * 알림
 *  - 선택자: 스크립트가 스냅샷과 달라진 점을 직접 Discord로 알린다. 여기서는 깨진 채로 6시간이 지나면 다시 알리고,
 *    회복하면 알린다. (rev 13 사고: 알림 한 번이 묻혀 18시간 동안 아무도 못 봤다)
 *  - 소켓: 매시간 돌아서 스크립트 알림을 그대로 쓰면 같은 경고가 매번 온다. 스크립트 알림은 끄고,
 *    처음 보는 문제일 때, 깨진 채로 6시간이 지났을 때, 회복했을 때만 여기서 알린다.
 *    드문 메시지(상점 구매, 파티 등 템플릿이 없는 것)가 처음 잡히면 상태와 따로 알린다. 모양은 $CANARY_STATE_DIR/socket-rare.json.
 *
 * 카나리가 문제를 찾아도 이 스크립트는 0으로 끝난다(결과는 상태에 남긴다). 스크립트를 못 돌렸을 때만 1.
 *
 * 상태: watch/canary-selector.json, watch/canary-socket.json
 * 스크립트가 쓰는 스냅샷과 알림 파일: $CANARY_STATE_DIR (run.sh가 ~/.local/state/badge-collector/canary로 정한다)
 */
import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { sendDiscord } from '../common.ts';
import { readJson, writeJson } from './state.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = process.env.CANARY_STATE_DIR || join(homedir(), '.local/state/badge-collector/canary');
const NAG_MS = 6 * 3_600_000;
const DASHBOARD_URL = 'http://192.168.1.162:3400';

type Kind = 'selector' | 'socket';
export type CanaryStatus = 'ok' | 'warn' | 'broken' | 'error';

export interface CanaryResult {
    kind: Kind;
    at: number;
    durationMs: number;
    exitCode: number;
    status: CanaryStatus;
    /** 사람이 읽을 문제 요약 */
    problems: string[];
    /** 선택자 카나리가 찾은 자동 수정 후보 (canary-autofix.json 그대로) */
    autofix?: unknown;
    /** 지금 상태가 시작된 시각 */
    since: number;
    notifiedAt?: number;
    notifiedKey?: string;
    history: { at: number; status: CanaryStatus }[];
}

const SPEC: Record<Kind, { label: string; script: string; alert: string; env: Record<string, string> }> = {
    selector: {
        label: '선택자 카나리',
        script: 'canary:chzzk',
        alert: 'canary-alert.json',
        // odroid(4코어, 7GB)라 GitHub 기본값 8보다 줄인다
        env: { CANARY_MODE: 'live', CANARY_PARALLEL: '4' },
    },
    socket: {
        label: '소켓 카나리',
        script: 'canary:socket',
        alert: 'canary-socket-alert.json',
        env: { SOCKET_CANARY_CHANNELS: '8', SOCKET_CANARY_SECONDS: '120', DISCORD_CANARY_WEBHOOK: '' },
    },
};

function runScript(script: string, env: Record<string, string>): Promise<{ code: number; output: string }> {
    return new Promise((resolve) => {
        const child = spawn('npm', ['run', '--silent', script], { cwd: REPO_ROOT, env: { ...process.env, ...env } });
        let output = '';
        const keep = (b: Buffer) => {
            process.stdout.write(b);
            output = (output + b.toString()).slice(-20_000);
        };
        child.stdout.on('data', keep);
        child.stderr.on('data', keep);
        child.on('close', (code) => resolve({ code: code ?? 1, output }));
    });
}

function readAlert(file: string): { title?: string; body?: string } | undefined {
    const path = join(OUT_DIR, file);
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
}

async function main(): Promise<void> {
    const kind = process.argv[2] as Kind;
    const spec = SPEC[kind];
    if (!spec) throw new Error('usage: canary.ts selector|socket');

    mkdirSync(OUT_DIR, { recursive: true });
    // 지난 실행의 알림 파일이 남아 있으면 이번 결과로 오해한다
    for (const f of [spec.alert, 'canary-autofix.json']) rmSync(join(OUT_DIR, f), { force: true });

    const started = Date.now();
    const { code, output } = await runScript(spec.script, spec.env);
    const alert = readAlert(spec.alert);
    const autofixPath = join(OUT_DIR, 'canary-autofix.json');
    const autofix = kind === 'selector' && existsSync(autofixPath) ? JSON.parse(readFileSync(autofixPath, 'utf8')) : undefined;
    const warnings = [...output.matchAll(/\[socket-canary\] WARN (.+)/g)].map((m) => m[1]);
    const rareNew = [...output.matchAll(/\[socket-canary\] RARE-NEW (.+)/g)].map((m) => m[1]);

    let status: CanaryStatus;
    let problems: string[];
    if (alert) {
        status = 'broken';
        problems = [alert.title ?? '', ...(alert.body ?? '').split('\n')].filter(Boolean).slice(0, 20);
    } else if (code !== 0) {
        // 선택자 2: 채널을 못 찾았거나 스크립트가 죽음. 판정을 못 한 것이지 깨진 건 아니다
        status = 'error';
        problems = output.trim().split('\n').slice(-8);
    } else if (warnings.length) {
        status = 'warn';
        problems = warnings;
    } else {
        status = 'ok';
        problems = [];
    }

    const prev = readJson<CanaryResult>(`canary-${kind}`);
    const now = Date.now();
    const result: CanaryResult = {
        kind,
        at: now,
        durationMs: now - started,
        exitCode: code,
        status,
        problems,
        autofix,
        since: prev && prev.status === status ? prev.since : now,
        notifiedAt: prev?.notifiedAt,
        notifiedKey: prev?.notifiedKey,
        history: [{ at: now, status }, ...(prev?.history ?? [])].slice(0, 30),
    };

    const key = `${status}:${problems.join('|')}`;
    const lines: string[] = [];
    if (status === 'ok' && prev && prev.status !== 'ok') {
        lines.push(`**${spec.label} 회복** (${prev.status} 상태였음)`);
    } else if (status === 'broken' && prev?.status === 'broken' && now - (prev.notifiedAt ?? prev.since) >= NAG_MS) {
        const hours = Math.round((now - result.since) / 3_600_000);
        lines.push(`**${spec.label} 아직 깨져 있음** (${hours}시간째)`, ...problems.slice(0, 6));
    } else if (kind === 'socket' && status !== 'ok' && key !== prev?.notifiedKey) {
        lines.push(`**${spec.label} ${status === 'broken' ? '깨짐' : status === 'warn' ? '처음 보는 값' : '실행 실패'}**`, ...problems.slice(0, 8));
    }
    if (lines.length) {
        lines.push(DASHBOARD_URL);
        await sendDiscord(lines);
        result.notifiedAt = now;
        result.notifiedKey = key;
    } else if (kind === 'selector' && status !== prev?.status) {
        // 상태가 바뀐 첫 알림은 스크립트가 보냈다
        result.notifiedAt = now;
        result.notifiedKey = key;
    }

    if (rareNew.length) {
        await sendDiscord([`**${spec.label}: 처음 잡힌 드문 메시지** ${rareNew.join(', ')}`, `모양: ovm ${join(OUT_DIR, 'socket-rare.json')}`]);
    }

    writeJson(`canary-${kind}`, result);
    console.log(`[canary] ${new Date().toISOString()} ${kind} ${status} exit=${code}`);
}

main().catch((err) => {
    console.error(`[canary] ${new Date().toISOString()}`, err);
    process.exit(1);
});
