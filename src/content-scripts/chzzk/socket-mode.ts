/**
 * 소켓 렌더 모드 스위치 (chzzk 라이브).
 *
 * 켜지면 Container가 HTML 복제본 대신 소켓 채팅을 템플릿 렌더러로 그린다. 아직 기본값이
 * 아니다 — 실사용 확인 후 기본으로 바꾸고 설정(표시 스타일)으로 옮길 예정.
 * 켜는 법: 치지직 페이지 콘솔에서 `localStorage.setItem('tbc:socket-render', '1')` 후 새로고침.
 */
const FLAG = 'tbc:socket-render';

export function isSocketRenderEnabled(): boolean {
    try { return localStorage.getItem(FLAG) === '1'; } catch { return false; }
}
