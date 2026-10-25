<div align="center">

<img src="public/icon/icon.png" width="96" alt="Badge Collector" />

# Badge Collector

**치지직, 트위치 채팅에서 원하는 채팅만 따로 모아 보는 브라우저 확장 프로그램**

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/gbcdobpipglclbhabpkacoecddmopojp?label=Chrome&logo=googlechrome&logoColor=white&color=FFD60A&labelColor=111111)](https://chromewebstore.google.com/detail/badge-collector/gbcdobpipglclbhabpkacoecddmopojp)
[![Chrome users](https://img.shields.io/chrome-web-store/users/gbcdobpipglclbhabpkacoecddmopojp?label=users&color=FFD60A&labelColor=111111)](https://chromewebstore.google.com/detail/badge-collector/gbcdobpipglclbhabpkacoecddmopojp)
[![Firefox Add-ons](https://img.shields.io/amo/v/twitch-badge-collector-v2?label=Firefox&logo=firefoxbrowser&logoColor=white&color=FFD60A&labelColor=111111)](https://addons.mozilla.org/ko/firefox/addon/twitch-badge-collector-v2/)
[![Release](https://img.shields.io/github/v/release/Deepbluewarn/twitch-badge-collector-v2?label=release&color=FFD60A&labelColor=111111)](https://github.com/Deepbluewarn/twitch-badge-collector-v2/releases)

![React](https://img.shields.io/badge/React_19-20232A?logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![WXT](https://img.shields.io/badge/WXT-67D55E?logo=wxt&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)
![TanStack Query](https://img.shields.io/badge/TanStack_Query-FF4154?logo=reactquery&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?logo=googlechrome&logoColor=white)

[Chrome 웹 스토어](https://chromewebstore.google.com/detail/badge-collector/gbcdobpipglclbhabpkacoecddmopojp) &nbsp;|&nbsp; [Firefox 부가 기능](https://addons.mozilla.org/ko/firefox/addon/twitch-badge-collector-v2/) &nbsp;|&nbsp; [badgecollector.dev](https://badgecollector.dev)

</div>

---

배지(구독, 매니저, 후원 등), 닉네임, 키워드로 필터를 만들면 걸린 채팅이 채팅창 위 수집 영역에 따로 쌓입니다. 라이브에서 놓치기 쉬운 채팅을 따라가거나, 다시보기에서 특정 사람의 채팅만 모아 볼 때 씁니다.

## 주요 기능

| 기능 | 설명 |
|---|---|
| **배지, 닉네임, 키워드 필터** | 조건을 묶어 필터 하나로. 포함, 제외, 꺼짐. 필터마다 표시 색 |
| **채널별 필터** | 채널마다 다른 필터. 치지직은 채널 이름으로 검색해 지정 |
| **필터 시험** | 배지, 닉네임, 채팅을 넣으면 수집되는지, 어느 필터에 걸렸는지 바로 확인 |
| **필터 관리** | 필터 찾기, 채널별 보기, 범위가 넓은 필터와 중복 필터 표시, 삭제 되돌리기 |
| **채널별로 끄기** | 원하지 않는 방송에서는 확장을 끄고 원래 채팅창 그대로 |
| **원본 채팅 표시** | 수집된 채팅을 원본 채팅창에 색 띠로 표시 |
| **채팅 캡처** | 수집된 채팅을 PNG로 저장 (Shift+클릭으로 범위 선택) |
| **채팅 유지** | 새로고침, 탭 이동 후에도 수집 내용 유지 |

## 개발

요구사항: Node.js 20+, npm

```sh
npm install
npm run dev          # Chrome dev 빌드 (HMR)
npm run dev:firefox  # Firefox dev 빌드
npm run build        # 프로덕션 빌드
npm run zip          # 스토어 업로드용 패키지
npm run test         # 단위 테스트 (vitest)
```

빌드 결과물은 `.output/`에 생깁니다. `chrome://extensions/`에서 **압축해제된 확장 프로그램 로드**로 불러옵니다.

## 이슈, 문의

[GitHub Issues](https://github.com/Deepbluewarn/twitch-badge-collector-v2/issues)로 알려 주세요.
