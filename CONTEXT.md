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
`ChatInfo.unavailable`에 실어 보낸다.

`evaluateFilterGroup`은 이 값을 **한 가지 경우에만** 쓴다 — 해당 Category에 `exclude`
atomic이 걸린 composite를 평가에서 제외한다. 값을 모르면 atomic이 false가 되는데,
`exclude`가 그걸 뒤집어 true로 만들어서 "이 배지 없는 사람" 같은 조건이 전원 매칭으로
변하기 때문이다.

**`include` atomic은 막지 않는다.** 값을 모르면 매칭이 안 될 뿐이고 그건 정직한 결과다.
composite를 통째로 건너뛰면 판정이 틀렸을 때 멀쩡히 동작하던 필터까지 같이 꺼진다 —
사용자에게 아무 이득 없이 기능만 잃는 실패다.

현재 **`ChzzkAdapter`가 `name`에 대해서만** 채운다 (작성자 없는 채팅은 없으므로 채팅
단위로 바로 확정 가능). `badge`는 출처를 둘로 둬서(React props 유래 data 속성 + selector)
selector가 깨져도 동작하므로 판정이 필요 없고, `keyword`는 판정할 독립 근거가 없어
다루지 않는다. `TwitchAdapter`는 채우지 않는다.
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
- **Selector 건강 검사**: [src/platform/selector-health.ts](src/platform/selector-health.ts) — `inspectSelectors`. **진단 리포트 전용**이고 런타임 동작에는 영향을 주지 않는다. 판정은 3상태(`ok`/`broken`/`unknown`)이며, 채팅이 0개면 채팅 의존 selector는 판정하지 않는다 — 리포트를 읽는 사람이 "멀쩡함"과 "판단 근거 없음"을 구별해야 오진하지 않는다.
  - 한때 이 판정으로 필터를 끄고 배너까지 띄웠으나 전부 걷어냈다. "badge selector 0건"은 배지 단 사람이 아무도 없을 때도 성립해서, 그 오탐이 멀쩡한 사용자의 배지 필터를 통째로 껐다. 감지해서 끄는 것보다 **깨져도 동작하게** 만드는 쪽이 맞다 (배지 이중 출처).
- **Selector 문법 헬퍼**: [src/platform/selector-syntax.ts](src/platform/selector-syntax.ts) — `splitSelectorBranches` / `extractClassHashes`. 의존성 0이라 확장 런타임과 canary 스크립트가 공유. rev 14부터 fragile selector는 콤마 selector list로 이중화되어 있고, branch 하나가 죽어도 전체는 매칭되므로 branch 단위로 쪼개 봐야 조기 감지가 된다.
- **Chat attribute contract**: [src/interfaces/chat-attributes.ts](src/interfaces/chat-attributes.ts) — `CHAT_ATTR` 상수 객체와 `PROCESSED_CHAT_CLASS`. inject 스크립트가 host page 채팅 노드에 박는 `data-tbc-chat-*` 속성과, useChatStream의 *처리됨* 마킹 클래스를 한 곳에 명시. inject ↔ Adapter.extract / useChatStream가 모두 이 상수를 참조해 컴파일 타임 sync.
- **GlobalSetting cross-entrypoint sync**: [src/hooks/useGlobalSettingExtension.ts](src/hooks/useGlobalSettingExtension.ts) — `browser.storage.local`이 source of truth. 4개 entrypoint(popup/setting/welcome/Container)가 각자 hook을 호출하지만 `storage.onChanged` 리스너로 다른 entrypoint의 변경을 자기 state에 자동 반영. 자기 변경의 echo는 비교 후 no-op이라 루프 없음.
- **번역 (두 체계 공존)**: surface에 따라 다른 걸 쓴다 — 섞으면 화면에 번역 키가 그대로 찍힌다.
  - `browser.i18n.getMessage` + [public/_locales/](public/_locales/) — **popup, content script, Container**. 브라우저가 항상 먼저 준비하고 ko/en/ru를 커버한다. 치환이 필요한 메시지는 `placeholders`를 선언할 것 (`$1` 위치 치환만으로는 브라우저별 동작 보장 안 됨).
  - `useTranslation` + [src/translate/](src/translate/) — **설정 페이지 entrypoint 전용**. `@/translate/i18n` import가 [src/entrypoints/setting/main.tsx](src/entrypoints/setting/main.tsx)에만 있어서, 다른 entrypoint에서 `useTranslation`을 쓰면 init이 안 된 상태로 키 문자열이 노출된다.
  - 남은 함정: [useFilterGroup](src/hooks/useFilterGroup.ts)이 `t()`로 alert 메시지를 만드는데 Container 트리에도 들어 있다. Container는 `checkFilter`만 써서 그 경로에 도달하지 않아 현재는 문제가 없지만, Container에서 filter 추가/검증 경로를 쓰게 되면 키가 노출된다. Container에 i18next를 init하면 content script 번들이 ~57KB 늘어나므로(실측), 그때는 해당 메시지를 `_locales`로 옮기는 쪽이 낫다.

## Flagged ambiguities

- API client classes live as plain factories at [src/api/](src/api/) — `createTwitchAPI()` / `createChzzkAPI()`. Consumers call the factory directly (`useChannelInfo` via `useMemo`, Adapter at construction). No more legacy hook/Context layering.
