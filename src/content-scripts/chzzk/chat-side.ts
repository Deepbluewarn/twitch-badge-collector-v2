/**
 * 치지직 전용 — 호스트 채팅 사이드바를 비디오 좌/우 어느 쪽에 둘지.
 *
 * 치지직 라이브/다시보기는 둘 다 `flex-direction: row` 컨테이너 안에
 * [비디오, aside] 순서로 놓여 있다. aside에 `order: -1`을 주면 그대로 좌우가 뒤집힌다
 * (실측: aside left 1247 → 240, 비디오 240 → 593).
 *
 * 스타일을 aside에 직접 박지 않고 `<html>` 속성 + CSS 규칙으로 거는 이유:
 * aside는 치지직 React가 소유한 노드라 reconcile 때 우리 inline style이 날아갈 수 있다
 * (BaseContainer가 handle/parent id 복구 로직을 따로 두는 것과 같은 이유). `<html>`은
 * React 트리 밖이라 안전하고, 나머지는 CSS가 알아서 한다.
 *
 * 전체화면 keep-alive(content-script.tsx)와는 충돌하지 않는다. 그쪽은 aside를
 * `position: absolute`로 화면 밖에 빼는데, 흐름에서 빠지면 order는 애초에 무의미하다.
 * HIDE_PROPS에 order가 없으므로 override 해제 시 이 규칙이 그대로 다시 산다.
 */

/** CSS 규칙의 스위치. `src/entrypoints/chzzk.content/style.css`와 짝. */
export const CHAT_SIDE_ATTR = 'data-tbc-chzzk-chat-side';

export type ChatSide = 'right' | 'left';

/** storage에서 온 값(무엇이든)을 유효한 side로. 'left'만 좌측, 나머지는 치지직 기본. */
export function normalizeChatSide(raw: unknown): ChatSide {
    return raw === 'left' ? 'left' : 'right';
}

/**
 * `<html>`에 스위치 속성을 반영한다. 기본값(right)일 때는 속성을 아예 지운다 —
 * 남겨두면 "우리가 레이아웃에 손대고 있다"는 오해를 남기고, 호스트 CSS와 겹칠 때
 * 원인 추적이 어려워진다.
 */
export function applyChatSide(raw: unknown, root: HTMLElement = document.documentElement): ChatSide {
    const side = normalizeChatSide(raw);
    if (side === 'left') root.setAttribute(CHAT_SIDE_ATTR, 'left');
    else root.removeAttribute(CHAT_SIDE_ATTR);
    return side;
}
