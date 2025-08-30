import './style.css';

export default defineContentScript({
  matches: [
    "*://chzzk.naver.com/*"
  ],
  allFrames: true,
  main() {
    // 실제 content script 로직 import
    import('../../content-scripts/chzzk/content-script');
  },
});
