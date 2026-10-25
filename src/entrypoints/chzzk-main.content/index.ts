import { installChzzkSocketReplay, installChzzkSocketTap } from '../../content-scripts/chzzk/ws-tap';
import { installChzzkRestTap } from '../../content-scripts/chzzk/rest-tap';
import { isChannelOffNow } from '../../content-scripts/base/channel-off-flag';

export default defineContentScript({
  matches: [
    "*://chzzk.naver.com/*"
  ],
  world: 'MAIN',
  allFrames: true,
  // spoof는 host React보다 먼저 적용돼야 하므로 document_start 필요.
  runAt: 'document_start',
  main() {
    // 채팅 소켓 탭 — 치지직이 소켓을 열기 전이어야 하므로 맨 먼저, 동기로.
    // 탭이 이번에 새로 걸렸을 때만 — 업데이트로 다시 들어온 경우 옛 탭이 기억과 응답을 계속 맡는다.
    if (installChzzkSocketTap()) installChzzkSocketReplay();
    // REST 응답 탭(다시보기 채팅, 차단 목록) — 같은 이유로 host 스크립트보다 먼저.
    installChzzkRestTap();

    // 다른 탭/백그라운드 진입 시 chzzk가 visibilitychange를 듣고 채팅 렌더를 멈춤.
    // → 이벤트 차단 + document.hidden / visibilityState 위조로 host에게 항상 visible로 보이게.
    // (Chrome timer throttle 같은 브라우저-레벨 제약은 우회 못함. 라이브 audio 재생 중이면 throttle 면제됨.)
    // 꺼진 채널에서는 위조하지 않는다 — 확장을 끈 것과 같게 원래 값을 돌려준다.
    const hiddenOf = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden')?.get;
    const stateOf = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')?.get;
    document.addEventListener('visibilitychange', e => {
      if (!isChannelOffNow()) e.stopImmediatePropagation();
    }, true);
    Object.defineProperty(document, 'hidden', { get: () => isChannelOffNow() && hiddenOf ? hiddenOf.call(document) : false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => isChannelOffNow() && stateOf ? stateOf.call(document) : 'visible', configurable: true });

    // 실제 content script 로직 import
    import('../../content-scripts/chzzk/inject');
  },
});
