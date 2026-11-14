/**
 * 리포의 카나리 스크립트(scripts/canary)를 ovm에서 돌리고 결과를 현황판 상태로 남긴다.
 *
 *   npx tsx ops/watch/canary.ts selector   선택자 카나리 (Playwright로 라이브 채널 방문)
 *   npx tsx ops/watch/canary.ts socket     소켓 카나리 (채팅 소켓에 2분 붙어 패킷 형태 확인)
 *
 * 결과는 보고서(checks/selector.json, checks/socket.json)로 남기고 상황실(dispatch.ts)이 알린다.
 * 두 스크립트의 Discord 알림은 끈다(DISCORD_CANARY_WEBHOOK을 비운다).
 *  - 선택자: 방송 전체 판정(scripts/canary/judge.ts)의 사건을 그대로 옮긴다. 스냅샷의 다른 변화(anchor 하락 등)는 참고
 *  - 소켓: 오류마다 깨짐 사건(socket:<문구>), 처음 보는 값은 참고, 드문 메시지는 종류마다 참고(socket-rare:<종류>).
 *    모양은 $CANARY_STATE_DIR/socket-rare.json
 *  - 채널을 못 찾았거나 스크립트가 죽으면 확인 못 함. 연달아 못 하면 상황실이 위험으로 올린다
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
import { stableKey, type Finding } from './incidents.ts';
import { readJson, writeCheck, writeJson } from './state.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = process.env.CANARY_STATE_DIR || join(homedir(), '.local/state/badge-collector/canary');

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
    history: { at: number; status: CanaryStatus }[];
}

const SPEC: Record<Kind, { label: string; script: string; alert: string; env: Record<string, string> }> = {
    selector: {
        label: '선택자 카나리',
        script: 'canary:chzzk',
        alert: 'canary-alert.json',
        // odroid(4코어, 7GB)라 GitHub 기본값 8보다 줄인다
        env: { CANARY_MODE: 'live', CANARY_PARALLEL: '4', DISCORD_CANARY_WEBHOOK: '' },
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

interface AlertFile {
    /** 선택자: 방송 전체 판정 (scripts/canary/judge.ts) */
    status?: 'ok' | 'issue' | 'unknown';
    note?: string;
    findings?: Finding[];
    /** 선택자: 지난 스냅샷과 달라진 점(anchor 하락 등). 참고 */
    alerts?: string[];
    /** 소켓 */
    title?: string;
    blind?: boolean;
    errors?: string[];
}

function readAlert(file: string): AlertFile | undefined {
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

    const findings: Finding[] = [];
    let blindNote: string | undefined;
    if (kind === 'selector') {
        findings.push(...(alert?.findings ?? []));
        for (const a of alert?.alerts ?? []) findings.push({ key: `selector:notice:${stableKey(a)}`, level: 'info', title: `선택자 카나리: ${a}` });
        if (alert?.status === 'unknown') blindNote = alert.note ?? '판정 못 함';
        else if (!alert) blindNote = output.trim().split('\n').at(-1) ?? `종료 코드 ${code}`;
    } else {
        if (alert?.blind) blindNote = alert.title ?? '채널을 못 찾음';
        else {
            for (const e of alert?.errors ?? []) findings.push({ key: `socket:${stableKey(e)}`, level: 'broken', title: `소켓 카나리: ${e}`, lines: ['고치는 법: src/platform/chzzk-socket.ts, 급하면 OTA constants.socketRender: 0 (docs/ota-selectors.md)'] });
            if (code !== 0 && !alert) blindNote = output.trim().split('\n').at(-1) ?? `종료 코드 ${code}`;
        }
        for (const w of warnings) findings.push({ key: `socket:warn:${stableKey(w)}`, level: 'info', title: `소켓 카나리 처음 보는 값: ${w}` });
        const rarePath = join(OUT_DIR, 'socket-rare.json');
        const rare = existsSync(rarePath) ? Object.keys(JSON.parse(readFileSync(rarePath, 'utf8'))) : [];
        for (const k of rare) findings.push({ key: `socket-rare:${k}`, level: 'info', title: `소켓 카나리: 처음 잡힌 드문 메시지 ${k}`, lines: [`모양: ovm ${rarePath}`] });
    }

    // 현황판 표시용 상태
    const status: CanaryStatus = findings.some((f) => f.level === 'broken') ? 'broken' : blindNote ? 'error' : warnings.length || findings.some((f) => f.level === 'risk') ? 'warn' : 'ok';
    const problems = status === 'ok' ? [] : blindNote ? output.trim().split('\n').slice(-8) : findings.filter((f) => !f.key.startsWith('socket-rare:')).map((f) => f.title).slice(0, 20);

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
        history: [{ at: now, status }, ...(prev?.history ?? [])].slice(0, 30),
    };

    writeCheck({
        check: kind,
        at: now,
        status: blindNote ? 'unknown' : findings.length ? 'issue' : 'ok',
        note: blindNote,
        findings,
    });
    writeJson(`canary-${kind}`, result);
    console.log(`[canary] ${new Date().toISOString()} ${kind} ${status} exit=${code}`);
}

main().catch((err) => {
    console.error(`[canary] ${new Date().toISOString()}`, err);
    process.exit(1);
});
