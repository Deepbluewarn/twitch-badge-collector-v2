import type { PassedChat } from '@/hooks/useChatStream';
import {
    ARCHIVE_HIDE_MESSAGE, ARCHIVE_PUT_MESSAGE, ARCHIVE_SETTING_KEY, DEFAULT_ARCHIVE_SETTING, channelOf, loadArchiveSetting,
    sanitizeArchiveSetting, type ArchiveMode, type ArchivePlatform, type ArchivedChat,
} from './chat-archive';

/**
 * 콘텐츠 스크립트 쪽 보관함 기록기 — 필터를 통과한 채팅을 모아 FLUSH_MS마다 백그라운드로 보낸다.
 * 모아보기 버퍼와 따로 돈다: 캡쳐 중 일시 정지, 개수 제한, 초기화와 상관없이 기록한다.
 * 보내기에 실패하면(백그라운드 깨는 중) 다음에 다시 보낸다. 확장과 끊기면 남은 건 버린다.
 */
const FLUSH_MS = 2000;
/** 보내지 못하고 쌓아 둘 최대 개수 — 백그라운드가 계속 안 받을 때 메모리를 묶어 둔다 */
const QUEUE_LIMIT = 5000;

/** 백그라운드가 저장하지 못했으면(ok:false·응답 없음) 다시 보내게 던진다. */
function ok(res: unknown) {
    if ((res as { ok?: boolean } | undefined)?.ok !== true) throw new Error('archive not saved');
}

export interface ArchiveRecorder {
    record(chat: PassedChat): void;
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

    const timer = setInterval(flush, FLUSH_MS);
    const onHide = () => { if (document.visibilityState === 'hidden') void flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);

    return {
        record(chat) {
            if (!enabled || !chat.archive) return;
            const ch = getChannel();
            if (!ch) return;
            const channel = channelOf(platform, ch.channelId, ch.mode);
            const id = `${channel}|${chat.key}`;
            idByKey.set(chat.key, id);
            if (idByKey.size > QUEUE_LIMIT) idByKey.delete(idByKey.keys().next().value!);
            const { badges, kind, amount, marker, hidden } = chat.archive;
            puts.push({
                id, channel, time: chat.time, savedAt: Date.now(),
                nickname: chat.nickname, text: hidden ? '' : chat.text, badges, kind,
                ...(amount ? { amount } : {}), ...(marker ? { marker } : {}), ...(hidden ? { hidden } : {}),
            });
            if (puts.length > QUEUE_LIMIT) puts.shift();
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
