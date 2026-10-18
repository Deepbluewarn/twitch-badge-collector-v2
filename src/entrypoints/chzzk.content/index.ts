import './style.css';
import '../../render/chzzk-chat.css';
import { listenChzzkApiRequests } from '@/api/chzzk-channel';

export default defineContentScript({
  matches: [
    "*://chzzk.naver.com/*"
  ],
  allFrames: true,
  main() {
    // 설정 페이지의 채널 검색을 이 탭 출처로 대신 부른다 (src/api/chzzk-channel.ts). 맨 위 창만.
    if (window === window.top) listenChzzkApiRequests();
    // 실제 content script 로직 import
    import('../../content-scripts/chzzk/content-script');
  },
});
