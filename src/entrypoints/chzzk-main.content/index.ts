export default defineContentScript({
  matches: [
    "*://chzzk.naver.com/*"
  ],
  world: 'MAIN',
  allFrames: true,
  // spoof는 host React보다 먼저 적용돼야 하므로 document_start 필요.
  runAt: 'document_start',
  main() {
    // 다른 탭/백그라운드 진입 시 chzzk가 visibilitychange를 듣고 채팅 렌더를 멈춤.
    // → 이벤트 차단 + document.hidden / visibilityState 위조로 host에게 항상 visible로 보이게.
    // (Chrome timer throttle 같은 브라우저-레벨 제약은 우회 못함. 라이브 audio 재생 중이면 throttle 면제됨.)
    document.addEventListener('visibilitychange', e => {
      e.stopImmediatePropagation();
    }, true);
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });

    // 실제 content script 로직 import
    import('../../content-scripts/chzzk/inject');
  },
});
