/**
 * Chzzk 채팅 소켓 canary — 인기 라이브 몇 개에 읽기 전용으로 잠깐 붙어, 응답이 확장의
 * 파서 가정과 맞는지 검사한다(판정은 socket-check.ts). 확장은 로드하지 않는다.
 *
 * 소켓 렌더 모드는 HTML 안전망 없이 소켓 우선으로 동작하므로, 프로토콜 변화는 사용자보다
 * 여기서 먼저 잡아야 한다 (docs/reports/2026-10-10-chzzk-socket-protocol.md "결정 사항").
 *
 * 결과:
 *  - error → Discord 알림 + canary-socket-alert.json (워크플로가 추적 이슈를 열고 run을 실패로)
 *  - warn  → Discord 알림만
 *
 * env:
 *  - SOCKET_CANARY_CHANNELS  동시 접속 채널 수 (기본 8)
 *  - SOCKET_CANARY_SECONDS   수집 시간 (기본 120)
 *  - DISCORD_CANARY_WEBHOOK
 */
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { collectChat, discoverLives } from '../capture/socket-client.ts';
import { checkSocketCapture, type ChannelCapture, type SocketCheckResult } from './socket-check.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALERT_FILE = join(REPO_ROOT, 'canary-socket-alert.json');
const CHANNELS = Math.max(1, parseInt(process.env.SOCKET_CANARY_CHANNELS ?? '8', 10));
const SECONDS = Math.max(10, parseInt(process.env.SOCKET_CANARY_SECONDS ?? '120', 10));

async function notifyDiscord(content: string) {
    const url = process.env.DISCORD_CANARY_WEBHOOK;
    if (!url) {
        console.log('[socket-canary] DISCORD_CANARY_WEBHOOK 미설정 — 콘솔 알림만.');
        return;
    }
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.slice(0, 1900) }),
    });
    if (!res.ok) console.error(`[socket-canary] Discord fail: ${res.status}`);
}

function summary(r: SocketCheckResult) {
    const s = r.stats;
    return `채널 ${s.connected}/${s.channels} 접속 · 패킷 ${s.packets} · 채팅 ${s.chats} (배지 있음 ${s.withBadges}) · 메시지 종류 ${JSON.stringify(s.byMsgType)}`;
}

function writeAlert(title: string, lines: string[]) {
    writeFileSync(ALERT_FILE, JSON.stringify({
        label: 'canary-socket',
        labelDescription: 'chzzk 채팅 소켓 canary 자동 감지',
        title,
        body: lines.join('\n'),
        actions: [
            '`npx tsx scripts/capture/chzzk-socket.ts`로 원본을 수집하고 `scripts/capture/analyze-chzzk-socket.ts`로 필드 변화를 확인',
            '`src/platform/chzzk-socket.ts` 파서와 `scripts/canary/socket-check.ts`의 기대값을 함께 갱신',
            '고치기 전까지 사용자 영향이 크면 OTA `constants.socketRender: 0`으로 소켓 모드를 원격으로 끈다 (`docs/ota-selectors.md` 시나리오 D)',
        ],
        capturedAt: new Date().toISOString(),
    }, null, 2));
}

async function main() {
    let captures: ChannelCapture[];
    try {
        const targets = await discoverLives(CHANNELS);
        const until = Date.now() + SECONDS * 1000;
        captures = targets.map(t => ({ channel: `${t.channelName} (${t.chatChannelId})`, raws: [] as string[] }));
        console.log(`[socket-canary] ${targets.length}개 채널에 ${SECONDS}초 접속`);
        await Promise.all(targets.map((t, i) =>
            collectChat(t.chatChannelId!, until, raw => captures[i].raws.push(raw))
                .catch(err => console.error(`[socket-canary] ${t.channelName}: ${err.message}`))));
        await new Promise(r => setTimeout(r, Math.max(0, until - Date.now()) + 1500));
    } catch (err) {
        const msg = `라이브 목록/채팅 채널 조회 실패: ${(err as Error).message}`;
        console.error(`[socket-canary] ${msg}`);
        writeAlert('chzzk socket canary: 채널 조회 실패', [msg]);
        await notifyDiscord(`🔴 **chzzk socket canary** — ${msg}`);
        process.exit(1);
    }

    const r = checkSocketCapture(captures);
    console.log(`[socket-canary] ${summary(r)}`);
    r.errors.forEach(e => console.error(`[socket-canary] ERROR ${e}`));
    r.warnings.forEach(w => console.warn(`[socket-canary] WARN ${w}`));

    if (r.errors.length) {
        const lines = ['## 오류', ...r.errors.map(e => `- ${e}`)];
        if (r.warnings.length) lines.push('', '## 경고', ...r.warnings.map(w => `- ${w}`));
        lines.push('', `- ${summary(r)}`);
        writeAlert(`chzzk socket canary: ${r.errors[0].slice(0, 80)}`, lines);
        await notifyDiscord(['🔴 **chzzk socket canary — 소켓 응답이 파서 가정과 다릅니다**', ...r.errors.map(e => `- ${e}`), ...r.warnings.map(w => `- ⚠ ${w}`), summary(r)].join('\n'));
        process.exit(1);
    }
    if (r.warnings.length) {
        await notifyDiscord(['🟡 **chzzk socket canary — 처음 보는 값**', ...r.warnings.map(w => `- ${w}`), summary(r)].join('\n'));
    }
    process.exit(0);
}

main();
