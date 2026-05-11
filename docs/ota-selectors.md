# OTA — host selector hotfix

호스트(트위치/치지직)가 채팅창 class를 바꾸면 확장이 깨짐. 이 시스템으로 **코드 재배포 없이 selector만 JSON으로 push**해서 hotfix.

## 어떻게 동작하나

- 번들된 fallback: `src/platform/bundled-selectors.json` (확장에 포함).
- 사용자측 SW가 깰 때마다 `fetchIfStale()` → jsDelivr CDN에서 같은 파일을 받음:
  - `https://cdn.jsdelivr.net/gh/Deepbluewarn/twitch-badge-collector-v2@main/src/platform/bundled-selectors.json`
- 받은 manifest는 `browser.storage.local`에 저장. content-script는 `manifestReady` 후 init.
- 6시간 stale 판정 + `rev` 비교. 활성 사용자는 SW wake가 잦아 ~수 시간 내 갱신.

## 평소 사용법 (selector 한 줄 갱신)

1. DevTools로 새 selector 확인.
2. `src/platform/bundled-selectors.json` 수정 (예: `chzzk.selectors.chatRoomLive`).
3. **`rev` 값 +1** (필수, strict monotonic — 같거나 작으면 사용자측 `setManifest`가 reject).
4. `main` 브랜치에 커밋 + 푸시.
5. jsDelivr 캐시 갱신 대기 (수 분 ~ 12시간) — 긴급 시 수동 purge:
   ```
   https://purge.jsdelivr.net/gh/Deepbluewarn/twitch-badge-collector-v2@main/src/platform/bundled-selectors.json
   ```
6. 사용자 측: 다음 SW wake 때 자동 갱신.

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
