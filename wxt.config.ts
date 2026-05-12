import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: {
    name: '__MSG_ExtensionName__',
    description: '__MSG_ExtensionDesc__',
    default_locale: 'ko',
    // CI 배포 시 release tag(v2.18.3 → 2.18.3)에서 주입.
    // 로컬 dev/zip은 fallback 사용 (스토어 정책상 패치 0이면 충돌하므로 미존재 시 dev 표기).
    version: process.env.RELEASE_VERSION || '1.2.3',

    // Firefox AMO에 등록된 extension ID. Chrome은 unknown key 무시.
    browser_specific_settings: {
      gecko: {
        id: 'tbcextension@gmail.com',
        strict_min_version: '109.0',
      },
    },

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
