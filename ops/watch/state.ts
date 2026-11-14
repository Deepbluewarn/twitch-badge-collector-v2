/**
 * 현황판 검사 결과 저장소. 검사마다 JSON 파일 하나, render.ts가 모아서 그린다.
 *
 * 위치: ~/.local/state/badge-collector/watch/<이름>.json
 */
import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { CheckReport } from './incidents.ts';

export const WATCH_DIR = join(homedir(), '.local/state/badge-collector/watch');
export const CACHE_DIR = join(homedir(), '.cache/badge-collector');

export const REPO = 'Deepbluewarn/twitch-badge-collector-v2';
export const RAW = `https://raw.githubusercontent.com/${REPO}/master`;
export const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export function readJson<T>(name: string): T | undefined {
    const file = join(WATCH_DIR, `${name}.json`);
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : undefined;
}

/** 다른 작업(상황실)이 쓰는 도중의 파일을 읽지 않게 임시 파일에 쓰고 이름을 바꾼다 */
export function writeJson(name: string, data: unknown): void {
    const file = join(WATCH_DIR, `${name}.json`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
    renameSync(`${file}.tmp`, file);
}

/**
 * 확인 작업의 보고서. 상황실(dispatch.ts)이 watch/checks/에서 모아 사건과 알림을 정한다.
 * --dry-run이면 쓰지 않고 출력만 한다 (다음 상황실 실행이 시험 결과를 읽지 않게).
 */
export function writeCheck(report: CheckReport): void {
    if (process.argv.includes('--dry-run')) {
        console.log(`[check] ${JSON.stringify(report, null, 2)}`);
        return;
    }
    writeJson(`checks/${report.check}`, report);
}

const RUN_SH = join(dirname(fileURLToPath(import.meta.url)), '../run.sh');

/** run.sh 작업을 띄운다. 이 작업이 끝나도 계속 돌게 떼어 낸다. 겹치면 run.sh의 잠금이 알아서 거른다 */
export function spawnJobs(jobs: string[]): void {
    for (const job of jobs) spawn('sh', [RUN_SH, job], { detached: true, stdio: 'ignore' }).unref();
}

export async function fetchText(url: string, init?: RequestInit): Promise<string> {
    const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...init?.headers } });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res.text();
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    return JSON.parse(await fetchText(url, init)) as T;
}

/** 검사 하나의 실패가 다른 검사를 막지 않게 감싼다. 실패는 결과에 error로 남긴다. */
export async function attempt<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
    try {
        return await fn();
    } catch (e) {
        return { error: String((e as Error)?.message ?? e).slice(0, 500) };
    }
}

export function isError(x: unknown): x is { error: string } {
    return !!x && typeof x === 'object' && 'error' in x;
}
