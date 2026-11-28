import { DEFAULT_PARAMS, PARAM_RANGE, type AudioParams } from '@/utils/audio-compressor';

/**
 * 설정 '소리'의 '설명으로 설정' — 소리 문제를 문장으로 적으면 Jev가 문제 종류와 세기를 고르고, 코드가 그걸 컴프레서 값으로 바꾼다.
 * 받은 값은 히스토리로 남겨 Jev를 다시 부르지 않고 적용한다. 적용한 뒤 슬라이더로 바꾼 값은 히스토리에 넣지 않는다.
 * 기본은 badgecollector.dev 중계 서버(쿨타임, 하루 횟수, 전체 한도). 고급 설정에 Jev API 키를 넣으면 그 키로 Jev를 바로 부른다.
 * 키는 중계 서버로 보내지 않는다. Jev API가 확장 출처의 CORS를 막아 JEV_ORIGINS 선택 권한이 필요하다(키를 저장할 때 묻는다).
 */
export const AUDIO_JEV_KEY = 'audioJev';
/** 설치 ID — 중계 서버가 하루 한도를 세는 데만 쓴다(서버엔 날짜를 섞은 해시만 남는다). 처음 요청할 때 만든다 */
const CLIENT_KEY = 'audioJevClient';
const RELAY_URL = 'https://badgecollector.dev/api/audio-jev';
const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
export const JEV_ORIGINS = ['https://api.typesafe.ai/*'];
export const JEV_KEY_URL = 'https://console.typesafe.ai/keys';

export interface JevHistoryItem {
    id: string;
    question: string;
    /** 기본은 질문 그대로, 바꿀 수 있다 */
    name: string;
    params: AudioParams;
    at: number;
}

/** 중계 서버가 마지막으로 알려 준 한도. 시각은 ms */
export interface JevQuota {
    remaining?: number;
    cooldownUntil?: number;
    /** 한도에 걸렸을 때만 — 이 시각까지 막힘 */
    limit?: { kind: 'user' | 'global'; resetAt: number };
}

export interface JevState {
    history: JevHistoryItem[];
    apiKey: string;
    quota: JevQuota;
}

export async function getJevState(): Promise<JevState> {
    const v = (await browser.storage.local.get(AUDIO_JEV_KEY))[AUDIO_JEV_KEY] as Partial<JevState> | undefined;
    return {
        history: Array.isArray(v?.history) ? v.history : [],
        apiKey: typeof v?.apiKey === 'string' ? v.apiKey : '',
        quota: v?.quota && typeof v.quota === 'object' ? v.quota : {},
    };
}

export async function updateJevState(fn: (s: JevState) => JevState) {
    await browser.storage.local.set({ [AUDIO_JEV_KEY]: fn(await getJevState()) });
}

/**
 * Jev에 묻는 질문. 중계 서버(badgecollector-site functions/api/audio-jev.ts)도 같은 질문을 보낸다 — 바꾸면 거기도 같이.
 * state는 `{ request: 사용자 문장 }`.
 */
export const JEV_QUESTIONS = {
    problem: {
        type: 'choice',
        instructions: 'A viewer describes what bothers them about the audio of a live stream in `request`. '
            + 'A dynamic range compressor will be tuned to fix it. Which problem is described?',
        criteria: {
            peaks: 'Sudden loud moments hurt: screaming, shouting, jump scares, loud reactions, volume spikes',
            voice: "The streamer's voice is hard to hear next to louder game sound, effects or music",
            uneven: 'The volume keeps going up and down; the viewer wants a more even level overall',
            quiet: 'Everything is too quiet; the viewer wants it louder overall',
            gentle: 'The viewer wants subtle, natural processing that keeps dynamics, such as for music or singing',
            none: 'Not about the loudness or dynamics of the stream audio',
        },
    },
    strength: {
        type: 'score',
        instructions: 'How strongly does the viewer in `request` want the audio controlled, judging by how severe they describe the problem?',
        criteria: [
            'A very light touch',
            'Lightly',
            'Moderately',
            'Strongly',
            'As much as possible; the problem is severe or painful',
        ],
    },
} as const;

type Problem = Exclude<keyof typeof JEV_QUESTIONS.problem.criteria, 'none'>;
const STRENGTH_MAX = JEV_QUESTIONS.strength.criteria.length - 1;

/** 문제마다 가장 약한 값과 가장 센 값. 세기(0~4)에 따라 그 사이를 고른다 */
const PRESETS: Record<Problem, [AudioParams, AudioParams]> = {
    peaks: [
        { threshold: -18, ratio: 6, knee: 3, attack: 1, release: 150, makeup: 0 },
        { threshold: -32, ratio: 20, knee: 0, attack: 1, release: 120, makeup: 3 },
    ],
    voice: [
        { threshold: -24, ratio: 3, knee: 10, attack: 10, release: 250, makeup: 3 },
        { threshold: -42, ratio: 8, knee: 6, attack: 5, release: 300, makeup: 10 },
    ],
    uneven: [
        { threshold: -20, ratio: 2, knee: 15, attack: 15, release: 300, makeup: 2 },
        { threshold: -36, ratio: 6, knee: 10, attack: 10, release: 400, makeup: 7 },
    ],
    quiet: [
        { threshold: -20, ratio: 2, knee: 10, attack: 10, release: 250, makeup: 4 },
        { threshold: -32, ratio: 4, knee: 6, attack: 5, release: 250, makeup: 12 },
    ],
    gentle: [
        { threshold: -12, ratio: 1.5, knee: 20, attack: 20, release: 400, makeup: 0 },
        { threshold: -24, ratio: 3, knee: 15, attack: 15, release: 400, makeup: 3 },
    ],
};

/** 받은 값을 슬라이더 범위와 눈금에 맞춘다 — 빠진 값은 기본값 */
export function clampParams(raw: Partial<Record<keyof AudioParams, unknown>>): AudioParams {
    const out = { ...DEFAULT_PARAMS };
    for (const k of Object.keys(PARAM_RANGE) as (keyof AudioParams)[]) {
        const n = Number(raw[k]);
        if (!Number.isFinite(n)) continue;
        const r = PARAM_RANGE[k];
        out[k] = Math.min(r.max, Math.max(r.min, Math.round(n / r.step) * r.step));
    }
    return out;
}

/** Jev 답 → 컴프레서 값. 소리 문제가 아니라고 답했거나 답이 이상하면 null */
export function paramsFromAnswers(answers: unknown): AudioParams | null {
    const a = answers as { problem?: { choice?: unknown }; strength?: { score?: unknown } } | null;
    const problem = a?.problem?.choice;
    const score = Number(a?.strength?.score);
    if (typeof problem !== 'string' || !(problem in PRESETS) || !Number.isFinite(score)) return null;
    const [lo, hi] = PRESETS[problem as Problem];
    const t = Math.min(1, Math.max(0, score / STRENGTH_MAX));
    const mixed = {} as AudioParams;
    for (const k of Object.keys(lo) as (keyof AudioParams)[]) mixed[k] = lo[k] + (hi[k] - lo[k]) * t;
    return clampParams(mixed);
}

/** limit: 한도, 쿨타임(quota에 담김). unclear: 소리 문제가 아니라는 답. bad_key: 내 키가 거절됨. failed: 네트워크, 서버 오류 */
export type JevFailure = 'limit' | 'unclear' | 'bad_key' | 'failed';
export type JevResult =
    | { ok: true; params: AudioParams; quota: JevQuota }
    | { ok: false; reason: JevFailure; quota: JevQuota };

function fromAnswers(answers: unknown, quota: JevQuota): JevResult {
    const params = paramsFromAnswers(answers);
    return params ? { ok: true, params, quota } : { ok: false, reason: 'unclear', quota };
}

/** 내 키로 Jev를 바로 부른다. 한도는 Jev 쪽 사정이라 quota는 비워 둔다 */
async function askJevDirect(question: string, apiKey: string): Promise<JevResult> {
    try {
        const res = await fetch(JEV_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model: 'jev-latest', state: { request: question }, questions: JEV_QUESTIONS }),
        });
        if (res.status === 401 || res.status === 403) return { ok: false, reason: 'bad_key', quota: {} };
        if (res.ok) return fromAnswers((await res.json())?.answers, {});
    } catch { /* 네트워크, 권한 없음 */ }
    return { ok: false, reason: 'failed', quota: {} };
}

async function clientId(): Promise<string> {
    const v = (await browser.storage.local.get(CLIENT_KEY))[CLIENT_KEY];
    if (typeof v === 'string') return v;
    const id = crypto.randomUUID();
    await browser.storage.local.set({ [CLIENT_KEY]: id });
    return id;
}

/**
 * 중계 서버 응답: 200 `{ answers, remaining, cooldownUntil }`,
 * 429 `{ error: 'cooldown' | 'user_limit' | 'global_limit', cooldownUntil?, resetAt? }`.
 */
async function askRelay(question: string): Promise<JevResult> {
    try {
        const res = await fetch(RELAY_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ question, client: await clientId() }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body?.answers) return fromAnswers(body.answers, { remaining: body.remaining, cooldownUntil: body.cooldownUntil });
        if (res.status === 429) {
            const kind = body?.error === 'user_limit' ? 'user' : body?.error === 'global_limit' ? 'global' : null;
            return {
                ok: false, reason: 'limit',
                quota: kind && body.resetAt ? { remaining: 0, limit: { kind, resetAt: body.resetAt } } : { cooldownUntil: body?.cooldownUntil },
            };
        }
    } catch { /* 네트워크 */ }
    return { ok: false, reason: 'failed', quota: {} };
}

export function askJev(question: string, apiKey: string): Promise<JevResult> {
    return apiKey ? askJevDirect(question, apiKey) : askRelay(question);
}
