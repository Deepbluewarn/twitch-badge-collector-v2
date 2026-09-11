# Badge Collector

A browser extension that injects a secondary chat panel into Twitch and Chzzk (Naver) live/VOD pages. The panel collects messages from the host page's native chat that match user-defined rules, letting viewers track specific chatters or topics without scrolling the firehose.

## Language

### Core artifacts

**Container**:
The secondary chat panel injected into the host page, alongside the native chat. Messages flow into it from the host's chat stream once they pass the user's filters.
_Avoid_: wrapper, list-container, chat area, mini, panel.

**Host page**:
The Twitch or Chzzk page the extension attaches to. The user interacts with both the host's native chat and the **Container** simultaneously.
_Avoid_: target site, page.

**Platform**:
Either `twitch` or `chzzk`. Determines which DOM contracts, badge formats, and inject scripts apply.
_Avoid_: site, service, provider.

**Platform Adapter**:
A runtime carrier of all Platform-specific behaviour — chat extraction, current-channel detection, page-mode detection, drag-ratio math. Each Host page has exactly one Adapter (`TwitchAdapter` or `ChzzkAdapter`) implementing the `PlatformAdapter` interface in [src/platform/](src/platform/). Consumers (Container, Handle, Local view, Filter Group evaluator caller) depend on the Interface, not the concrete Platform.
_Avoid_: platform helper, platform utils.

### Filter system

The filter system is a **fixed two-level tree** that decides which chat messages from the **Host page** flow into the **Container**.

**Filter Group**:
The user's complete filter configuration; an ordered list of composite **Filter Elements**.
_Avoid_: filter list, filter set, top-level filter.

**Filter Element**:
A node in the filter tree. Top-level Filter Elements (members of a **Filter Group**) are always *composite* — they hold a **Channel Scope**, a **Filter Type**, and a nested **Filter**. Nested Filter Elements (members of a **Filter**) are always *atomic* — a primitive match (**Filter Category** + value + Filter Type).
_Avoid_: rule, condition, sub-filter.

**Filter**:
A conjunction of atomic Filter Elements wrapped inside a composite Filter Element. *All* atomic elements must match for the composite element to fire.
_Avoid_: inner filter, sub-rule.

**Filter Type**:
The same enum (`include`/`exclude`/`sleep`) plays two roles depending on whether it sits on a *composite* Filter Element or an *atomic* one. Both encodings are intentional and produce a consistent user-facing model.

| Value | On a composite Filter Element (terminal action) | On an atomic Filter Element (boolean modifier) |
|---|---|---|
| `include` | Admit the chat; keep evaluating later composites in case one overrides | Identity — take the primitive match as-is |
| `exclude` | Drop the chat immediately and short-circuit the rest of the **Filter Group** | NOT — negate the primitive match (used to express "absence of …") |
| `sleep` | Skip this composite — it has no effect on the verdict | The atomic always evaluates false, which collapses its parent composite to *no effect on the verdict* (same observable outcome as a composite-level `sleep`) |

The atomic-level `exclude` is what lets a single composite express both presence and absence — e.g. `(NOT has 스트리머-badge) AND (has 매니저-badge)` is one composite with two atomics, the first set to `exclude`, the second to `include`.

**확정되지 않은 필드 (unavailable)**:
Host page 구조가 바뀌어 **Platform Adapter**가 어떤 필드를 못 뽑았을 때, 그 사실을
`ChatInfo.unavailable`에 실어 보낸다. "값이 빈 문자열"과 "값을 모른다"는 다른 상태다.

현재 **`ChzzkAdapter`만** 이걸 채운다. `TwitchAdapter`는 예전처럼 이름을 못 뽑으면
채팅을 버린다 — 트위치에서 조기 반환 조건을 느슨하게 하면 이름 없이 본문만 있는
노드(구독 알림, 레이드 공지 등 시스템 메시지)가 새로 통과하는데, 그 영향을 라이브
트위치에서 확인하지 않았기 때문이다. `evaluateFilterGroup`의 처리는 플랫폼 무관이므로
트위치에서는 해당 분기가 실행되지 않을 뿐이다.

`evaluateFilterGroup`은 unavailable에 실린 **Filter Category**를 참조하는 composite
**Filter Element**를 평가에서 **완전히 제외**한다 (composite 레벨 `sleep`과 같은 관측 결과).
atomic 레벨에서 false로 떨구면 안 된다 — atomic `exclude`가 그 false를 부정해 true가 되고,
"이 사람 제외" 같은 조건이 전원 매칭으로 뒤집힌다.

판정 기준:
- `name` — 작성자 없는 채팅은 없으므로 채팅 단위 부재로 바로 확정.
- `badge` / `keyword` — 배지 없는 채팅, 이모티콘만 있는 채팅이 정상 존재하므로 채팅 단위
  부재로는 판정 불가. `selector-health`의 **페이지 단위** 판정(required selector가 페이지
  전체에서 0건)에만 의존한다.

이 설계의 목적은 selector 하나가 깨졌을 때 채팅 수집이 100%가 아니라 부분만 손실되게
하는 것이다. 2026-09-10 chzzk가 username class hash를 롤링했을 때(`_container_zw6kq_` →
`_container_1mc5x_`) `displayName` 하나 때문에 모든 채팅이 필터 평가 전에 폐기됐다.
_Avoid_: missing, empty, null 필드.

**Filter Category**:
Which chat property an atomic Filter Element checks. One of `badge`, `name`, `keyword`.

**Channel Scope**:
An optional restriction on a composite Filter Element making it fire only when the chat originates from a specific channel (Twitch `channelLogin` / `channelId`, Chzzk `channelId`). Unscoped composites apply across all channels.

## Relationships

- A **Host page** has exactly one **Container** injected by the extension.
- A **Container** is bound to exactly one **Platform**.
- A **Filter Group** contains zero or more composite **Filter Elements** (evaluated in order).
- A composite **Filter Element** wraps exactly one **Filter**.
- A **Filter** contains one or more atomic **Filter Elements** joined by AND.
- The filter tree is fixed at depth 1 — atomic Filter Elements never wrap another Filter.

## Example dialogue

> **Dev:** "If a user creates a Filter Group with two composite Filter Elements — one `include` for `badge:subscriber` on channel `cohh`, and one `exclude` for `keyword:spam` — and a chat comes in matching both, what ends up in the Container?"
>
> **Domain expert:** "An `exclude` Filter Element short-circuits the Filter Group as soon as its inner Filter matches — the chat is dropped. An `include` only sets the admit verdict but keeps evaluating in case a later `exclude` overrides it. So in this case the spam keyword wins: the chat is dropped from the Container regardless of the subscriber badge."

## Domain modules

- **Filter Group evaluation**: [src/filter/evaluate.ts](src/filter/evaluate.ts) — `evaluateFilterGroup(chat, filterGroup, channelId?) → boolean`. Pure function, no React/DOM. Called from `useArrayFilter` via a thin wrapper.
- **Filter validation**: [src/filter/validate.ts](src/filter/validate.ts) — `validateFilterList(filter)` returns `{valid:true}` or `{valid:false, error: FilterValidationError}` (error code, not localized string).
- **Container layout**: [src/content-scripts/base/layout.ts](src/content-scripts/base/layout.ts) — `applyPosition`, `applyRatio`. Owns the 3 element ID convention, `order`/`height` rules.
- **Platform adapters**: [src/platform/](src/platform/) — `PlatformAdapter` interface + `TwitchAdapter`/`ChzzkAdapter` impls. Each carries `extract`, `getCurrentChannelId`, `getPageMode`, `computeDragRatio`.
- **Selector 건강 검사**: [src/platform/selector-health.ts](src/platform/selector-health.ts) — `inspectSelectors` / `startSelectorHealthWatch`. required selector 매칭 0을 감지해 host-selectors의 broken 레지스트리에 게시하고, Adapter가 그걸 읽어 `unavailable`을 채운다. **용도는 이것 하나** — 필터 의미가 뒤집히는 것을 막는 판정 근거. UI도 네트워크 요청도 없다. Container mount 여부와 무관해야 하므로 React 밖 content-script bootstrap에서 시작한다.
  - 사용자 알림(배너)과 즉시 OTA fetch는 **의도적으로 넣지 않았다.** 채팅 필터가 잠깐 안 되는 건 긴급 상황이 아니고, 확장이 알아서 띄우는 배너가 좁은 채팅창을 가리는 비용이 이득보다 크며, 판정 오탐이 곧바로 사용자 필터를 꺼버리는 사고로 이어졌다. selector가 깨지면 평소 OTA 경로(SW wake + 1시간 TTL)로 복구된다.
  - 단, 채팅창 앵커(`chatRoomLive`) 자체를 못 찾는 최악의 경우는 [findElement](src/utils/utils-common.ts)가 10초 후 세션당 1회 `tbc-force-ota-fetch`를 보낸다 — 이건 이전부터 있던 경로다.
  - **판정은 3상태** (`ok` / `broken` / `unknown`). 채팅이 0개인 페이지에서는 `displayName`·`usernameContainer`·`messageText`·`badge`가 자연히 0이므로 판정을 보류한다(`unknown`). 시청자 적은 채널이나 방금 시작한 방송을 `broken`으로 보면 멀쩡한 사용자에게 배너가 뜨고, 더 나쁘게는 broken 레지스트리를 통해 `badge`/`keyword`가 `unavailable`로 표시돼 **필터가 실제로 멈춘다.** `unknown`에서는 레지스트리를 비운다.
  - 판정 근거는 `[data-tbc-chat-key]` 개수 — inject가 React props에서 읽어 박는 값이라 검사 대상 selector와 독립이다 (selector 상태를 다른 selector로 판정하면 순환).
  - `broken`은 **연속 2회** 관측해야 확정된다. host 리렌더 순간에 스친 상태로 배너를 띄우지 않기 위함.
- **Selector 문법 헬퍼**: [src/platform/selector-syntax.ts](src/platform/selector-syntax.ts) — `splitSelectorBranches` / `extractClassHashes`. 의존성 0이라 확장 런타임과 canary 스크립트가 공유. rev 14부터 fragile selector는 콤마 selector list로 이중화되어 있고, branch 하나가 죽어도 전체는 매칭되므로 branch 단위로 쪼개 봐야 조기 감지가 된다.
- **Chat attribute contract**: [src/interfaces/chat-attributes.ts](src/interfaces/chat-attributes.ts) — `CHAT_ATTR` 상수 객체와 `PROCESSED_CHAT_CLASS`. inject 스크립트가 host page 채팅 노드에 박는 `data-tbc-chat-*` 속성과, useChatStream의 *처리됨* 마킹 클래스를 한 곳에 명시. inject ↔ Adapter.extract / useChatStream가 모두 이 상수를 참조해 컴파일 타임 sync.
- **GlobalSetting cross-entrypoint sync**: [src/hooks/useGlobalSettingExtension.ts](src/hooks/useGlobalSettingExtension.ts) — `browser.storage.local`이 source of truth. 4개 entrypoint(popup/setting/welcome/Container)가 각자 hook을 호출하지만 `storage.onChanged` 리스너로 다른 entrypoint의 변경을 자기 state에 자동 반영. 자기 변경의 echo는 비교 후 no-op이라 루프 없음.
- **번역 (두 체계 공존)**: surface에 따라 다른 걸 쓴다 — 섞으면 화면에 번역 키가 그대로 찍힌다.
  - `browser.i18n.getMessage` + [public/_locales/](public/_locales/) — **popup, content script, Container**. 브라우저가 항상 먼저 준비하고 ko/en/ru를 커버한다. 치환이 필요한 메시지는 `placeholders`를 선언할 것 (`$1` 위치 치환만으로는 브라우저별 동작 보장 안 됨).
  - `useTranslation` + [src/translate/](src/translate/) — **설정 페이지 entrypoint 전용**. `@/translate/i18n` import가 [src/entrypoints/setting/main.tsx](src/entrypoints/setting/main.tsx)에만 있어서, 다른 entrypoint에서 `useTranslation`을 쓰면 init이 안 된 상태로 키 문자열이 노출된다.
  - 남은 함정: [useFilterGroup](src/hooks/useFilterGroup.ts)이 `t()`로 alert 메시지를 만드는데 Container 트리에도 들어 있다. Container는 `checkFilter`만 써서 그 경로에 도달하지 않아 현재는 문제가 없지만, Container에서 filter 추가/검증 경로를 쓰게 되면 키가 노출된다. Container에 i18next를 init하면 content script 번들이 ~57KB 늘어나므로(실측), 그때는 해당 메시지를 `_locales`로 옮기는 쪽이 낫다.

## Flagged ambiguities

- API client classes live as plain factories at [src/api/](src/api/) — `createTwitchAPI()` / `createChzzkAPI()`. Consumers call the factory directly (`useChannelInfo` via `useMemo`, Adapter at construction). No more legacy hook/Context layering.
