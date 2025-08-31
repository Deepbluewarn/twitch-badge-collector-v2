import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: {
    name: '__MSG_ExtensionName__',
    description: '__MSG_ExtensionDesc__',
    default_locale: 'ko',
    version: '2.15.0',

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
      "webNavigation"
    ],

    // 호스트 권한
    host_permissions: [
      "*://*.twitch.tv/*",
      "*://chzzk.naver.com/*"
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
