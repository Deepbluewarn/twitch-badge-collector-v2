/**
 * 10분마다: 감시 작업들이 제때 돌고 있는지 본다. 감시가 조용히 멈추면 아무 알림도 안 오기 때문이다.
 * (2026-10-25에 harvester가 멈췄는데 8일 동안 아무도 몰랐다)
 *
 * 근거는 run.sh가 남기는 ~/.local/state/badge-collector/runs/<작업>.json 의 마지막 성공 시각이다.
 * 정해 둔 시간보다 오래 성공하지 못한 작업이 생기면 Discord로 알리고, 12시간마다 다시 알린다.
 *
 * ovm 자체가 꺼지면 이 스크립트도 못 돈다. ~/.config/badge-collector/ops.env 에 OPS_HEALTHCHECK_URL이 있으면
 * 돌 때마다 그 주소에 신호를 보낸다(healthchecks.io 같은 외부 서비스가 신호가 끊기면 알린다).
 *
 * 상태: watch/heartbeat.json
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { sendDiscord } from '../common.ts';
import { readJson, writeJson } from './state.ts';

const OPS_ENV = join(homedir(), '.config/badge-collector/ops.env');
if (existsSync(OPS_ENV)) process.loadEnvFile(OPS_ENV);

const RUNS = join(homedir(), '.local/state/badge-collector/runs');
const REMIND_MS = 12 * 3_600_000;
const DASHBOARD_URL = 'http://192.168.1.162:3400';

/** 작업마다 마지막 성공에서 이만큼(분) 지나면 멈춘 것으로 본다. 주기보다 넉넉하게 */
export const JOBS: { job: string; label: string; maxAgeMin: number }[] = [
    { job: 'deploy', label: '치지직 배포 감지 (1분)', maxAgeMin: 10 },
    { job: 'socket', label: '소켓 카나리 (1시간)', maxAgeMin: 150 },
    { job: 'badges', label: '새 배지 알림 (10분)', maxAgeMin: 40 },
    { job: 'canary', label: '선택자 카나리 (6시간)', maxAgeMin: 420 },
    { job: 'live', label: '확장 실제 시험 (6시간)', maxAgeMin: 420 },
    { job: 'info', label: '스토어, 배지, GA 수집 (3시간)', maxAgeMin: 240 },
    { job: 'pull', label: '리포 갱신 (10분)', maxAgeMin: 40 },
    { job: 'spike', label: '방문 급증 알림 (30분)', maxAgeMin: 90 },
    { job: 'stats', label: '일일 통계 리포트 (매일 10시)', maxAgeMin: 26 * 60 },
    { job: 'channels', label: '구독 배지 페이지 데이터 (매일 5시 20분)', maxAgeMin: 26 * 60 },
];
/** systemd 사용자 서비스. 등록돼 있지 않으면 건너뛴다 */
const SERVICES = ['badge-dashboard', 'badge-harvester'];

interface RunRecord { job: string; start: number; end: number; code: number; lastOk: number }

export interface JobHealth {
    job: string;
    label: string;
    maxAgeMin: number;
    lastOk: number | null;
    lastEnd: number | null;
    code: number | null;
    stale: boolean;
}
export interface Heartbeat {
    at: number;
    installedAt: number;
    jobs: JobHealth[];
    services: { name: string; state: string }[];
    staleSince: Record<string, number>;
    notifiedAt?: number;
    notifiedKey?: string;
}

function readRun(job: string): RunRecord | undefined {
    const file = join(RUNS, `${job}.json`);
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as RunRecord) : undefined;
}

function serviceState(name: string): string {
    try {
        return execFileSync('systemctl', ['--user', 'is-active', name], { encoding: 'utf8' }).trim();
    } catch (e) {
        // is-active는 active가 아니면 0이 아닌 코드로 끝난다
        const out = String((e as { stdout?: string }).stdout ?? '').trim();
        return out || 'unknown';
    }
}

function serviceExists(name: string): boolean {
    try {
        execFileSync('systemctl', ['--user', 'cat', name], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

async function main(): Promise<void> {
    const now = Date.now();
    const prev = readJson<Heartbeat>('heartbeat');
    const installedAt = prev?.installedAt ?? now;
    const jobs: JobHealth[] = JOBS.map(({ job, label, maxAgeMin }) => {
        const r = readRun(job);
        const lastOk = r?.lastOk ? r.lastOk * 1000 : null;
        return {
            job, label, maxAgeMin,
            lastOk,
            lastEnd: r ? r.end * 1000 : null,
            code: r?.code ?? null,
            // 한 번도 안 돈 작업은 heartbeat를 처음 돌린 때부터 센다 (막 설치했을 때 전부 멈춤으로 뜨지 않게)
            stale: now - (lastOk ?? installedAt) > maxAgeMin * 60_000,
        };
    });
    const services = SERVICES.filter(serviceExists).map((name) => ({ name, state: serviceState(name) }));

    const problems = [
        ...jobs.filter((j) => j.stale).map((j) => `${j.label}: 마지막 성공 ${j.lastOk ? new Date(j.lastOk).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) : '없음'}${j.code ? `, 마지막 종료 코드 ${j.code}` : ''}`),
        ...services.filter((s) => s.state !== 'active').map((s) => `서비스 ${s.name}: ${s.state}`),
    ];
    const staleSince: Record<string, number> = {};
    for (const j of jobs.filter((x) => x.stale)) staleSince[j.job] = prev?.staleSince?.[j.job] ?? now;

    const hb: Heartbeat = { at: now, installedAt, jobs, services, staleSince, notifiedAt: prev?.notifiedAt, notifiedKey: prev?.notifiedKey };
    const key = problems.join('|');
    if (key !== (prev?.notifiedKey ?? '') || (key && now - (prev?.notifiedAt ?? 0) >= REMIND_MS)) {
        if (key) await sendDiscord(['**감시 작업 이상**', ...problems.map((p) => `- ${p}`), `로그: ssh ovm, ~/.local/state/badge-collector/ops.log`, DASHBOARD_URL]);
        else if (prev?.notifiedKey) await sendDiscord(['**감시 작업 모두 정상으로 돌아옴**']);
        hb.notifiedAt = now;
        hb.notifiedKey = key;
    }
    writeJson('heartbeat', hb);

    const url = process.env.OPS_HEALTHCHECK_URL;
    if (url) await fetch(problems.length ? `${url.replace(/\/$/, '')}/fail` : url, { method: 'POST', body: problems.join('\n') }).catch(() => {});
    console.log(`[heartbeat] ${new Date().toISOString()} 문제 ${problems.length}`);
}

main().catch((err) => {
    console.error(`[heartbeat] ${new Date().toISOString()}`, err);
    process.exit(1);
});
