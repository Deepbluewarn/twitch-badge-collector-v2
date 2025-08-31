import './style.css';

export default defineContentScript({
  matches: ["*://*.twitch.tv/*"],
  excludeMatches: [
    "*://passport.twitch.tv/*",
    "*://gql.twitch.tv/*"
  ],
  allFrames: true,
  main() {
    // 실제 content script 로직 import
    import('../../content-scripts/twitch/content-script');
  },
});
