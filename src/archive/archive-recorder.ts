import {
    ARCHIVE_HIDE_MESSAGE, ARCHIVE_PUT_MESSAGE, ARCHIVE_SETTING_KEY, DEFAULT_ARCHIVE_SETTING, channelOf, loadArchiveSetting,
    sanitizeArchiveSetting, type ArchiveMode, type ArchivePlatform, type ArchivedChat,
} from './chat-archive';

/**
 * 콘텐츠 스크립트 쪽 보관함 기록기 — 필터를 통과한 채팅을 모아 FLUSH_MS마다 백그라운드로 보낸다.
 * 무엇을 넣을지는 부르는 쪽이 정한다(치지직 라이브: chzzk-archive-feed, 트위치·다시보기: 모아보기 창).
 * 보내기에 실패하면(백그라운드 깨는 중) 다음에 다시 보낸다. 확장과 끊기면 남은 건 버린다.
 */
const FLUSH_MS = 2000;
/** 보내지 못하고 쌓아 둘 최대 개수 — 백그라운드가 계속 안 받을 때 메모리를 묶어 둔다 */
const QUEUE_LIMIT = 5000;

/** 백그라운드가 저장하지 못했으면(ok:false·응답 없음) 다시 보내게 던진다. */
function ok(res: unknown) {
    if ((res as { ok?: boolean } | undefined)?.ok !== true) throw new Error('archive not saved');
}

/** 기록할 채팅 하나 — key는 같은 채널 안에서 채팅마다 하나(같은 채팅이 다시 오면 같은 값) */
export type ArchiveEntry = Pick<ArchivedChat, 'time' | 'nickname' | 'text' | 'badges' | 'kind' | 'amount' | 'marker' | 'hidden'> & { key: string };

export interface ArchiveRecorder {
    record(entry: ArchiveEntry): void;
    /** 이 사이 채팅이 빠졌을 수 있다 (from·until은 채팅 시각) */
    gap(from: number, until: number): void;
    /** 이미 보관한 채팅이 나중에 블라인드됨 */
    hide(key: string): void;
    /** 남은 걸 바로 보낸다 (탭을 닫거나 숨길 때) */
    flush(): Promise<void>;
    stop(): void;
}

export function createArchiveRecorder(
    platform: ArchivePlatform,
    getChannel: () => { channelId: string; mode: ArchiveMode } | null,
    send: (msg: unknown) => Promise<unknown> = msg => browser.runtime.sendMessage(msg),
): ArchiveRecorder {
    let enabled = DEFAULT_ARCHIVE_SETTING.enabled;
    let puts: ArchivedChat[] = [];
    let hides: string[] = [];
    /** 채팅 key → 보관함 id (블라인드 때 찾으려고) */
    const idByKey = new Map<string, string>();
    let sending = false;

    loadArchiveSetting().then(s => { enabled = s.enabled; }).catch(() => { /* 기본값 */ });
    const onStorage = (changes: Record<string, { newValue?: unknown }>) => {
        if (ARCHIVE_SETTING_KEY in changes) enabled = sanitizeArchiveSetting(changes[ARCHIVE_SETTING_KEY].newValue).enabled;
    };
    browser.storage.local.onChanged.addListener(onStorage);

    async function flush() {
        if (sending || (puts.length === 0 && hides.length === 0)) return;
        sending = true;
        const p = puts, h = hides;
        puts = [];
        hides = [];
        try {
            if (p.length) ok(await send({ type: ARCHIVE_PUT_MESSAGE, chats: p }));
            if (h.length) ok(await send({ type: ARCHIVE_HIDE_MESSAGE, ids: h }));
        } catch {
            // 다음 차례에 다시 — 순서는 상관없다(id로 덮어쓴다)
            puts = [...p, ...puts].slice(-QUEUE_LIMIT);
            hides = [...h, ...hides].slice(-QUEUE_LIMIT);
        } finally {
            sending = false;
        }
    }

    function push(chat: ArchivedChat) {
        puts.push(chat);
        if (puts.length > QUEUE_LIMIT) puts.shift();
    }

    const timer = setInterval(flush, FLUSH_MS);
    const onHide = () => { if (document.visibilityState === 'hidden') void flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);

    return {
        record(entry) {
            if (!enabled) return;
            const ch = getChannel();
            if (!ch) return;
            const channel = channelOf(platform, ch.channelId, ch.mode);
            const id = `${channel}|${entry.key}`;
            idByKey.set(entry.key, id);
            if (idByKey.size > QUEUE_LIMIT) idByKey.delete(idByKey.keys().next().value!);
            const { time, nickname, text, badges, kind, amount, marker, hidden } = entry;
            push({
                id, channel, time, savedAt: Date.now(), nickname, text: hidden ? '' : text, badges, kind,
                ...(amount ? { amount } : {}), ...(marker ? { marker } : {}), ...(hidden ? { hidden } : {}),
            });
        },
        gap(from, until) {
            if (!enabled) return;
            const ch = getChannel();
            if (!ch) return;
            const channel = channelOf(platform, ch.channelId, ch.mode);
            push({ id: `${channel}|gap_${from}`, channel, time: from, until, savedAt: Date.now(), nickname: '', text: '', badges: [], kind: 'gap' });
        },
        hide(key) {
            const id = idByKey.get(key);
            if (!id) return;
            // 아직 보내지 않았으면 큐에서 바로 가린다
            for (const c of puts) if (c.id === id) { c.text = ''; c.hidden = true; }
            hides.push(id);
        },
        flush,
        stop() {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onHide);
            window.removeEventListener('pagehide', onHide);
            browser.storage.local.onChanged.removeListener(onStorage);
        },
    };
}
