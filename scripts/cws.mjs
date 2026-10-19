#!/usr/bin/env node
/**
 * Chrome Web Store API v2 — 배포 작업(GitHub Actions)에서 쓴다. 의존성 없음(Node 20+ fetch).
 *
 *   node scripts/cws.mjs token            OAuth refresh token → access token (stdout)
 *   node scripts/cws.mjs status           게시본·제출본 상태 (JSON)
 *   node scripts/cws.mjs publish-staged   승인돼 대기(STAGED) 중이면 첫 단계 비율로 게시. 아니면 아무것도 안 함.
 *   node scripts/cws.mjs ramp             게시본이 단계적 배포 중이면 다음 단계로 올린다.
 *
 * 릴리스 때는 심사 제출만 STAGED_PUBLISH로 하고(publish.yml, publish-browser-extension),
 * 새벽 예약 작업(scheduled-publish.yml)이 publish-staged로 게시한다 — 방송을 많이 보는 시간대에 업데이트가
 * 퍼지지 않게. 대기 중인 항목을 다시 publish하면 심사 없이 바로 게시된다(API 문서).
 *
 * 단계적 배포: CHROME_ROLLOUT(기본 10,50,100)의 첫 비율로 게시하고, 새벽 작업이 하루에 한 단계씩 올린다.
 * 7일 활성 사용자 1만 명이 넘어야 쓸 수 있다 — 안 되면 100%로 게시한다. 비율은 올리기만 된다(API).
 * 문제가 보이면 Scheduled Publish 워크플로를 꺼서 더 올라가지 않게 하고, 고친 버전을 내면 이전 배포는 멈춘다.
 *
 * env: CHROME_CLIENT_ID, CHROME_CLIENT_SECRET, CHROME_REFRESH_TOKEN, CHROME_PUBLISHER_ID, CHROME_EXTENSION_ID
 *      GITHUB_OUTPUT(있으면 published=true|false를 적는다)
 */
import { appendFileSync } from 'node:fs';

const API = 'https://chromewebstore.googleapis.com/v2';
const env = name => {
    const v = process.env[name];
    if (!v) throw new Error(`${name} is not set`);
    return v;
};

async function accessToken() {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: env('CHROME_CLIENT_ID'),
            client_secret: env('CHROME_CLIENT_SECRET'),
            refresh_token: env('CHROME_REFRESH_TOKEN'),
        }),
    });
    if (!res.ok) throw new Error(`token: HTTP ${res.status} ${await res.text()}`);
    return (await res.json()).access_token;
}

async function call(token, method, path, body) {
    const res = await fetch(`${API}/publishers/${env('CHROME_PUBLISHER_ID')}/items/${env('CHROME_EXTENSION_ID')}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw Object.assign(new Error(`${method} ${path}: HTTP ${res.status} ${text}`), { status: res.status });
    return text ? JSON.parse(text) : {};
}

const ROLLOUT = (process.env.CHROME_ROLLOUT || '10,50,100').split(',').map(Number);

const output = (key, value) => {
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
};

const cmd = process.argv[2];
if (cmd === 'token') {
    process.stdout.write(await accessToken());
} else if (cmd === 'status') {
    console.log(JSON.stringify(await call(await accessToken(), 'GET', ':fetchStatus'), null, 2));
} else if (cmd === 'publish-staged') {
    const token = await accessToken();
    const status = await call(token, 'GET', ':fetchStatus');
    const submitted = status.submittedItemRevisionStatus;
    const version = submitted?.distributionChannels?.[0]?.crxVersion ?? '?';
    console.log(`published: ${status.publishedItemRevisionStatus?.state ?? '-'} ${status.publishedItemRevisionStatus?.distributionChannels?.[0]?.crxVersion ?? ''}`);
    console.log(`submitted: ${submitted?.state ?? '-'} ${version}`);
    if (submitted?.state === 'STAGED') {
        const first = ROLLOUT[0];
        try {
            await call(token, 'POST', ':publish', first < 100 ? { deployInfos: [{ deployPercentage: first }] } : {});
            console.log(`published staged ${version} to ${first}%`);
        } catch (e) {
            // 단계적 배포 자격이 없으면(사용자 1만 명 이하 등 — 요청 거절, 4xx) 전체로.
            // 서버 오류·네트워크 오류는 실패로 둔다 — 대기 상태가 유지돼 다음 새벽에 다시 10%로 시도한다.
            if (first >= 100 || !(e.status >= 400 && e.status < 500)) throw e;
            console.log(`rollout ${first}% rejected, publishing to 100%: ${e.message}`);
            await call(token, 'POST', ':publish', {});
            console.log(`published staged ${version} to 100%`);
        }
        output('published', 'true');
        output('version', version);
    } else {
        output('published', 'false');
    }
} else if (cmd === 'ramp') {
    const token = await accessToken();
    const status = await call(token, 'GET', ':fetchStatus');
    const channel = status.publishedItemRevisionStatus?.distributionChannels?.[0];
    const current = channel?.deployPercentage ?? 100;
    const next = ROLLOUT.find(p => p > current);
    console.log(`published ${channel?.crxVersion ?? '-'} at ${current}%`);
    if (next !== undefined) {
        await call(token, 'POST', ':setPublishedDeployPercentage', { deployPercentage: next });
        console.log(`raised to ${next}%`);
    }
} else {
    console.error('usage: node scripts/cws.mjs token|status|publish-staged|ramp');
    process.exit(2);
}
