# OTA — host selector hotfix

호스트(트위치/치지직)가 채팅창 class를 바꾸면 확장이 깨짐. 이 시스템으로 **코드 재배포 없이 selector만 JSON으로 push**해서 hotfix.

## 어떻게 동작하나

**v2.18.16+ 빌드 (신):**
- 번들 fallback: `src/platform/bundled-selectors.prod.json` (확장에 포함, build-time).
- OTA target: `https://cdn.jsdelivr.net/gh/Deepbluewarn/twitch-badge-collector-v2@master/src/platform/bundled-selectors.prod.json`
- → master의 `bundled-selectors.json`은 dev 작업 공간(자유 편집). 신 사용자 영향 X.

**v2.18.15 이전 빌드 (구):**
- 번들 fallback + OTA target = `bundled-selectors.json` (단일 파일).
- 옛 코드가 박힌 URL이라 변경 불가. master `bundled-selectors.json` 푸시 = 옛 사용자에게 즉시 배포됨. **신중히.**

**공통:**
- 사용자측 SW가 깰 때마다 `fetchIfStale()` → jsDelivr CDN에서 fetch.
- 받은 manifest는 `browser.storage.local`에 저장. content-script는 `manifestReady` 후 init.
- 6시간 stale 판정 + `rev` 비교. 활성 사용자는 SW wake가 잦아 ~수 시간 내 갱신.

## 평소 사용법 (selector 한 줄 갱신)

### 신 빌드 사용자 (v2.18.16+) 대상

1. DevTools로 새 selector 확인.
2. (선택) `src/platform/bundled-selectors.json`에서 먼저 실험 — dev 빌드는 이걸 안 봄.
   하지만 옛 사용자에겐 즉시 전파됨 (구 빌드 OTA target이라). 신중히.
3. 검증되면 같은 변경을 `src/platform/bundled-selectors.prod.json`에 적용.
4. **`rev` 값 +1** (필수, strict monotonic).
5. master에 커밋 + 푸시.
6. jsDelivr 캐시 갱신 대기 (수 분 ~ 12시간) — 긴급 시 수동 purge:
   ```
   https://purge.jsdelivr.net/gh/Deepbluewarn/twitch-badge-collector-v2@master/src/platform/bundled-selectors.prod.json
   ```
7. 사용자 측: 다음 SW wake 때 자동 갱신.

### 구 빌드 사용자 (v2.18.15 이하) 대상

`bundled-selectors.json` (확장자 .prod 없음) 수정 + 같은 절차. 두 파일 다 동기화 유지 권장
(옛 사용자 + 신 사용자 모두 같은 selector 받도록).

옛 사용자 비율이 충분히 낮아지면 `bundled-selectors.json`을 dev playground로 전환 가능
— 그땐 자유 편집해도 사용자 영향 X.

## selector 작성 원칙 (rev 14+)

### class hash에 의존하지 말 것

chzzk는 CSS-module hash를 빌드마다 재생성한다. `_container_` 하나만 봐도
`o04z9` → `zw6kq` → `1mc5x` 로 세 번 롤링했고, 매번 확장이 통째로 죽었다.

**hash 대신 구조/동작 앵커를 쓴다:**

| 앵커 종류 | 예 | 안정성 |
|---|---|---|
| aria/role 등 동작 유래 속성 | `button[aria-haspopup="true"]` | 높음 — 기능이 바뀌지 않으면 유지 |
| CSS-module의 *로컬 이름* 부분 매칭 | `[class*="_nickname_"]` | 중간 — hash만 빠지므로 롤링에 면역 |
| 태그 + 구조 | `p[class*="_text_"]` | 중간 |
| hash 전체 | `[class*="_container_1mc5x_"]` | **낮음 — 신규 사용 금지** |

### 콤마 selector list로 이중화

`querySelectorAll("A, B")`는 이미 OR이다. **성격이 다른 두 앵커**를 콤마로 이어붙이면
코드 변경 없이 이중화된다:

```json
"displayName": "button[aria-haspopup=\"true\"] [class*=\"_text_\"], [class*=\"_nickname_\"] [class*=\"_text_\"]"
```

주의사항:
- `extract`는 `querySelector`(첫 매치)를 쓴다. 두 branch가 **같은 노드**를 가리켜야 안전하다.
  다른 노드를 가리키면 문서 순서에 따라 결과가 달라진다.
- 같은 축의 변형을 나열하는 건 이중화가 아니다. 둘 다 같은 명명 규칙에 의존하면 함께 죽는다.
- 도네이션 채팅은 일반 채팅과 구조가 다르다 (버튼 class가 `_profile_button_`, 본문이 `<p>`,
  닉네임에 `_ellipsis_` 래퍼 없음). 두 케이스 모두 검증해야 한다.
- 배지 selector에는 `:has(> img)`를 붙인다. selector를 넓히면 `<img>` 없는 노드를 잡을
  수 있고, `extract`가 그 안의 img에 접근하기 때문이다.

### branch 사망은 조용하다 — canary가 본다

이중화의 대가로 한쪽 branch가 죽어도 전체는 계속 매칭되어 아무 알림이 없다. canary는
`branchCounts`로 branch별 매칭을 따로 세고, "전체는 살아있지만 branch 하나 사망"이면
알림을 보낸다. 이 알림을 받으면 **남은 branch까지 깨지기 전에** 죽은 branch를 교체한다.
사용자 진단 리포트에도 `branchCounts` / `health.degraded`로 같은 정보가 실린다.

## 사고 대응 자동화

| 계층 | 무엇 | 어디 |
|---|---|---|
| 감지 | 6시간마다 라이브 채널 다수 방문, required selector 검증 | `.github/workflows/canary.yml` |
| 후보 도출 | 깨진 selector의 hash 치환 후보를 **라이브 DOM에서 직접 검증** (cardinality 채점) | `scripts/canary/visit-channel.ts` |
| 자동 수정 | 검증 통과 후보가 유일하면 rev bump + draft PR (prod/legacy 두 manifest 동시) | `scripts/canary/open-fix-pr.mjs` |
| 추적 | 자동 수정 못 하면 GitHub Issue 생성 (열린 이슈 있으면 코멘트) | `scripts/canary/open-alert-issue.mjs` |
| 부분 수집 | required selector 0을 페이지 단위로 판정 → 못 뽑은 필드만 `unavailable` 표시 → 해당 필드 쓰는 필터만 제외 | `src/platform/selector-health.ts`, `src/platform/{chzzk,twitch}.ts`, `src/filter/evaluate.ts` |
| 사용자측 자가복구 | 채팅창 앵커를 10초간 못 찾으면 세션당 1회 강제 OTA fetch. 그 외에는 평소 경로(SW wake + 1h TTL) | `src/utils/utils-common.ts` (`findElement`) |

**사용자 알림은 하지 않는다.** 배너 + 즉시 OTA fetch를 만들어봤다가 걷어냈다 — 채팅 필터가 잠깐 안 되는 건 긴급 상황이 아니고, 확장이 알아서 띄우는 알림이 좁은 채팅창을 가리는 비용이 이득보다 크다. 결정적으로 "required selector 0 = 깨짐" 판정에 오탐이 있어(채팅이 아직 없는 조용한 채널) 멀쩡한 사용자의 필터를 확장이 스스로 꺼버리는 사고가 났다. 감지 자체는 남겨두되 그 결과는 필터 안전(`unavailable`)에만 쓴다.

## 주의사항

### rev는 strictly monotonic
1, 2, 3... 순차 증가. 줄이거나 그대로면 갱신 안 됨. 충돌나면 더 올려.

### schemaVersion bump = OTA 깨짐
- 현재 `schemaVersion: 1`. JSON 구조 자체 바꿀 때만 bump.
- 옛 버전 extension은 schemaVersion mismatch → reject → bundled fallback 사용 → **그 사용자는 OTA 못 받음**. 결국 새 버전 release 동반해야 함.
- **최대한 피해**. 필드 추가는 optional로, 기존 필드 의미는 보존.

### 비활성 사용자는 갱신 늦음
- `alarms` permission 없음 → SW wake 이벤트(navigation, message 등)에 의존.
- 며칠~몇 주 stale 가능. 진짜 긴급한 selector 깨짐은 새 버전 release가 더 빠를 수도.

### selector 문법만 가능
JSON에 들어가는 건 CSS selector string / regex / react props path 등 **데이터**. 로직 변경(`if/else`, 새 분기)은 OTA로 못 함 — 코드 배포 필수.

### validation 한정적
현재 `host-selectors.ts:setManifest`가 `chatRoomLive` 존재 여부 정도만 체크. 잘못된 selector 푸시해도 stage에서 잡히지 않음. **로컬에서 동작 확인 후 푸시**.

## 디버깅

사용자측 콘솔 (`background.ts` / `host-selectors.ts` / `ota-fetch.ts`):

```
[OTA] ...
```

현재 적용된 manifest 확인:

```js
browser.storage.local.get('selectorsManifest').then(console.log)
```

bundled fallback 확인:

```js
fetch(browser.runtime.getURL('platform/bundled-selectors.json')).then(r => r.json()).then(console.log)
```

## 실전 시나리오

### A. 치지직 채팅창 class 바뀜
1. 새 class를 DevTools에서 확인.
2. `chzzk.selectors.chatRoomLive` 갱신 + `rev` +1.
3. 푸시 → 사용자 ~수 시간 내 자동 복구.

### B. 새 optional 필드 추가
- `schemaVersion` 그대로, `rev`만 bump.
- 옛 extension은 필드 무시 → 동작 그대로. 신규 코드는 새 필드 활용.

### C. 구조 변경 (예: selector path 자체 리네임)
- `schemaVersion` bump 강제 → OTA 흐름 단절.
- 새 버전 release 동반. 둘을 같은 PR로 묶고, 새 release publish 후 schemaVersion 푸시.

## 관련 파일

- `src/platform/bundled-selectors.json` — 진실 원천. 번들 + OTA fetch 대상.
- `src/platform/host-selectors.ts` — 스키마 + `getPlatformConfig` / `manifestReady` / `setManifest`.
- `src/platform/ota-fetch.ts` — jsDelivr fetch + stale 판정.
- `src/entrypoints/background.ts` — `onInstalled` / `onStartup` / SW wake 시 `fetchIfStale` 호출.
