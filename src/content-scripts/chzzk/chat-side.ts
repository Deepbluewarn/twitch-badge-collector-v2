/**
 * 치지직 전용 — 영상 양옆 두 영역(채팅 사이드바 / 전역 내비 사이드바)을 맞교환한다.
 *
 * 기본:   [전역 내비] [영상] [채팅]
 * left:   [채팅]     [영상] [전역 내비]
 *
 * 두 영역은 배치 방식이 달라 스위치도 둘이다.
 *
 * 1. 채팅 사이드바 — 라이브/다시보기 모두 `flex-direction: row` 컨테이너 안에
 *    [영상, aside] 순서다. aside에 `order: -1`만 주면 뒤집힌다 (실측: left 1247 → 240).
 *    측정이 필요 없으니 호스트 DOM이 뜨기 전에 미리 켜둘 수 있다.
 *
 * 2. 전역 내비 사이드바 — `position: fixed; left: 0`이고, `#layout-body`가
 *    `padding-left`로 그만큼 자리를 비워준다. 그래서 `right: 0`으로 보내는 것만으론
 *    부족하고 padding도 반대쪽으로 옮겨야 한다. 그런데 그 폭은 펼침/접힘에 따라
 *    달라진다 (실측 240px ↔ 82px). 폭을 상수로 박거나 hash 붙은 `_is_expanded_`
 *    클래스로 분기하는 대신, **호스트가 실제로 그린 폭을 읽어 CSS 변수로 넘긴다.**
 *
 * 스타일을 호스트 노드에 직접 박지 않고 `<html>` 속성/변수 + CSS 규칙으로 거는 이유:
 * 두 aside 모두 치지직 React가 소유한 노드라 reconcile 때 우리 inline style이 날아갈
 * 수 있다 (BaseContainer가 handle/parent id 복구 로직을 따로 두는 것과 같은 이유).
 * `<html>`은 React 트리 밖이라 안전하고, 나머지는 CSS가 알아서 한다.
 *
 * 전체화면 keep-alive(content-script.tsx)와는 충돌하지 않는다. 그쪽은 채팅 aside를
 * `position: absolute`로 화면 밖에 빼는데, 흐름에서 빠지면 order는 애초에 무의미하다.
 * HIDE_PROPS에 order가 없으므로 override 해제 시 이 규칙이 그대로 다시 산다.
 */

/** 채팅 사이드바 스위치. `src/entrypoints/chzzk.content/style.css`와 짝. */
export const CHAT_SIDE_ATTR = 'data-tbc-chzzk-chat-side';
/** 전역 내비 사이드바 스위치. 폭 측정에 성공해야 켜진다 — 아래 syncSidebarSwap 참고. */
export const SIDEBAR_SWAP_ATTR = 'data-tbc-chzzk-sidebar-swapped';
/** 전역 내비 사이드바의 실측 폭. `#layout-body`의 padding 미러링이 이 값을 쓴다. */
export const SIDEBAR_WIDTH_VAR = '--tbc-sidebar-w';

const SIDEBAR_SELECTOR = 'aside#sidebar';

export type ChatSide = 'right' | 'left';

/** storage에서 온 값(무엇이든)을 유효한 side로. 'left'만 좌측, 나머지는 치지직 기본. */
export function normalizeChatSide(raw: unknown): ChatSide {
    return raw === 'left' ? 'left' : 'right';
}

function clearSidebarSwap(root: HTMLElement) {
    root.removeAttribute(SIDEBAR_SWAP_ATTR);
    root.style.removeProperty(SIDEBAR_WIDTH_VAR);
}

/**
 * `<html>`에 채팅 사이드바 스위치를 반영한다. 기본값(right)일 때는 흔적을 남기지 않는다 —
 * 남겨두면 "우리가 레이아웃에 손대고 있다"는 오해를 남기고, 호스트 CSS와 겹칠 때
 * 원인 추적이 어려워진다.
 */
export function applyChatSide(raw: unknown, root: HTMLElement = document.documentElement): ChatSide {
    const side = normalizeChatSide(raw);
    if (side === 'left') {
        root.setAttribute(CHAT_SIDE_ATTR, 'left');
    } else {
        root.removeAttribute(CHAT_SIDE_ATTR);
        // 전역 사이드바 스위치는 켤 때는 측정을 기다리지만 **끌 때는 같이 꺼야 한다.**
        // 안 그러면 채팅만 오른쪽으로 돌아오고 내비는 오른쪽에 남아 양쪽이 겹친다.
        clearSidebarSwap(root);
    }
    return side;
}

/**
 * 전역 내비 사이드바의 실측 폭을 CSS 변수로 넘기고 스위치를 켠다.
 *
 * **폭을 못 재면 켜지 않는다.** 추측값으로 켜면 사이드바가 없는데 오른쪽에 빈 띠가
 * 생기거나(과다), 사이드바가 영상 위를 덮는다(과소). 어느 쪽이든 "안 켜짐"보다 나쁘다.
 */
export function syncSidebarSwap(
    sidebar: HTMLElement | null,
    root: HTMLElement = document.documentElement,
): boolean {
    const width = sidebar?.offsetWidth ?? 0;
    if (root.getAttribute(CHAT_SIDE_ATTR) !== 'left' || width <= 0) {
        clearSidebarSwap(root);
        return false;
    }
    root.style.setProperty(SIDEBAR_WIDTH_VAR, `${width}px`);
    root.setAttribute(SIDEBAR_SWAP_ATTR, '');
    return true;
}

let sidebarEl: HTMLElement | null = null;
let watching = false;

/**
 * 전역 내비 사이드바를 찾아 스위치를 켜고, 이후 폭 변화를 따라간다.
 *
 * 좌측 배치가 꺼져 있으면 스스로 아무것도 하지 않는다 — 설정 변경/SPA 이동 등
 * 아무 데서나 부담 없이 부를 수 있다. 여러 번 불러도 관찰자는 하나만 붙는다.
 */
export function trackSidebarSwap(root: HTMLElement = document.documentElement): void {
    if (root.getAttribute(CHAT_SIDE_ATTR) !== 'left') return;

    // SPA 이동으로 사이드바가 갈아끼워졌으면 잡고 있던 참조는 죽은 노드다. 다시 찾는다.
    if (sidebarEl && !sidebarEl.isConnected) {
        sidebarEl = null;
        watching = false;
    }

    // 껐다 켠 경우 clearSidebarSwap으로 지워진 스위치를 즉시 되살린다.
    if (sidebarEl) syncSidebarSwap(sidebarEl, root);
    if (watching) return;
    watching = true;

    waitForSidebar((el) => {
        sidebarEl = el;
        syncSidebarSwap(el, root);
        // 펼침/접힘으로 폭이 바뀐다. 클래스 hash에 기대지 않고 호스트가 실제로 그린
        // 폭을 그대로 따라가므로 치지직이 폭을 바꿔도 같이 따라간다.
        if (typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(() => syncSidebarSwap(el, root)).observe(el);
        }
    });
}

/**
 * utils-common의 findElement를 쓰지 않는다 — 그쪽은 10초간 못 찾으면 selector가
 * 깨졌다고 보고 강제 OTA fetch를 쏜다. 전역 사이드바 부재는 selector 문제가 아니라
 * "그런 사이드바가 없는 화면"일 뿐이라 그 신호를 오염시키면 안 된다.
 */
function waitForSidebar(cb: (el: HTMLElement) => void) {
    const found = document.querySelector<HTMLElement>(SIDEBAR_SELECTOR);
    if (found) {
        cb(found);
        return;
    }
    const mo = new MutationObserver(() => {
        const el = document.querySelector<HTMLElement>(SIDEBAR_SELECTOR);
        if (!el) return;
        mo.disconnect();
        cb(el);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
}
