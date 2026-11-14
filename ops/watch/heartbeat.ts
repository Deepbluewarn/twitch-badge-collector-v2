/**
 * 10분마다: 감시 작업들이 제때 돌고 있는지 본다. 감시가 조용히 멈추면 아무 알림도 안 오기 때문이다.
 * (2026-10-25에 harvester가 멈췄는데 8일 동안 아무도 몰랐다)
 *
 * 근거는 run.sh가 남기는 ~/.local/state/badge-collector/runs/<작업>.json 의 마지막 성공 시각이다.
 * 정해 둔 시간보다 오래 성공하지 못한 작업, 멈춘 서비스를 보고서(checks/heartbeat.json)에 위험 사건으로 남긴다.
 * 상황실이 알리고 24시간마다 다시 알린다.
 *
 * ovm 자체가 꺼지면 이 스크립트도 못 돈다. ~/.config/badge-collector/ops.env 에 OPS_HEALTHCHECK_URL이 있으면
 * 돌 때마다 그 주소에 신호를 보낸다(healthchecks.io 같은 외부 서비스가 신호가 끊기면 알린다).
 * 문제가 있으면 /fail로 보낸다. 상황실이 멈춰 Discord 알림이 안 나가도 외부 서비스가 알린다.
 *
 * 상태: watch/heartbeat.json
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { readJson, writeCheck, writeJson } from './state.ts';

const OPS_ENV = join(homedir(), '.config/badge-collector/ops.env');
if (existsSync(OPS_ENV)) process.loadEnvFile(OPS_ENV);

const RUNS = join(homedir(), '.local/state/badge-collector/runs');

/** 작업마다 마지막 성공에서 이만큼(분) 지나면 멈춘 것으로 본다. 주기보다 넉넉하게 */
export const JOBS: { job: string; label: string; maxAgeMin: number }[] = [
    { job: 'deploy', label: '치지직 배포 감지 (1분)', maxAgeMin: 10 },
    // 상황실은 작업이 끝날 때마다, 적어도 heartbeat(10분)마다 돈다
    { job: 'dispatch', label: '상황실 (작업이 끝날 때마다)', maxAgeMin: 30 },
    { job: 'socket', label: '소켓 카나리 (1시간)', maxAgeMin: 150 },
    { job: 'badges', label: '새 배지 알림 (10분)', maxAgeMin: 40 },
    { job: 'canary', label: '선택자 카나리 (6시간)', maxAgeMin: 420 },
    { job: 'live', label: '확장 실제 시험 (6시간)', maxAgeMin: 420 },
    { job: 'main', label: '주 경로 시험 (1시간)', maxAgeMin: 150 },
    { job: 'info', label: '스토어, 배지, GA 수집 (3시간)', maxAgeMin: 240 },
    { job: 'usage', label: '확장 사용 통계 (5분)', maxAgeMin: 30 },
    { job: 'pull', label: '리포 갱신 (10분)', maxAgeMin: 40 },
    { job: 'ota', label: 'OTA 전달 확인 (10분)', maxAgeMin: 40 },
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
    /** 이 작업이 목록에 처음 들어온 때. 한 번도 안 돈 작업은 여기서부터 센다 */
    firstSeen?: number;
    stale: boolean;
}
export interface Heartbeat {
    at: number;
    installedAt: number;
    jobs: JobHealth[];
    services: { name: string; state: string }[];
    staleSince: Record<string, number>;
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
        const was = prev?.jobs.find((j) => j.job === job);
        // 한 번도 안 돈 작업은 목록에 들어온 때부터 센다 (막 설치했거나 새로 추가한 작업이 멈춤으로 뜨지 않게)
        const firstSeen = was?.firstSeen ?? (was ? installedAt : now);
        return {
            job, label, maxAgeMin,
            lastOk,
            lastEnd: r ? r.end * 1000 : null,
            code: r?.code ?? null,
            firstSeen,
            stale: now - (lastOk ?? firstSeen) > maxAgeMin * 60_000,
        };
    });
    const services = SERVICES.filter(serviceExists).map((name) => ({ name, state: serviceState(name) }));

    const kst = (ms: number | null) => (ms ? new Date(ms).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) : '없음');
    const findings = [
        ...jobs.filter((j) => j.stale).map((j) => ({
            key: `heartbeat:job:${j.job}`,
            level: 'risk' as const,
            title: `감시 작업 멈춤: ${j.label}`,
            lines: [`마지막 성공 ${kst(j.lastOk)}${j.code ? `, 마지막 종료 코드 ${j.code}` : ''}`, '로그: ssh ovm, ~/.local/state/badge-collector/ops.log'],
        })),
        ...services.filter((s) => s.state !== 'active').map((s) => ({
            key: `heartbeat:service:${s.name}`,
            level: 'risk' as const,
            title: `서비스 ${s.name}: ${s.state}`,
            lines: [`systemctl --user status ${s.name}`],
        })),
    ];
    const problems = findings.map((f) => f.title);
    const staleSince: Record<string, number> = {};
    for (const j of jobs.filter((x) => x.stale)) staleSince[j.job] = prev?.staleSince?.[j.job] ?? now;

    writeJson('heartbeat', { at: now, installedAt, jobs, services, staleSince } satisfies Heartbeat);
    writeCheck({ check: 'heartbeat', at: now, status: findings.length ? 'issue' : 'ok', findings });

    const url = process.env.OPS_HEALTHCHECK_URL;
    if (url) await fetch(problems.length ? `${url.replace(/\/$/, '')}/fail` : url, { method: 'POST', body: problems.join('\n') }).catch(() => {});
    console.log(`[heartbeat] ${new Date().toISOString()} 문제 ${problems.length}`);
}

main().catch((err) => {
    console.error(`[heartbeat] ${new Date().toISOString()}`, err);
    process.exit(1);
});
