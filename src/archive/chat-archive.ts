/**
 * 채팅 보관함 — 필터를 통과한 채팅을 사용자 브라우저(확장 쪽 IndexedDB)에만 쌓아 둔다.
 *
 * 모아보기 창의 버퍼·채팅 유지 저장과 **완전히 따로** 둔다. 그쪽은 개수 제한, 초기화, 채널 이동,
 * 업데이트 빈틈, 렌더 오류로 채팅을 잃을 수 있다 — 보관함은 필터 통과 지점에서 바로 기록하고,
 * 추가만 하며, 기간 만료로만 지운다(사용자가 직접 지우는 것 제외). 버그로 창이 비어도 여기엔 남는다.
 *
 * 개인정보: 최소 필드만 둔다. 사용자 식별자(userIdHash)·운영자 블라인드 원문은 저장하지 않고,
 * 서버로 보내지 않는다. 쓰기는 백그라운드(콘텐츠 스크립트가 메시지로 보냄), 읽기는 확장 페이지가 직접 한다
 * (둘 다 확장 origin이라 같은 DB).
 */

export type ArchivePlatform = 'chzzk' | 'twitch';
export type ArchiveMode = 'live' | 'vod';
/** gap: 채팅 소켓이 끊겼다 다시 붙었는데 그사이 채팅을 다 메우지 못한 구간 — time부터 until까지 빠졌을 수 있다 */
export type ArchiveKind = 'chat' | 'donation' | 'subscription' | 'gift' | 'gap';

export interface ArchivedChat {
    /** `${channel}|${key}` — 같은 채팅이 다시 와도(원본 교체, 다시보기 재시청) 한 줄 */
    id: string;
    /** `${platform}:${channelId}:${mode}` */
    channel: string;
    /** 채팅 시각 — 라이브는 ms epoch, 다시보기는 영상 안의 위치(ms) */
    time: number;
    /** 보관한 시각(ms epoch) — 기간 만료 기준 */
    savedAt: number;
    nickname: string;
    /** 본문(이모티콘은 이름 그대로). 블라인드·클린봇 채팅은 빈 값 */
    text: string;
    badges: string[];
    kind: ArchiveKind;
    /** 후원 금액(치즈) */
    amount?: number;
    /** 모은 필터의 수집 표시 색 */
    marker?: string;
    /** 운영자 블라인드·클린봇으로 가려진 채팅 */
    hidden?: boolean;
    /** kind가 gap일 때 구간 끝 — 다시 붙은 뒤 처음 받은 채팅 시각 */
    until?: number;
}

export interface ArchiveChannel {
    channel: string;
    platform: ArchivePlatform;
    channelId: string;
    mode: ArchiveMode;
    lastAt: number;
}

export const channelOf = (platform: ArchivePlatform, channelId: string, mode: ArchiveMode) => `${platform}:${channelId}:${mode}`;

export function parseChannel(channel: string): Omit<ArchiveChannel, 'lastAt' | 'channel'> | null {
    const m = /^(chzzk|twitch):(.+):(live|vod)$/.exec(channel);
    return m ? { platform: m[1] as ArchivePlatform, channelId: m[2], mode: m[3] as ArchiveMode } : null;
}

// ── 설정 ─────────────────────────

export const ARCHIVE_SETTING_KEY = 'chatArchive';
export const ARCHIVE_DAYS = [7, 30, 90, 365] as const;
export interface ArchiveSetting { enabled: boolean; days: number }
export const DEFAULT_ARCHIVE_SETTING: ArchiveSetting = { enabled: true, days: 30 };

export function sanitizeArchiveSetting(v: unknown): ArchiveSetting {
    const src = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    return {
        enabled: typeof src.enabled === 'boolean' ? src.enabled : DEFAULT_ARCHIVE_SETTING.enabled,
        days: (ARCHIVE_DAYS as readonly number[]).includes(src.days as number) ? src.days as number : DEFAULT_ARCHIVE_SETTING.days,
    };
}

export async function loadArchiveSetting(): Promise<ArchiveSetting> {
    return sanitizeArchiveSetting((await browser.storage.local.get(ARCHIVE_SETTING_KEY))[ARCHIVE_SETTING_KEY]);
}

export async function saveArchiveSetting(s: ArchiveSetting): Promise<void> {
    await browser.storage.local.set({ [ARCHIVE_SETTING_KEY]: sanitizeArchiveSetting(s) });
}

// ── 메시지 (콘텐츠 스크립트 → 백그라운드) ─────────────────────────

export const ARCHIVE_PUT_MESSAGE = 'tbc-archive-put';
export const ARCHIVE_HIDE_MESSAGE = 'tbc-archive-hide';
export interface ArchivePutMessage { type: typeof ARCHIVE_PUT_MESSAGE; chats: ArchivedChat[] }
/** 나중에 블라인드된 채팅 — 보관해 둔 본문을 지운다 */
export interface ArchiveHideMessage { type: typeof ARCHIVE_HIDE_MESSAGE; ids: string[] }

// ── IndexedDB ─────────────────────────

const DB_NAME = 'tbc-chat-archive';
const CHATS = 'chats';
const CHANNELS = 'channels';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            const chats = db.createObjectStore(CHATS, { keyPath: 'id' });
            chats.createIndex('channelTime', ['channel', 'time']);
            chats.createIndex('savedAt', 'savedAt');
            db.createObjectStore(CHANNELS, { keyPath: 'channel' });
        };
        req.onsuccess = () => {
            const db = req.result;
            // 다른 곳에서 DB를 지우거나 올리면 닫고 다음에 다시 연다
            db.onversionchange = () => { db.close(); dbPromise = null; };
            resolve(db);
        };
        req.onerror = () => { dbPromise = null; reject(req.error); };
    });
    return dbPromise;
}

/** 테스트용 — 연결을 닫고 다음 호출에서 다시 연다. */
export async function closeArchiveDb(): Promise<void> {
    if (!dbPromise) return;
    const db = await dbPromise.catch(() => null);
    db?.close();
    dbPromise = null;
}

const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
});
const result = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
});

/** 채팅을 넣는다. 같은 id면 덮어쓴다 — 단, 이미 가려진 채팅의 본문을 되살리지는 않는다. */
export async function putArchivedChats(chats: ArchivedChat[]): Promise<void> {
    if (chats.length === 0) return;
    const db = await openDb();
    const tx = db.transaction([CHATS, CHANNELS], 'readwrite');
    const store = tx.objectStore(CHATS);
    const channels = tx.objectStore(CHANNELS);
    const last = new Map<string, number>();
    for (const chat of chats) {
        const prev = store.get(chat.id);
        prev.onsuccess = () => {
            const old = prev.result as ArchivedChat | undefined;
            store.put(old?.hidden ? { ...chat, text: '', hidden: true } : chat);
        };
        last.set(chat.channel, Math.max(last.get(chat.channel) ?? 0, chat.savedAt));
    }
    for (const [channel, lastAt] of last) {
        const parsed = parseChannel(channel);
        if (parsed) channels.put({ channel, ...parsed, lastAt } satisfies ArchiveChannel);
    }
    await done(tx);
}

/** 보관한 뒤에 블라인드된 채팅 — 본문을 지우고 가려짐 표시. */
export async function hideArchivedChats(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await openDb();
    const tx = db.transaction(CHATS, 'readwrite');
    const store = tx.objectStore(CHATS);
    for (const id of ids) {
        const req = store.get(id);
        req.onsuccess = () => {
            const chat = req.result as ArchivedChat | undefined;
            if (chat) store.put({ ...chat, text: '', hidden: true });
        };
    }
    await done(tx);
}

const channelRange = (channel: string) => IDBKeyRange.bound([channel, -Infinity], [channel, Infinity]);

/** 채널 목록 — 최근에 보관한 순서, 채널마다 채팅 수. */
export async function listArchiveChannels(): Promise<(ArchiveChannel & { count: number })[]> {
    const db = await openDb();
    const tx = db.transaction([CHATS, CHANNELS], 'readonly');
    const channels = await result(tx.objectStore(CHANNELS).getAll()) as ArchiveChannel[];
    const index = tx.objectStore(CHATS).index('channelTime');
    const counts = await Promise.all(channels.map(c => result(index.count(channelRange(c.channel)))));
    return channels
        .map((c, i) => ({ ...c, count: counts[i] }))
        .filter(c => c.count > 0)
        .sort((a, b) => b.lastAt - a.lastAt);
}

/** 한 채널의 채팅 전부 — 시각 순서. */
export async function getArchivedChats(channel: string): Promise<ArchivedChat[]> {
    const db = await openDb();
    const tx = db.transaction(CHATS, 'readonly');
    return await result(tx.objectStore(CHATS).index('channelTime').getAll(channelRange(channel))) as ArchivedChat[];
}

export async function deleteArchiveChannel(channel: string): Promise<void> {
    const db = await openDb();
    const tx = db.transaction([CHATS, CHANNELS], 'readwrite');
    const keys = await result(tx.objectStore(CHATS).index('channelTime').getAllKeys(channelRange(channel)));
    for (const k of keys) tx.objectStore(CHATS).delete(k);
    tx.objectStore(CHANNELS).delete(channel);
    await done(tx);
}

export async function clearArchive(): Promise<void> {
    const db = await openDb();
    const tx = db.transaction([CHATS, CHANNELS], 'readwrite');
    tx.objectStore(CHATS).clear();
    tx.objectStore(CHANNELS).clear();
    await done(tx);
}

/**
 * 전체 보관 수 상한 — 채팅 하나가 디스크에서 약 630바이트(색인 포함, 2026-10-25 실측)라 약 630MB.
 * 보통은 기간 만료가 먼저 온다. 모든 채팅을 모으는 필터로 인기 방송을 오래 보는 경우만 닿는다(하루 20만 개 넘게).
 */
export const ARCHIVE_MAX_CHATS = 1_000_000;

/**
 * 보관 기간이 지난 채팅을 지우고, 그래도 상한을 넘으면 가장 오래 보관한 것부터 지운다.
 * 채팅이 하나도 안 남은 채널은 목록에서도 뺀다.
 */
export async function purgeArchive(days: number, now = Date.now(), max = ARCHIVE_MAX_CHATS): Promise<void> {
    const db = await openDb();
    const tx = db.transaction([CHATS, CHANNELS], 'readwrite');
    const store = tx.objectStore(CHATS);
    const bySaved = store.index('savedAt');
    const cutoff = now - days * 86_400_000;
    const expired = await result(bySaved.getAllKeys(IDBKeyRange.upperBound(cutoff, true)));
    for (const k of expired) store.delete(k);
    const over = await result(store.count()) - max;
    if (over > 0) {
        // savedAt 오름차순 = 오래 보관한 것부터
        for (const k of await result(bySaved.getAllKeys(null, over))) store.delete(k);
    }
    const channels = tx.objectStore(CHANNELS);
    const byChannel = store.index('channelTime');
    for (const c of await result(channels.getAll()) as ArchiveChannel[]) {
        if (c.lastAt < cutoff || await result(byChannel.count(channelRange(c.channel))) === 0) channels.delete(c.channel);
    }
    await done(tx);
}

// ── 페이지 단위 읽기 ─────────────────────────
// 채널에 채팅이 수십만 개여도 화면은 한 페이지만 다룬다 — 전부 읽어 메모리에 올리지 않는다.

export async function countArchivedChats(channel: string): Promise<number> {
    const db = await openDb();
    return await result(db.transaction(CHATS, 'readonly').objectStore(CHATS).index('channelTime').count(channelRange(channel)));
}

/**
 * 최신부터 offset개를 건너뛰고 limit개. match를 주면 맞는 것만 세고 모은다(그때는 채널 전체를 훑는다).
 * total은 (match가 있으면 맞는) 전체 개수.
 */
export async function queryArchivedChats(
    channel: string,
    { offset, limit, match }: { offset: number; limit: number; match?: (c: ArchivedChat) => boolean },
): Promise<{ items: ArchivedChat[]; total: number }> {
    const db = await openDb();
    const index = db.transaction(CHATS, 'readonly').objectStore(CHATS).index('channelTime');
    if (!match) {
        const total = await result(index.count(channelRange(channel)));
        const items: ArchivedChat[] = [];
        await new Promise<void>((resolve, reject) => {
            const req = index.openCursor(channelRange(channel), 'prev');
            let skipped = offset === 0;
            req.onsuccess = () => {
                const cur = req.result;
                if (!cur) return resolve();
                if (!skipped) { skipped = true; cur.advance(offset); return; }
                items.push(cur.value as ArchivedChat);
                if (items.length >= limit) return resolve();
                cur.continue();
            };
            req.onerror = () => reject(req.error);
        });
        return { items, total };
    }
    const items: ArchivedChat[] = [];
    let total = 0;
    await eachArchivedChat(channel, c => {
        if (!match(c)) return;
        if (total >= offset && items.length < limit) items.push(c);
        total++;
    }, 'prev');
    return { items, total };
}

/** 채널의 채팅을 하나씩 — 내보내기·배지 세기처럼 전부 봐야 할 때. 한꺼번에 메모리에 올리지 않는다. */
export async function eachArchivedChat(channel: string, fn: (c: ArchivedChat) => void, direction: 'next' | 'prev' = 'next'): Promise<void> {
    const db = await openDb();
    const index = db.transaction(CHATS, 'readonly').objectStore(CHATS).index('channelTime');
    await new Promise<void>((resolve, reject) => {
        const req = index.openCursor(channelRange(channel), direction);
        req.onsuccess = () => {
            const cur = req.result;
            if (!cur) return resolve();
            fn(cur.value as ArchivedChat);
            cur.continue();
        };
        req.onerror = () => reject(req.error);
    });
}

// ── 내보내기 ─────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** 라이브는 날짜·시각, 다시보기는 영상 안의 위치. */
export function formatArchiveTime(chat: Pick<ArchivedChat, 'time'>, mode: ArchiveMode): string {
    if (mode === 'vod') {
        const t = Math.floor(chat.time / 1000);
        const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
        return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    }
    const d = new Date(chat.time);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const csvCell = (v: string | number | undefined) => {
    const s = v === undefined ? '' : String(v);
    // 스프레드시트가 수식으로 읽지 않게(=, +, -, @로 시작) 앞에 '를 붙인다
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** notice는 파일 첫 줄에 넣는 면책 문구. 줄 단위로 만들어 큰 채널도 나눠 쓸 수 있게 한다. */
export const csvHead = (notice: string) => [csvCell(`# ${notice}`), 'time,kind,nickname,text,amount,status'];
export const csvRow = (c: ArchivedChat, mode: ArchiveMode) => c.kind === 'gap'
    ? [formatArchiveTime(c, mode), c.kind, '', `~ ${formatArchiveTime({ time: c.until ?? c.time }, mode)}`, '', ''].map(csvCell).join(',')
    : [formatArchiveTime(c, mode), c.kind, c.nickname, c.text, c.amount, c.hidden ? 'hidden' : ''].map(csvCell).join(',');
export const textHead = (notice: string) => [`# ${notice}`, ''];
export const textRow = (c: ArchivedChat, mode: ArchiveMode, hiddenLabel: string, gapLabel: string) => c.kind === 'gap'
    ? `[${formatArchiveTime(c, mode)} ~ ${formatArchiveTime({ time: c.until ?? c.time }, mode)}] ${gapLabel}`
    : `[${formatArchiveTime(c, mode)}] ${c.nickname}${c.amount ? ` [${c.amount}]` : ''}: ${c.hidden ? hiddenLabel : c.text}`;

export function toCsv(chats: ArchivedChat[], mode: ArchiveMode, notice: string): string {
    return [...csvHead(notice), ...chats.map(c => csvRow(c, mode))].join('\r\n');
}

export function toText(chats: ArchivedChat[], mode: ArchiveMode, notice: string, hiddenLabel: string, gapLabel: string): string {
    return [...textHead(notice), ...chats.map(c => textRow(c, mode, hiddenLabel, gapLabel))].join('\n');
}

// ── 받은 값 검사 (백그라운드) ─────────────────────────

const KINDS: ArchiveKind[] = ['chat', 'donation', 'subscription', 'gift', 'gap'];
const str = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : '';

/** 콘텐츠 스크립트가 보낸 값 — 모양이 틀리면 null. 길이는 잘라 둔다. */
export function sanitizeArchivedChat(v: unknown): ArchivedChat | null {
    if (!v || typeof v !== 'object') return null;
    const c = v as Record<string, unknown>;
    if (typeof c.id !== 'string' || typeof c.channel !== 'string' || !parseChannel(c.channel)) return null;
    if (!c.id.startsWith(`${c.channel}|`) || c.id.length > 512) return null;
    if (typeof c.time !== 'number' || !Number.isFinite(c.time) || typeof c.savedAt !== 'number' || !Number.isFinite(c.savedAt)) return null;
    const hidden = c.hidden === true;
    const kind = KINDS.includes(c.kind as ArchiveKind) ? c.kind as ArchiveKind : 'chat';
    if (kind === 'gap' && (typeof c.until !== 'number' || !Number.isFinite(c.until) || c.until < c.time)) return null;
    return {
        id: c.id, channel: c.channel, time: c.time, savedAt: c.savedAt,
        nickname: str(c.nickname, 100),
        text: hidden ? '' : str(c.text, 2000),
        badges: Array.isArray(c.badges) ? c.badges.filter((b): b is string => typeof b === 'string').slice(0, 20).map(b => b.slice(0, 500)) : [],
        kind,
        ...(typeof c.amount === 'number' && c.amount > 0 ? { amount: c.amount } : {}),
        ...(typeof c.marker === 'string' && /^#[0-9a-f]{3,8}$/i.test(c.marker) ? { marker: c.marker } : {}),
        ...(hidden ? { hidden } : {}),
        ...(kind === 'gap' ? { until: c.until as number } : {}),
    };
}
