/**
 * stats-report.ts·spike-alert.ts가 같이 쓰는 것 — GA Data API 호출, Discord 전송, 상태 파일.
 *
 * GA 인증은 analytics-mcp와 같은 authorized_user ADC 파일(refresh token)을 쓴다. CWS 개발자 속성은
 * 읽기 전용이라 서비스 계정을 붙일 수 없다.
 *
 * env:
 *  - ~/.config/badge-collector/stats-report.env  GOOGLE_APPLICATION_CREDENTIALS (없으면 ~/.config/analytics-mcp/adc.json)
 *  - ~/.config/badge-collector/community-watch.env  DISCORD_COMMUNITY_WEBHOOK 을 같이 쓴다. 없으면 콘솔 출력만
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

for (const name of ['community-watch.env', 'stats-report.env']) {
    const file = join(homedir(), '.config/badge-collector', name);
    if (existsSync(file)) process.loadEnvFile(file);
}

export const DRY_RUN = process.argv.includes('--dry-run');

// Chrome 웹 스토어 상세 페이지(LA 시간대), badgecollector.dev(서울 시간대)
export const STORE = { id: '360527264', tz: 'America/Los_Angeles' };
export const SITE = { id: '559448205', tz: 'Asia/Seoul' };
export type Property = typeof STORE;

const STATE_FILE = join(homedir(), '.local/state/badge-collector/stats-state.json');

export interface State {
    lastSpikeAt?: number;
}

export function loadState(): State {
    return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {};
}

export function saveState(state: State): void {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

let token: { value: string; expires: number } | undefined;

async function accessToken(): Promise<string> {
    if (token && token.expires > Date.now() + 60_000) return token.value;
    const file = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? join(homedir(), '.config/analytics-mcp/adc.json');
    const cred = JSON.parse(readFileSync(file, 'utf8'));
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: cred.client_id,
            client_secret: cred.client_secret,
            refresh_token: cred.refresh_token,
        }),
    });
    if (!res.ok) throw new Error(`oauth: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
    return token.value;
}

export type Row = { dims: string[]; mets: number[] };

async function ga(prop: Property, method: 'runReport' | 'runRealtimeReport', body: object): Promise<Row[]> {
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${prop.id}:${method}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`ga ${method} ${prop.id}: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as {
        rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[];
    };
    return (data.rows ?? []).map((r) => ({
        dims: (r.dimensionValues ?? []).map((v) => v.value),
        mets: (r.metricValues ?? []).map((v) => Number(v.value)),
    }));
}

export function report(
    prop: Property,
    [startDate, endDate]: [string, string],
    dimensions: string[],
    metrics: string[],
): Promise<Row[]> {
    return ga(prop, 'runReport', {
        dateRanges: [{ startDate, endDate }],
        dimensions: dimensions.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
        limit: 100000,
    });
}

export function realtime(prop: Property, dimensions: string[], metrics: string[]): Promise<Row[]> {
    return ga(prop, 'runRealtimeReport', {
        dimensions: dimensions.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
    });
}

// 'YYYY-MM-DD' (한국 날짜)
export function kstDate(ms: number): string {
    return new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

function offsetMs(ms: number, tz: string): number {
    const p = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        })
            .formatToParts(ms)
            .map((x) => [x.type, x.value]),
    );
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms;
}

// GA dateHour('YYYYMMDDHH', 속성 시간대) → 그 시각의 한국 날짜·시
export function dateHourToKstTime(dateHour: string, tz: string): { day: string; hour: number } {
    const local = Date.UTC(+dateHour.slice(0, 4), +dateHour.slice(4, 6) - 1, +dateHour.slice(6, 8), +dateHour.slice(8, 10));
    const utc = local - offsetMs(local - offsetMs(local, tz), tz);
    return { day: kstDate(utc), hour: new Date(utc + 9 * 3_600_000).getUTCHours() };
}

export function dateHourToKst(dateHour: string, tz: string): string {
    return dateHourToKstTime(dateHour, tz).day;
}

export async function sendDiscord(lines: string[]): Promise<void> {
    const url = process.env.DISCORD_COMMUNITY_WEBHOOK;
    if (DRY_RUN || !url) {
        console.log(lines.join('\n'));
        return;
    }
    // Discord 메시지 2000자 제한
    const chunks: string[] = [];
    for (const line of lines) {
        const last = chunks.at(-1);
        if (last !== undefined && last.length + line.length + 1 <= 1900) chunks[chunks.length - 1] = `${last}\n${line}`;
        else chunks.push(line.slice(0, 1900));
    }
    for (const content of chunks) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
        });
        if (!res.ok) throw new Error(`discord: ${res.status} ${await res.text()}`);
    }
}
