# Testing Roadmap

단위 테스트 점진적 도입 계획. 18 commit의 리팩토링이 만든 *순수 모듈/Adapter*들이
test surface가 되어 있어, 시간 날 때마다 한 모듈씩 잡아가면 됨.

## 셋업 (완료)

- **러너**: [vitest](https://vitest.dev) — WXT 권장. node 환경(현재 evaluate.ts만)으로 시작.
- **설정**: [vitest.config.ts](../vitest.config.ts) — `@/` alias를 src로 매핑. include는 `src/**/*.test.{ts,tsx}`.
- **scripts**:
  - `npm test` — 1회 실행
  - `npm run test:watch` — watch 모드
- **node 환경**: 현재 `evaluate.ts`처럼 DOM 무관 모듈만 다룸. browser 환경 필요해지면 `happy-dom` 추가 + `environment: 'happy-dom'` 옵션.

## 진행 상황

| 모듈 | 위치 | 상태 | 케이스 수 |
|---|---|---|---|
| **`evaluateFilterGroup`** | [src/filter/evaluate.test.ts](../src/filter/evaluate.test.ts) | ✅ | 18 |

## TODO — 우선순위 순

### B 단계 — 추가 순수 모듈 (DOM 무관)

- [ ] **`validateFilterList`** ([src/filter/validate.ts](../src/filter/validate.ts))
  - 6개 에러 코드(`missing_filter`, `missing_id`, `missing_filter_type`, `missing_sub_filters`, `empty_sub_filter_value`)에 대한 valid/invalid 케이스
  - happy path 1개, 각 에러 코드당 1개 = ~7 케이스
  - 예상 시간: 10분

- [ ] **`useFilteredChatBuffer`** ([src/hooks/useFilteredChatBuffer.tsx](../src/hooks/useFilteredChatBuffer.tsx))
  - hook 테스트 — `@testing-library/react` + `renderHook` 추가 필요
  - 케이스: 정렬 방향(twitch=newest-bottom / chzzk=newest-top), dedupe, max 트림(끝/시작), clear
  - happy-dom 환경 필요 (React DOM 사용)
  - 예상 시간: 30분

### C 단계 — Platform Adapter (DOM 모킹)

- [ ] **`TwitchAdapter`** ([src/platform/twitch.ts](../src/platform/twitch.ts))
  - `extract`: fixture HTML로 chat clone 만들고 ChatInfo 정규화 검증
  - `getCurrentChannelId`: `window.location.pathname` 모킹 (`vi.stubGlobal`)
  - `getPageMode`: 같음
  - `computeDragRatio`: 순수 수식, DOM rect 객체만 받음 — 가장 쉬움
  - `getBadgeImageUrl` / `getBadgeIdentity`: 순수
  - `prepareChatClone`: no-op
  - `fetchBadges`: API 호출 모킹 (axios mock 또는 `vi.fn()`로 createTwitchAPI 대체)
  - 예상 시간: 1-1.5시간

- [ ] **`ChzzkAdapter`** ([src/platform/chzzk.ts](../src/platform/chzzk.ts))
  - 위와 평행, `prepareChatClone`은 *시간 prepend* 동작이 있어 fixture로 검증 가치 있음
  - 예상 시간: 1시간

### D 단계 — Layout / 비-React 헬퍼

- [ ] **`applyPosition`/`applyRatio`** ([src/content-scripts/base/layout.ts](../src/content-scripts/base/layout.ts))
  - 3개 element ID 규약 + `style.order` / `style.height` 적용
  - happy-dom + DOM fixture
  - 0/10 ratio 특수값 검증
  - 예상 시간: 30분

- [ ] **`utils-common.ts` 헬퍼들**
  - `defaultAtomicFilter`, `atomicFiltersEqual`, `msToTime`, `generateRandomString` 등
  - 작은 함수 모음 — 케이스 1-2개씩
  - 예상 시간: 30분

### E 단계 (선택) — 런타임 통합

- [ ] **`useGlobalSettingExtension`** cross-entrypoint sync
  - storage.onChanged 모킹 (`browser` global stub)
  - "다른 entrypoint 변경 시 내 state도 갱신" invariant
  - "내 dispatch의 echo는 무한 루프 안 만든다" invariant
  - 예상 시간: 45분

- [ ] **`useFilterGroup`** filter cross-sync
  - 위와 평행
  - 예상 시간: 30분

## 컨벤션

- **파일 위치**: `<module>.test.ts` (또는 `.tsx`) — 테스트 대상 옆
- **describe 구성**: 모듈 → 기능 그룹 → it 단위 케이스
- **Fixture 빌더**: `chat()`, `atom()`, `composite()` 같은 이름의 헬퍼로 boilerplate 줄이기 (evaluate.test.ts 참조)
- **CONTEXT.md 어휘 사용**: it 설명에서 *atomic*, *composite*, *Filter Group*, *Channel Scope* 등 도메인 용어 그대로

## 메모

- `evaluate.ts`만 잡아도 *필터 매칭 invariant 18개 리그레션 자동 검증* — leverage 큼.
- B/C/D를 굳이 다 채울 필요는 없음. 기능 작업 중에 *진짜 회귀가 무서운 부분*부터 우선.
- happy-dom 환경 추가 시 vitest config에 `environment: 'happy-dom'` 추가하면 됨. node와 happy-dom을 파일별로 다르게 쓰려면 `// @vitest-environment happy-dom` 코멘트로 파일 레벨 override 가능.
