# Badge Collector V2

Twitch와 치지직(Chzzk) 스트리밍 플랫폼의 채팅을 필터 그룹별로 분류해서 별도 컨테이너에 모아 보여주는 브라우저 확장입니다.

특정 사용자의 채팅이나 배지(구독자/모더레이터 등), 키워드 단위로 필터를 만들면 매칭된 채팅이 별도 영역에 누적됩니다. 라이브 시청 중 놓치기 쉬운 발언을 추적하거나, 다시보기에서 특정 시점의 발언을 모아 볼 때 사용합니다.

## 다운로드

- [Chrome 웹 스토어](https://chromewebstore.google.com/detail/badge-collector/gbcdobpipglclbhabpkacoecddmopojp)
- [Firefox 부가 기능](https://addons.mozilla.org/ko/firefox/addon/twitch-badge-collector-v2/)

## 주요 기능

- **필터 그룹** — 배지 / 사용자명 / 키워드 조합으로 필터를 정의. 채널별 필터 적용 가능.
- **표시 방식** — 원본 채팅창과 합쳐 표시(기본) 또는 별도 팝오버.
- **수집 마커** — 매칭된 채팅을 원본 채팅창에서 좌측 색상 띠로 표시. 필터 그룹별 색상 지정.
- **채팅 캡쳐** — 수집된 채팅을 PNG로 저장. Shift+클릭으로 범위 선택.
- **채팅 유지** — 새로고침/탭 이동에도 수집된 채팅 보존 (브라우저 종료 시 자동 정리).

## 호스트 selector 자동 갱신 (OTA)

호스트 플랫폼이 DOM 구조를 변경하면 확장이 깨질 수 있습니다. 이 확장은 selector 정의를 외부 JSON 파일로 분리하고 jsDelivr CDN을 통해 hotfix를 배포합니다. 사용자 측은 백그라운드에서 주기적으로 갱신하며, selector 매칭이 실패한 경우 즉시 강제 갱신합니다.

세부 운영 절차는 [docs/ota-selectors.md](docs/ota-selectors.md) 참고.

## 개발

요구사항: Node.js 20+, npm.

```sh
npm install
npm run dev          # Chrome용 dev 빌드 (HMR)
npm run dev:firefox  # Firefox용 dev 빌드
npm run build        # 프로덕션 빌드
npm run zip          # 스토어 업로드용 패키지
npm run test         # 단위 테스트 (vitest)
```

빌드 결과물은 `.output/` 에 생성됩니다. `chrome://extensions/` 에서 "압축해제된 확장 프로그램 로드"로 dev 빌드 로드.

### 도메인 문서

- [CONTEXT.md](CONTEXT.md) — 도메인 용어집
- [docs/adr/](docs/adr/) — 아키텍처 결정 기록
- [docs/agents/](docs/agents/) — agent skill 안내 (issue tracker, triage label, 도메인 문서 규칙)

### 기여 / 이슈

이슈는 GitHub Issues로 보고해 주세요. 채팅이 수집되지 않거나 마커가 표시되지 않는 경우, 확장 팝업의 일반 설정 하단 "OTA selectors rev" 값을 함께 알려 주시면 진단에 도움이 됩니다.
