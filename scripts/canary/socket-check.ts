/**
 * 치지직 채팅 소켓 canary 판정 — 받은 패킷이 확장의 파서(src/platform/chzzk-socket.ts)가
 * 가정하는 모양과 맞는지 본다. 확장 동작 자체(탭 설치, 렌더)는 보지 않는다.
 *
 *  - error: 확장이 지금 깨졌거나 곧 깨질 변화. 접속 불가, 채팅 0건, 파싱 실패, 의존 필드 소실.
 *  - warn:  처음 보는 값. 당장 깨지진 않지만 새 기능·종류가 생겼다는 신호(cmd, 메시지 종류 등).
 *
 * 비율 기준을 둔 이유: 한두 건의 이상한 패킷(테스트 계정, 특수 이벤트)으로 알림이 뜨면
 * 아무도 안 보게 된다. 대다수가 바뀌었을 때만 error로 올린다.
 * 순수 함수 — 네트워크 없이 테스트한다.
 */
import { normalizeChzzkMessage, parseChzzkBlindEvent } from '../../src/platform/chzzk-socket.ts';

/** 번들(vendor)의 채팅 클라이언트가 처리하는 cmd + 우리가 보내는 요청의 응답. 2026-10 확인. */
export const KNOWN_CMDS = new Set([0, 10000, 10100, 15101, 93006, 93101, 93102, 94002, 94005, 94006, 94008, 94009, 94010, 94011, 94015]);
/** 번들 enum Bg 중 서버가 보내는 값. */
export const KNOWN_MSG_TYPES = new Set([1, 10, 11, 12, 13, 15, 30]);
/** 번들 enum Oy. */
export const KNOWN_STATUSES = new Set(['NORMAL', 'BLIND', 'CBOTBLIND']);
/** 번들 enum ky (94008 blindType). */
export const KNOWN_BLIND_TYPES = new Set(['CANCEL', 'BLIND', 'HIDDEN', 'RECLAIM', 'FILTERED', 'CBOTBLIND']);

/** 이 비율을 넘게 깨져야 error. */
export const BROKEN_RATIO = 0.05;
/** 배지가 하나도 안 나오는 걸 "깨짐"으로 보려면 이만큼은 채팅이 있어야 한다. */
export const MIN_CHATS_FOR_BADGE_CHECK = 200;

export interface ChannelCapture {
    channel: string;
    raws: string[];
}

export interface SocketCheckResult {
    errors: string[];
    warnings: string[];
    stats: {
        channels: number;
        connected: number;
        packets: number;
        chats: number;
        withBadges: number;
        byCmd: Record<string, number>;
        byMsgType: Record<string, number>;
    };
}

type Json = Record<string, any>;

function parseJson(v: unknown): { ok: boolean; value: Json | null } {
    if (v === null || v === undefined) return { ok: true, value: null };
    if (typeof v === 'object') return { ok: true, value: v as Json };
    if (typeof v !== 'string') return { ok: false, value: null };
    try {
        const parsed = JSON.parse(v);
        return parsed && typeof parsed === 'object' ? { ok: true, value: parsed } : { ok: false, value: null };
    } catch {
        return { ok: false, value: null };
    }
}

const inc = (m: Record<string, number>, k: string | number) => { m[k] = (m[k] ?? 0) + 1; };
const pct = (n: number, d: number) => `${n}/${d} (${d ? Math.round((n / d) * 100) : 0}%)`;

export function checkSocketCapture(captures: ChannelCapture[]): SocketCheckResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const byCmd: Record<string, number> = {};
    const byMsgType: Record<string, number> = {};
    const unknownCmds = new Set<string>();
    const unknownTypes = new Set<string>();
    const unknownStatuses = new Set<string>();
    const unknownBlindTypes = new Set<string>();

    let packets = 0, badJson = 0, connected = 0;
    let items = 0, parseFailed = 0, chats = 0, withBadges = 0;
    let profiles = 0, profileBroken = 0, nicknameMissing = 0, badgeFieldsMissing = 0;
    let extrasBroken = 0, nonHttpsBadges = 0;
    let donations = 0, donationAmountBroken = 0;
    let blinds = 0, blindParseFailed = 0;

    for (const { raws } of captures) {
        let sawConnected = false;
        for (const raw of raws) {
            packets++;
            let p: Json;
            try { p = JSON.parse(raw); } catch { badJson++; continue; }
            inc(byCmd, p.cmd);
            if (!KNOWN_CMDS.has(p.cmd)) unknownCmds.add(String(p.cmd));
            if (p.cmd === 10100) sawConnected = true;

            if (p.cmd === 94008) {
                blinds++;
                const ev = parseChzzkBlindEvent(p);
                if (!ev) blindParseFailed++;
                else if (!KNOWN_BLIND_TYPES.has(ev.blindType)) unknownBlindTypes.add(ev.blindType);
                continue;
            }

            const list: unknown[] = p.cmd === 15101 ? (p.bdy?.messageList ?? []) : (p.cmd === 93101 || p.cmd === 93102) ? (Array.isArray(p.bdy) ? p.bdy : []) : [];
            for (const it of list as Json[]) {
                items++;
                const chat = normalizeChzzkMessage(it);
                if (!chat) { parseFailed++; continue; }
                inc(byMsgType, chat.type);
                if (!KNOWN_MSG_TYPES.has(chat.type)) unknownTypes.add(String(chat.type));
                if (!KNOWN_STATUSES.has(chat.status)) unknownStatuses.add(chat.status);

                const ex = parseJson(it.extras);
                if (!ex.ok) extrasBroken++;

                if (chat.type === 10) {
                    donations++;
                    if (typeof ex.value?.payAmount !== 'number') donationAmountBroken++;
                }

                // 프로필 없는 건 익명 후원 등 정상 케이스 — 프로필이 있을 때만 필드를 본다.
                const pr = parseJson(it.profile);
                if (!pr.ok) { profileBroken++; continue; }
                if (!pr.value || chat.anonymous) continue;
                profiles++;
                if (typeof pr.value.nickname !== 'string' || !pr.value.nickname) nicknameMissing++;
                if (!Array.isArray(pr.value.viewerBadges) && !Array.isArray(pr.value.activityBadges)) badgeFieldsMissing++;

                if (chat.type === 30) continue; // 시스템 알림은 채팅 수집 대상이 아니다
                chats++;
                if (chat.badges.length) withBadges++;
                nonHttpsBadges += chat.badges.filter(b => !b.startsWith('https://')).length;
            }
        }
        if (sawConnected) connected++;
    }

    // ---- error ----
    if (captures.length === 0) errors.push('채팅 채널을 하나도 찾지 못했습니다 (라이브 목록/live-status API 확인)');
    else if (connected === 0) errors.push(`접속 완료(10100)를 받은 채널이 없습니다 — 0/${captures.length}. 접속 절차(토큰, CONNECT 형식, 서버 주소)가 바뀌었을 수 있습니다`);
    if (connected > 0 && chats === 0) errors.push('접속은 됐지만 채팅을 하나도 읽지 못했습니다 — 채팅 패킷 모양이 바뀌었을 수 있습니다');
    if (badJson > 0 && badJson / Math.max(packets, 1) > BROKEN_RATIO) errors.push(`JSON이 아닌 패킷 ${pct(badJson, packets)} — 전송 형식(압축, 바이너리)이 바뀌었을 수 있습니다`);
    if (parseFailed / Math.max(items, 1) > BROKEN_RATIO) errors.push(`채팅 정규화 실패 ${pct(parseFailed, items)} — 작성자/시각 필드(uid·msgTime 또는 userId·messageTime) 확인`);
    if (profileBroken / Math.max(items, 1) > BROKEN_RATIO) errors.push(`profile JSON 해석 실패 ${pct(profileBroken, items)}`);
    if (extrasBroken / Math.max(items, 1) > BROKEN_RATIO) errors.push(`extras JSON 해석 실패 ${pct(extrasBroken, items)}`);
    if (nicknameMissing / Math.max(profiles, 1) > BROKEN_RATIO) errors.push(`profile.nickname 없음 ${pct(nicknameMissing, profiles)} — 닉네임 필터가 깨집니다`);
    if (badgeFieldsMissing / Math.max(profiles, 1) > BROKEN_RATIO) errors.push(`profile.viewerBadges·activityBadges 둘 다 없음 ${pct(badgeFieldsMissing, profiles)} — 배지 필터가 깨집니다`);
    if (chats >= MIN_CHATS_FOR_BADGE_CHECK && withBadges === 0) errors.push(`채팅 ${chats}건 중 배지가 계산된 채팅이 0건 — deriveDisplayBadges가 가정하는 배지 필드가 바뀌었을 수 있습니다`);
    if (donations > 0 && donationAmountBroken / donations > BROKEN_RATIO) errors.push(`후원 extras.payAmount가 숫자가 아님 ${pct(donationAmountBroken, donations)}`);
    if (blinds > 0 && blindParseFailed / blinds > BROKEN_RATIO) errors.push(`블라인드 이벤트(94008) 해석 실패 ${pct(blindParseFailed, blinds)} — userId·messageTime·blindType 확인`);

    // ---- warn ----
    if (captures.length > 0 && connected > 0 && connected < captures.length / 2) warnings.push(`접속 완료를 받은 채널이 절반 미만 — ${connected}/${captures.length}`);
    if (unknownCmds.size) warnings.push(`처음 보는 cmd: ${[...unknownCmds].join(', ')}`);
    if (unknownTypes.size) warnings.push(`처음 보는 msgTypeCode: ${[...unknownTypes].join(', ')} — 새 메시지 종류. 렌더러에서 일반 채팅으로 그려진다`);
    if (unknownStatuses.size) warnings.push(`처음 보는 msgStatusType: ${[...unknownStatuses].join(', ')} — 렌더러는 블라인드로 처리한다`);
    if (unknownBlindTypes.size) warnings.push(`처음 보는 blindType: ${[...unknownBlindTypes].join(', ')}`);
    if (nonHttpsBadges > 0) warnings.push(`https가 아닌 배지 URL ${nonHttpsBadges}건`);

    return {
        errors,
        warnings,
        stats: { channels: captures.length, connected, packets, chats, withBadges, byCmd, byMsgType },
    };
}
