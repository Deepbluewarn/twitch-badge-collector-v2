/**
 * 확장이 업데이트·다시 로드되면 이미 열린 탭의 콘텐츠 스크립트는 확장과의 연결이 끊긴 채 남는다
 * ("Extension context invalidated"). 그대로 두면 저장·필터 읽기가 전부 실패해 수집이 조용히 멈춘다.
 *
 * - 끊김 감지: runtime.id를 주기적으로 본다(끊기면 undefined). 포트는 MV3에서 백그라운드가 쉴 때마다
 *   끊겨, 그걸로 감지하면 백그라운드를 계속 깨워야 해서 쓰지 않는다.
 * - 끊기면: 등록된 정리(감시 끊기, 모아보기 창 걷기)를 돌리고 "연결이 끊겼습니다, 눌러서 새로고침" 안내를 띄운다.
 *   (업데이트만이 아니라 확장을 끄거나 지워도 끊기므로 '업데이트'라고 하지 않는다)
 *   Chrome은 background가 업데이트 직후 새 콘텐츠 스크립트를 다시 넣어 준다(entrypoints/background.ts).
 * - 새 스크립트는 시작하면서 신호(INSTANCE_EVENT)를 보낸다. 같은 탭의 옛 스크립트는 그걸 받으면 끊김 감지를
 *   기다리지 않고 바로 조용히 물러난다(안내 없이) — 늦게 감지한 옛 스크립트가 새 창을 건드리거나 안내를 띄우지 않게.
 * - 그다음 이전 실행이 남긴 창·안내를 치운다(removeLeftovers). Firefox처럼 옛 스크립트가 정리할 틈 없이
 *   사라지는 경우에도 겹치지 않게.
 */
import type { SettingInterface } from '@/interfaces/setting';
import { snapshotLeftoverChats } from './salvage';

type Platform = SettingInterface['platform'];

const NOTICE_ID = 'tbcv2-updated-notice';
const INSTANCE_EVENT = 'tbcv2-instance';
const INSTANCE = Math.random().toString(36).slice(2);
const CHECK_MS = 2000;
/** disconnected: 새 스크립트 없이 끊겼다(확장 끔·제거 등). false면 새 스크립트에 넘겨주는 중이다. */
type Teardown = (disconnected: boolean) => void;
const teardowns: Teardown[] = [];
let orphaned = false;

export const isOrphaned = () => orphaned;

/**
 * 연결이 끊겼을 때 돌릴 정리. 나중에 등록한 것부터 돈다.
 * 확장 CSS는 끊긴 뒤에도 페이지에 남는다(Chrome). 그래서 호스트에 붙인 id·속성·inline 스타일도 되돌려야
 * 원래 채팅창으로 돌아간다. 새 스크립트가 바로 다시 거는 것(채팅 좌우 배치 등)은 disconnected일 때만 되돌린다
 * — 넘겨주는 중에 되돌리면 화면이 한 번 뒤집혔다 돌아온다.
 */
export function onTeardown(fn: Teardown) {
    teardowns.push(fn);
}

function contextAlive(): boolean {
    try {
        return !!browser.runtime?.id;
    } catch {
        return false;
    }
}

/**
 * 이전 실행(옛 버전)이 남긴 모아보기 창·손잡이·안내를 치운다. 새 스크립트가 맨 먼저 부른다.
 *
 * 창·손잡이는 지우지 않고 **붙여 둔 채 숨기고 id를 바꾼다.** 옛 버전(이 파일이 없던 2.23.0 이하 포함)의
 * 팝오버 창에는 "떼어지면 다시 붙이는" 순수 DOM 감시가 있어, 지우면 곧바로 다시 붙어 창이 둘이 된다.
 * 붙어 있으면 그 감시는 아무것도 안 하고, id가 달라 새 창과도 겹치지 않는다. 새로고침하면 사라진다.
 */
export function removeLeftovers(type: Platform) {
    for (const sel of [`#${type}-container`, '#handle-container', `#tbc-floating-${type}`]) {
        document.querySelectorAll<HTMLElement>(sel).forEach(el => {
            el.id = `${el.id}-stale`;
            el.style.setProperty('display', 'none', 'important');
        });
    }
    document.getElementById(NOTICE_ID)?.remove();
}

/**
 * 새 스크립트 시작 — 옛 스크립트를 물러나게 하고, 남은 창을 치우고, 끊기는지 지켜본다.
 * 순서가 중요하다: 옛 스크립트가 감시를 끊은 뒤에 치워야 옛 감시가 창을 다시 붙이지 않는다.
 */
export function startInstance(type: Platform) {
    // 끊긴 뒤엔 i18n도 못 부르니 문구는 미리 받아 둔다.
    let message = '';
    try { message = browser.i18n.getMessage('extensionDisconnected'); } catch { /* 이미 끊김 */ }

    // 옛 창에 보이던 채팅을 떠 둔다 — 옛 스크립트가 신호를 받고 창을 걷기 전에(salvage.ts).
    snapshotLeftoverChats(type);
    window.dispatchEvent(new CustomEvent(INSTANCE_EVENT, { detail: INSTANCE }));
    removeLeftovers(type);

    let timer = 0;
    const retire = (notice: boolean) => {
        if (orphaned) return;
        orphaned = true;
        window.clearInterval(timer);
        window.removeEventListener(INSTANCE_EVENT, onNewInstance);
        // 정리하면서 채팅 목록의 id를 원래대로 돌려놓으니, 안내를 붙일 자리는 먼저 잡아 둔다.
        const host = document.getElementById(`tbc-${type}-chat-list-container`);
        for (const fn of [...teardowns].reverse()) {
            try { fn(notice); } catch { /* 정리 중 실패는 무시 — 끊긴 상태라 흔하다 */ }
        }
        if (notice && host) showNotice(host, message);
    };
    // 새 스크립트가 들어왔다 → 안내 없이 물러난다.
    const onNewInstance = (e: Event) => { if ((e as CustomEvent).detail !== INSTANCE) retire(false); };
    window.addEventListener(INSTANCE_EVENT, onNewInstance);
    // 새 스크립트 없이 끊겼다(다시 넣기 실패 등) → 물러나고 새로고침 안내.
    timer = window.setInterval(() => { if (!contextAlive()) retire(true); }, CHECK_MS);
}

/**
 * 원본 채팅창 위에 한 줄 — 누르면 새로고침. 새 스크립트가 들어오면 removeLeftovers가 치운다.
 * 채팅 목록 안이 아니라 바로 위(형제)에 붙인다 — 치지직은 목록 맨 위를 고정 메시지·미션 상자가 덮고 있다.
 * 트위치는 드롭스 안내 카드 등이 목록 위쪽에 떠 있어 z-index로 그 위에 올린다.
 */
function showNotice(host: HTMLElement, message: string) {
    if (!message || document.getElementById(NOTICE_ID)) return;
    const el = document.createElement('button');
    el.id = NOTICE_ID;
    el.type = 'button';
    el.textContent = message;
    el.style.cssText = 'all:unset;box-sizing:border-box;display:block;position:relative;z-index:1000;width:100%;padding:8px 12px;'
        + 'background:#FFD60A;color:#111;font-family:inherit;font-size:13px;font-weight:700;line-height:1.4;letter-spacing:normal;word-break:keep-all;'
        + 'text-align:center;cursor:pointer;';
    el.addEventListener('click', () => location.reload());
    host.before(el);
}
