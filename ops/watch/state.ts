/**
 * 현황판 검사 결과 저장소. 검사마다 JSON 파일 하나, render.ts가 모아서 그린다.
 *
 * 위치: ~/.local/state/badge-collector/watch/<이름>.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export const WATCH_DIR = join(homedir(), '.local/state/badge-collector/watch');
export const CACHE_DIR = join(homedir(), '.cache/badge-collector');

export const REPO = 'Deepbluewarn/twitch-badge-collector-v2';
export const RAW = `https://raw.githubusercontent.com/${REPO}/master`;
export const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export function readJson<T>(name: string): T | undefined {
    const file = join(WATCH_DIR, `${name}.json`);
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : undefined;
}

export function writeJson(name: string, data: unknown): void {
    mkdirSync(WATCH_DIR, { recursive: true });
    writeFileSync(join(WATCH_DIR, `${name}.json`), JSON.stringify(data, null, 2));
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
