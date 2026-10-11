import { getPlatformConfig } from "@/platform/host-selectors";

/**
 * 소켓 렌더 모드 스위치 (chzzk 라이브). 기본으로 켜져 있다.
 *
 * 켜져 있어도 채팅 소켓 탭 신호가 한 번도 안 오면 HTML 경로로 동작한다 (useChatStream).
 * 이 스위치는 "탭은 오는데 소켓 모드가 잘못 동작하는" 경우를 위한 것이다.
 *
 * 우선순위:
 *  1. localStorage `tbc:socket-render` — '0'이면 끔, '1'이면 켬. 디버그·비교용.
 *  2. OTA manifest `platforms.chzzk.constants.socketRender` — 0이면 끔. 코드 재배포 없이
 *     원격으로 끄는 비상 스위치 (절차: docs/ota-selectors.md). 없으면 켬.
 *
 * MAIN world의 소켓 탭(ws-tap) 자체는 이 스위치와 무관하게 항상 설치된다. 치지직이 소켓을
 * 열기 전(document_start)에 걸려야 하는데 MAIN은 그 시점에 manifest를 아직 못 받았다.
 * 탭은 listener만 붙이고 예외를 밖으로 내지 않으므로 켜 둬도 host 동작에 영향이 없다.
 */
export const SOCKET_RENDER_FLAG = 'tbc:socket-render';

export function isSocketRenderEnabled(
    constants: Record<string, string | number> | undefined = getPlatformConfig('chzzk').constants,
    local: string | null = readLocal(),
): boolean {
    if (local === '0') return false;
    if (local === '1') return true;
    const remote = constants?.socketRender;
    return !(remote === 0 || remote === '0');
}

function readLocal(): string | null {
    try { return localStorage.getItem(SOCKET_RENDER_FLAG); } catch { return null; }
}
