/**
 * 주 경로 시험의 판정. 치지직 라이브는 소켓 경로가 주 경로이고 선택자는 대체 경로다.
 * 가장 큰 고장 두 가지를 본다: 수집 창이 아예 안 생김, 소켓 경로가 죽고 HTML 대체로 넘어감.
 *
 * 방송에 채팅이 있었는지는 화면이 아니라 페이지의 웹소켓 메시지로 센다(확장의 파서로 읽는다).
 * 치지직 화면 구조가 바뀌어도 "확인 못 함"으로 빠지지 않게. 소켓이 안 보이면 화면 채팅 줄로 센다.
 *
 * 입출력 없는 순수 함수만 둔다. 관찰은 live-check.ts --main이 한다.
 */
import { CHAT_SOCKET_URL } from '../../src/platform/chzzk-socket-url.ts';
import type { CheckReport, Finding } from './incidents.ts';

export interface PageObservation {
    url: string;
    /** 페이지가 연 웹소켓마다 확장 파서로 읽은 채팅 수 */
    sockets: { url: string; chats: number }[];
    /** 화면의 방송 채팅 줄 수 (고정 선택자) */
    domChats: number;
    /** 확장의 소켓 탭이 페이지 WebSocket에 설치됐는지 (ws-tap.ts의 표시) */
    tapInstalled: boolean;
    /** 탭이 확장에 실제로 넘긴 채팅 수 (window 메시지 tbc-socket-chat). 소켓 경로가 사는지의 근거 */
    tapDelivered: number;
    /** 수집 창 요소가 있는지 */
    paneExists: boolean;
    /** 수집 창의 채팅 수 */
    pane: number;
    paneWithBadge: number;
    paneWithName: number;
    /** 확장이 수집 창을 붙이는 채팅 컨테이너 선택자가 지금 화면에서 맞는 수 */
    container: number;
}

export interface MainRun extends Partial<PageObservation> {
    at: number;
    version?: string;
    error?: string;
}

export const hostChats = (o: Partial<PageObservation>) => Math.max((o.sockets ?? []).reduce((n, s) => n + s.chats, 0), o.domChats ?? 0);

export function judgeMain(run: MainRun): CheckReport {
    const base = { check: 'main', at: run.at };
    if (run.error) return { ...base, status: 'unknown', note: run.error, findings: [] };
    const host = hostChats(run);
    if (!host) return { ...base, status: 'unknown', note: '방송 채팅 없음', findings: [] };

    const sockets = run.sockets ?? [];
    const tapped = sockets.filter((s) => CHAT_SOCKET_URL.test(s.url));
    const tappedChats = tapped.reduce((n, s) => n + s.chats, 0);
    const where = [`방송 채팅 ${host}줄 (소켓 ${tappedChats}, 화면 ${run.domChats ?? 0})`, ...(run.url ? [run.url] : []), ...(run.version ? [`확장 v${run.version}`] : [])];
    const findings: Finding[] = [];

    if (!run.paneExists) {
        findings.push({
            key: 'main:no-pane',
            level: 'broken',
            title: '치지직 라이브에 수집 창이 생기지 않음',
            lines: [
                ...where,
                run.container ? `채팅 컨테이너 선택자는 화면에서 ${run.container}개 맞음` : '채팅 컨테이너 선택자(chatRoomLive)가 화면에서 0개. 수집 창이 붙을 곳이 없다',
                '고치는 법: docs/ota-selectors.md',
            ],
        });
    } else if (!run.pane) {
        findings.push({ key: 'main:empty-pane', level: 'broken', title: '치지직 라이브 수집 창이 비었음', lines: where });
    }

    // 탭이 채팅을 넘겼으면 소켓 경로는 산다. 안 넘겼으면 나머지는 원인 단서다
    if (!run.tapDelivered) {
        const reasons = ['확장의 소켓 탭이 채팅을 하나도 넘기지 않음'];
        if (!run.tapInstalled) reasons.push('탭이 페이지에 설치되지 않음 (ws-tap.ts)');
        if (!tapped.length) reasons.push(`탭이 기다리는 주소의 소켓이 열리지 않음 (열린 소켓: ${sockets.map((s) => s.url).join(', ') || '없음'})`);
        else if (!tappedChats) reasons.push('소켓 메시지를 확장 파서가 채팅으로 읽지 못함');
        else reasons.push('소켓과 파서는 정상. 탭 주소 규칙이나 탭이 확장으로 넘기는 부분을 볼 것 (src/platform/chzzk-socket-url.ts, ws-tap.ts)');
        findings.push({
            key: 'main:socket-path',
            level: 'risk',
            title: run.pane ? '소켓 경로가 죽어 HTML 대체 경로로 동작 중' : '소켓 경로가 죽음',
            lines: [...reasons, ...where, '급하면 OTA constants.socketRender: 0 (docs/ota-selectors.md)'],
        });
    }

    return { ...base, status: findings.length ? 'issue' : 'ok', findings };
}
