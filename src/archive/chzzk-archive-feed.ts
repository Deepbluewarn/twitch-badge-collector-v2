import {
    TBC_SOCKET_CHAT_ACTION, TBC_SOCKET_REPLAY_ACTION, TBC_SOCKET_REPLAY_REQUEST, type TbcSocketChatMessage,
} from '@/interfaces/chat-attributes';
import type { CompositeFilterElement } from '@/interfaces/filter';
import { evaluateFilterGroup } from '@/filter/evaluate';
import { toChatInfo, type ChzzkSocketChat } from '@/platform/chzzk-socket';
import { kindOf } from '@/render/chzzk-chat-view';
import type { ArchiveEntry, ArchiveRecorder } from './archive-recorder';

/**
 * 치지직 라이브 보관함 입구 — 소켓 탭(ws-tap.ts)이 넘긴 채팅을 직접 받아 필터에 걸린 것만 기록한다.
 *
 * 모아보기 창(Local·useChatStream)을 거치지 않는다. 창이 안 붙거나 내려가도, 원본 대기·화면 경로·캡쳐와
 * 상관없이 쌓인다. 소켓 데이터만 받으므로 같은 채팅은 늘 같은 key(`uid_time`)다.
 * 소켓 탭은 소켓 렌더 모드 스위치와 무관하게 항상 걸려 있어 모드가 꺼진 사용자도 여기로 들어온다.
 *
 * 끊김: 치지직은 소켓이 끊기면 다시 붙고 최근 채팅(최대 50개)을 다시 준다. 그 묶음이 끊기기 전 마지막으로
 * 받은 채팅까지 닿으면 빠진 게 없고, 못 닿으면 그사이를 끊김 구간으로 남긴다. 시각은 둘 다 서버 시각이라
 * 탭이 얼었다 풀려도 어긋나지 않는다.
 *
 * 뜰 때 소켓 탭에 지난 메시지를 다시 달라고 한다(TBC_SOCKET_REPLAY_REQUEST) — 페이지보다 늦게 떠서 놓친
 * 접속 직후 최근 채팅, 확장 업데이트 때 옛 스크립트가 받고 못 보낸 채팅을 메운다. 이미 본 채팅은 건너뛴다.
 */

/** 필터를 다시 볼 필요 없는 값 */
export function archiveFieldsOf(chat: ChzzkSocketChat): Pick<ArchiveEntry, 'badges' | 'kind' | 'amount' | 'hidden'> {
    const kind = kindOf(chat.type);
    const amount = kind === 'donation' ? Number(chat.extras.payAmount) || undefined : undefined;
    return { badges: chat.badges, kind, amount, hidden: chat.status !== 'NORMAL' || undefined };
}

/** 같은 채팅을 두 번 판정하지 않으려고 기억해 둘 개수 */
const SEEN_LIMIT = 5000;
/** 필터 그룹에 색이 없을 때 모아보기와 같은 기본 표시 색 */
const DEFAULT_MARKER = '#FFC107';

export interface ChzzkArchiveFeed {
    handle(msg: TbcSocketChatMessage): void;
}

export function createChzzkArchiveFeed(
    recorder: Pick<ArchiveRecorder, 'record' | 'hide' | 'gap'>,
    getFilters: () => CompositeFilterElement[],
    getChannelId: () => string | null,
    verifiedIconUrl?: () => string | undefined,
): ChzzkArchiveFeed {
    const seen = new Set<string>();
    /** 지금 소켓의 채팅 채널 — 다른 채널로 옮겨 붙은 건 끊김이 아니다 */
    let cid = '';
    /** 지금 채널에서 받은 가장 늦은 채팅 시각 */
    let lastTime = 0;
    /** 다시 붙은 뒤 첫 묶음을 기다리는 중이면 끊기기 전 마지막 시각 */
    let gapFrom: number | null = null;

    function chats(list: ChzzkSocketChat[]) {
        if (list.length === 0) return;
        const times = list.map(c => c.time);
        if (gapFrom !== null) {
            const earliest = Math.min(...times);
            if (earliest > gapFrom) recorder.gap(gapFrom, earliest);
            gapFrom = null;
        }
        lastTime = Math.max(lastTime, ...times);

        const filters = getFilters();
        const channelId = getChannelId();
        for (const chat of list) {
            if (seen.has(chat.id)) continue;
            seen.add(chat.id);
            if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value!);
            const info = toChatInfo(chat, verifiedIconUrl?.());
            const r = evaluateFilterGroup(info, filters, channelId);
            if (!r.pass) continue;
            recorder.record({
                key: chat.id, time: chat.time, nickname: info.nickName,
                text: chat.status === 'NORMAL' ? info.textContents.join(' ').trim() : '',
                marker: r.markerColor ?? DEFAULT_MARKER,
                ...archiveFieldsOf(chat),
            });
        }
    }

    return {
        handle(msg) {
            if (msg.kind === 'connected') {
                if (msg.cid && msg.cid === cid && lastTime > 0) gapFrom = lastTime;
                else { gapFrom = null; lastTime = 0; }
                cid = msg.cid;
            } else if (msg.kind === 'chats') {
                chats(msg.chats);
            } else if (msg.kind === 'blind') {
                // 해제(CANCEL)는 무시한다 — 보관함은 한 번 가린 본문을 되살리지 않는다
                if (msg.event.blindType !== 'CANCEL') recorder.hide(msg.event.id);
            }
        },
    };
}

/**
 * 콘텐츠 스크립트에서 띄운다. 필터는 저장소에서 읽고 바뀌면 따라간다 — 다 읽기 전에 온 메시지는 모아 뒀다가
 * 읽은 뒤 판정한다. 돌려준 함수로 멈춘다.
 */
export function startChzzkArchiveFeed(
    recorder: ArchiveRecorder,
    getChannelId: () => string | null,
    verifiedIconUrl?: () => string | undefined,
): () => void {
    let filters: CompositeFilterElement[] = [];
    const set = (v: unknown) => {
        filters = Array.isArray(v) ? (v as CompositeFilterElement[]).filter(f => f.platform === 'chzzk') : [];
    };
    const onStorage = (changes: Record<string, { newValue?: unknown }>) => {
        if ('filter' in changes) set(changes.filter.newValue);
    };
    browser.storage.local.onChanged.addListener(onStorage);

    const feed = createChzzkArchiveFeed(recorder, () => filters, getChannelId, verifiedIconUrl);
    let waiting: TbcSocketChatMessage[] | null = [];
    const onMessage = (e: MessageEvent) => {
        const action = e.data?.action;
        if (e.source !== window || (action !== TBC_SOCKET_CHAT_ACTION && action !== TBC_SOCKET_REPLAY_ACTION)) return;
        if (waiting) waiting.push(e.data);
        else feed.handle(e.data as TbcSocketChatMessage);
    };
    window.addEventListener('message', onMessage);
    window.postMessage({ action: TBC_SOCKET_REPLAY_REQUEST }, '*');

    browser.storage.local.get('filter')
        .then(r => set(r.filter))
        .catch(() => { /* 필터 없음 = 아무것도 안 걸림 */ })
        .finally(() => {
            const q = waiting ?? [];
            waiting = null;
            q.forEach(m => feed.handle(m));
        });

    return () => {
        window.removeEventListener('message', onMessage);
        browser.storage.local.onChanged.removeListener(onStorage);
        void recorder.flush();
        recorder.stop();
    };
}
