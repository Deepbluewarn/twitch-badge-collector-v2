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

## Flagged ambiguities

- File names `src/context/ArrayFilter.ts` and `src/components/filter/ArrayFilterComponents.tsx` still carry the legacy "Array" prefix even though their exports have been renamed (`FilterGroupContext`, `FilterTypeSelector`, etc.). Rename in a future small pass via `git mv`.

- A few local handler/variable names still reference "ArrayFilter": `onArrayFilterTypeChipClick` ([FilterTypeChip.tsx](src/components/chip/FilterTypeChip.tsx)), `onArrayFilterNoteChanged`/`onArrayFilterTypeChanged` (local handlers in `FilterInputForm.tsx`, `FilterInputFormList.tsx`), `_defaultArrayFilter` (local variable in `FilterDialog.tsx`). Internal-only, low priority.

- The `BroadcastChannel('ArrayFilter')` channel name in [Filter.tsx](src/components/Filter.tsx) is intentionally preserved for cross-tab compatibility with users running older extension versions.

- UI components still branch on `globalSetting.platform === 'twitch'` for brand colour, labels, and badge fetching APIs ([components/Filter.tsx](src/components/Filter.tsx), [components/filter/BadgeList.tsx](src/components/filter/BadgeList.tsx), [components/filter/FilterDialog.tsx](src/components/filter/FilterDialog.tsx), and several other filter components). The runtime layer is now Adapter-routed, but the UI layer is not. Future scope: extend **Platform Adapter** with UI-side concerns (badge fetching, brand colour, display name) so these components depend on the Adapter rather than a string discriminator.

- `evaluateFilterGroup` in [src/filter/evaluate.ts](src/filter/evaluate.ts) compares both `chat.channelLogin` and `chat.channelId` against `filter.channelLogin`/`filter.channelId` for badge atomic matches — this is Twitch-specific logic (sub/cheer badges scoped per channel). The data comparison itself is platform-neutral, so it stays inside the evaluator without an Adapter call, but the *fact that this matters* is Twitch-only.
