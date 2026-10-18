/**
 * 확장이 업데이트·다시 로드되면 이미 열린 탭의 콘텐츠 스크립트는 확장과의 연결이 끊긴 채 남는다
 * ("Extension context invalidated"). 그대로 두면 저장·필터 읽기가 전부 실패해 수집이 조용히 멈춘다.
 *
 * - 끊김 감지: runtime.id를 주기적으로 본다(끊기면 undefined). 포트는 MV3에서 백그라운드가 쉴 때마다
 *   끊겨, 그걸로 감지하면 백그라운드를 계속 깨워야 해서 쓰지 않는다.
 * - 끊기면: 등록된 정리(감시 끊기, 모아보기 창 걷기)를 돌리고 "새로고침" 안내를 띄운다.
 *   Chrome은 background가 업데이트 직후 새 콘텐츠 스크립트를 다시 넣어 준다(entrypoints/background.ts).
 * - 새 스크립트는 시작하면서 신호(INSTANCE_EVENT)를 보낸다. 같은 탭의 옛 스크립트는 그걸 받으면 끊김 감지를
 *   기다리지 않고 바로 조용히 물러난다(안내 없이) — 늦게 감지한 옛 스크립트가 새 창을 건드리거나 안내를 띄우지 않게.
 * - 그다음 이전 실행이 남긴 창·안내를 치운다(removeLeftovers). Firefox처럼 옛 스크립트가 정리할 틈 없이
 *   사라지는 경우에도 겹치지 않게.
 */
import type { SettingInterface } from '@/interfaces/setting';

type Platform = SettingInterface['platform'];

const NOTICE_ID = 'tbcv2-updated-notice';
const INSTANCE_EVENT = 'tbcv2-instance';
const INSTANCE = Math.random().toString(36).slice(2);
const CHECK_MS = 2000;
const teardowns: (() => void)[] = [];
let orphaned = false;

export const isOrphaned = () => orphaned;

/** 연결이 끊겼을 때 돌릴 정리. 나중에 등록한 것부터 돈다. */
export function onTeardown(fn: () => void) {
    teardowns.push(fn);
}

function contextAlive(): boolean {
    try {
        return !!browser.runtime?.id;
    } catch {
        return false;
    }
}

/** 이전 실행(옛 버전)이 남긴 모아보기 창·손잡이·안내를 치운다. 새 스크립트가 맨 먼저 부른다. */
export function removeLeftovers(type: Platform) {
    for (const sel of [`#${type}-container`, '#handle-container', `#tbc-floating-${type}`, `#${NOTICE_ID}`]) {
        document.querySelectorAll(sel).forEach(el => el.remove());
    }
}

/**
 * 새 스크립트 시작 — 옛 스크립트를 물러나게 하고, 남은 창을 치우고, 끊기는지 지켜본다.
 * 순서가 중요하다: 옛 스크립트가 감시를 끊은 뒤에 치워야 옛 감시가 창을 다시 붙이지 않는다.
 */
export function startInstance(type: Platform) {
    // 끊긴 뒤엔 i18n도 못 부르니 문구는 미리 받아 둔다.
    let message = '';
    try { message = browser.i18n.getMessage('extensionUpdated'); } catch { /* 이미 끊김 */ }

    window.dispatchEvent(new CustomEvent(INSTANCE_EVENT, { detail: INSTANCE }));
    removeLeftovers(type);

    let timer = 0;
    const retire = (notice: boolean) => {
        if (orphaned) return;
        orphaned = true;
        window.clearInterval(timer);
        window.removeEventListener(INSTANCE_EVENT, onNewInstance);
        for (const fn of [...teardowns].reverse()) {
            try { fn(); } catch { /* 정리 중 실패는 무시 — 끊긴 상태라 흔하다 */ }
        }
        if (notice) showNotice(type, message);
    };
    // 새 스크립트가 들어왔다 → 안내 없이 물러난다.
    const onNewInstance = (e: Event) => { if ((e as CustomEvent).detail !== INSTANCE) retire(false); };
    window.addEventListener(INSTANCE_EVENT, onNewInstance);
    // 새 스크립트 없이 끊겼다(다시 넣기 실패 등) → 물러나고 새로고침 안내.
    timer = window.setInterval(() => { if (!contextAlive()) retire(true); }, CHECK_MS);
}

/** 원본 채팅창 위에 한 줄 — 누르면 새로고침. 새 스크립트가 들어오면 removeLeftovers가 치운다. */
function showNotice(type: Platform, message: string) {
    if (!message || document.getElementById(NOTICE_ID)) return;
    const host = document.getElementById(`tbc-${type}-chat-list-container`);
    if (!host) return;
    const el = document.createElement('button');
    el.id = NOTICE_ID;
    el.type = 'button';
    el.textContent = message;
    el.style.cssText = 'all:unset;box-sizing:border-box;display:block;width:100%;padding:8px 12px;'
        + 'background:#FFD60A;color:#111;font:700 13px/1.4 system-ui,sans-serif;text-align:center;cursor:pointer;';
    el.addEventListener('click', () => location.reload());
    host.prepend(el);
}
