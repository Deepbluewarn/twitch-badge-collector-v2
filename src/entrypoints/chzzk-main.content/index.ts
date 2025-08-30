export default defineContentScript({
  matches: [
    "*://chzzk.naver.com/*"
  ],
  world: 'MAIN',
  allFrames: true,
  main() {
    // 실제 content script 로직 import
    import('../../content-scripts/chzzk/inject');
  },
});
