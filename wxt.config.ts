import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: {
    name: '__MSG_ExtensionName__',
    description: '__MSG_ExtensionDesc__',
    default_locale: 'ko',
    version: '2.18.2',

    // Action (팝업)
    action: {
      default_icon: {
        "128": "icon/icon.png", // public/ 폴더 기준
      },
      default_popup: "popup.html" // WXT가 자동 생성
    },

    // 아이콘
    icons: {
      "128": "icon/icon.png",
    },

    // 권한
    permissions: [
      "storage",
      "webNavigation",
      "downloads"
    ],

    // 호스트 권한
    // 채팅 이미지 캡쳐용 CDN: Twitch 배지/이모트, Chzzk 배지/아이콘.
    // 서버가 ACAO를 안 줘도 host_permissions에 포함된 origin은 확장이 fetch 가능 → blob → data URL.
    host_permissions: [
      "*://*.twitch.tv/*",
      "*://chzzk.naver.com/*",
      "*://static-cdn.jtvnw.net/*",
      "*://*.pstatic.net/*",
      "*://nng-phinf.pstatic.net/*",
      "*://ssl.pstatic.net/*"
    ],

    // 웹 접근 가능한 리소스
    web_accessible_resources: [
      {
        resources: [
          "assets/icon.png",
          "assets/bmc-button.svg"
        ],
        matches: [
          "*://*.twitch.tv/*",
          "*://chzzk.naver.com/*"
        ]
      }
    ]
  },
});
