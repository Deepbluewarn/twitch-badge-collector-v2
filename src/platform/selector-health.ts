/**
 * 런타임 selector 건강 검사 (Layer 5).
 *
 * host page가 class hash를 롤링하면 required selector가 전부 0이 되고 채팅 수집이
 * 멈춘다. 지금까지 이건 *조용히* 일어났다 — 사용자는 "필터가 죽었다"만 알 수 있었고
 * OTA는 최대 1시간 stale 판정을 기다렸다. 여기서:
 *
 *  1. required selector 매칭 0 감지
 *  2. 결과를 host-selectors의 broken 레지스트리에 게시 → Adapter.extract가 ChatInfo
 *     .unavailable을 채워 필터 의미가 뒤집히지 않게 한다 (Layer 3)
 *  3. background에 즉시 OTA fetch 요청 (stale TTL 무시)
 *  4. Container가 배너를 띄울 수 있도록 window 이벤트 발화
 *
 * OTA로 새 manifest가 적용되어도 현재 페이지의 observer는 옛 selector로 attach된
 * 상태다. 그래서 배너는 "새로고침" 을 안내한다 — mid-session 갱신은 안 한다는
 * host-selectors의 기존 계약을 그대로 유지.
 */
import { PlatformAdapter } from './index';
import { getPlatformConfig, setBrokenSelectors } from './host-selectors';
import { splitSelectorBranches } from './selector-syntax';
import { CHAT_ATTR } from '@/interfaces/chat-attributes';
import { SettingInterface } from '@/interfaces/setting';

export const SELECTOR_HEALTH_EVENT = 'tbc-selector-health';
export const FORCE_OTA_MESSAGE_TYPE = 'tbc-force-ota-fetch';

/**
 * 판정 결과. `unknown`이 핵심 — "멀쩡함"과 "판단 근거가 없음"은 다르다.
 *
 * 채팅이 한 개도 없는 페이지에서는 displayName/messageText/badge가 자연히 0이다.
 * 시청자 적은 채널, 방금 시작한 방송, 느린 채팅 모두 그렇다. 그 상태를 broken으로
 * 판정하면 (1) 멀쩡한 사용자에게 빨간 배너가 뜨고 (2) broken 레지스트리를 통해
 * Adapter가 badge/keyword를 "모르는 값"으로 표시해 **필터가 실제로 멈춘다.**
 * 근거가 없을 때는 아무것도 하지 않는 게 맞다.
 */
export type HealthVerdict = 'ok' | 'broken' | 'unknown';

export interface SelectorHealth {
    verdict: HealthVerdict;
    /** verdict가 'broken'일 때만 채워진다. 그 외에는 항상 빈 배열. */
    broken: string[];
    /**
     * selector list 중 일부 branch만 죽은 것들. 전체 selector는 아직 매칭되므로
     * 기능은 정상 — 다음 롤링 전에 갈아둬야 한다는 조기 경보용.
     */
    degraded: Array<{ name: string; deadBranches: string[] }>;
    /** 판정 근거 — 이 페이지에서 확인된 채팅 노드 수. 0이면 판정 보류. */
    chatCount: number;
    checkedAt: number;
}

/**
 * 채팅이 있어야만 판정할 수 있는 selector. 채팅 0개인 페이지에서 이들이 0인 건
 * 정상이다. 반대로 chatRoom* 은 채팅 유무와 무관하게 존재해야 하므로 바로 판정 가능.
 */
const CHAT_DEPENDENT = new Set(['displayName', 'usernameContainer', 'messageText', 'badge']);

/**
 * 페이지 컨텍스트별 필수 selector 이름. 없으면 채팅 수집 자체가 안 된다.
 * diagnose.ts와 canary가 같은 목록을 참조해야 판정이 어긋나지 않으므로 여기 한 곳에 둔다.
 */
export function getRequiredSelectorNames(pageMode: string): Set<string> {
    const common = new Set(['displayName', 'messageText', 'usernameContainer', 'badge']);
    if (pageMode === 'live') common.add('chatRoomLive');
    else if (pageMode === 'video') common.add('chatRoomVod');
    return common;
}

function countSafe(selector: string): number {
    try {
        return document.querySelectorAll(selector).length;
    } catch {
        return -1; // invalid selector — 0과 구별해서 로그에 남김
    }
}

/**
 * 한 번 검사하고 결과를 레지스트리에 게시한다. 이벤트/OTA 요청은 호출자(watch)가 담당.
 */
export function inspectSelectors(
    adapter: PlatformAdapter,
    platform: SettingInterface['platform'],
): SelectorHealth {
    const cfg = getPlatformConfig(platform);
    const required = getRequiredSelectorNames(adapter.getPageMode());

    // 판정 근거: inject.ts가 React props에서 읽어 박는 data 속성 개수.
    // CSS selector를 전혀 거치지 않으므로, 지금 검사하려는 selector들과 독립이다.
    // (selector가 깨졌는지 보려고 또 다른 selector에 의존하면 순환이 된다.)
    const chatCount = document.querySelectorAll(`[${CHAT_ATTR.KEY}]`).length;

    const broken: string[] = [];
    const degraded: SelectorHealth['degraded'] = [];

    for (const [name, value] of Object.entries(cfg.selectors)) {
        if (typeof value !== 'string') continue;

        // foldedClassSubstring처럼 selector가 아닌 값은 querySelectorAll 대상이 아님.
        if (name === 'foldedClassSubstring') continue;

        const total = countSafe(value);
        if (required.has(name) && total <= 0) {
            // 채팅이 없으면 채팅 의존 selector는 판정하지 않는다.
            if (!(CHAT_DEPENDENT.has(name) && chatCount === 0)) broken.push(name);
            continue;
        }

        // 전체는 살아있어도 branch 단위로 죽은 게 있으면 기록. 2개 이상일 때만 의미 있음.
        const branches = splitSelectorBranches(value);
        if (branches.length < 2) continue;
        const dead = branches.filter(b => countSafe(b) <= 0);
        if (dead.length > 0 && dead.length < branches.length) {
            degraded.push({ name, deadBranches: dead });
        }
    }

    // 채팅이 없어서 확인 못 한 채팅 의존 selector가 있으면 판정 보류.
    const unresolved = chatCount === 0
        && Array.from(required).some(n => CHAT_DEPENDENT.has(n));

    const verdict: HealthVerdict = broken.length > 0
        ? 'broken'
        : unresolved ? 'unknown' : 'ok';

    // 'unknown'에서는 레지스트리를 비운다 — 근거 없는 판정이 L3로 새어나가
    // 배지/키워드 필터를 멈추게 하는 걸 막는다.
    setBrokenSelectors(verdict === 'broken' ? broken : []);

    return { verdict, broken: verdict === 'broken' ? broken : [], degraded, chatCount, checkedAt: Date.now() };
}

/**
 * 검사를 반복하며 감시한다.
 *
 * 두 가지를 기다린다:
 *
 *  1. **판정 근거** — 채팅이 한 개도 없으면 채팅 의존 selector는 판정할 수 없다
 *     (verdict 'unknown'). 시청자 적은 채널은 몇 분간 채팅이 없을 수 있어서, 고정
 *     횟수로 끊지 않고 채팅이 나타날 때까지 기다린다.
 *  2. **연속 확인** — 한 번 broken이 나왔다고 바로 배너를 띄우지 않는다. host의
 *     리렌더 순간에 스친 상태일 수 있어서, 연속 2회 같은 결과일 때만 확정한다.
 *
 * 확정 전까지는 window 이벤트에 'unknown'/'ok'만 흘러가므로 배너는 뜨지 않는다.
 *
 * @returns cleanup 함수
 */
export function startSelectorHealthWatch(
    adapter: PlatformAdapter,
    platform: SettingInterface['platform'],
    opts?: {
        firstDelayMs?: number;
        retryDelayMs?: number;
        /** 판정 근거가 계속 없을 때 포기하기까지의 최대 시도 횟수 */
        maxChecks?: number;
        /** broken 확정에 필요한 연속 관측 횟수 */
        confirmCount?: number;
    },
): () => void {
    const firstDelayMs = opts?.firstDelayMs ?? 8000;
    const retryDelayMs = opts?.retryDelayMs ?? 15000;
    const maxChecks = opts?.maxChecks ?? 20;
    const confirmCount = opts?.confirmCount ?? 2;

    let checks = 0;
    let brokenStreak = 0;
    let timer: number | undefined;
    let cancelled = false;
    let otaRequested = false;

    const run = () => {
        if (cancelled) return;
        checks++;

        const health = inspectSelectors(adapter, platform);

        if (health.verdict === 'broken') brokenStreak++;
        else brokenStreak = 0;

        const confirmed = health.verdict === 'broken' && brokenStreak >= confirmCount;

        // 확정 전에는 broken을 감춘 채로 알린다 — 구독자(배너)가 스친 상태에 반응하지 않게.
        window.dispatchEvent(new CustomEvent<SelectorHealth>(SELECTOR_HEALTH_EVENT, {
            detail: confirmed ? health : { ...health, verdict: health.verdict === 'broken' ? 'unknown' : health.verdict, broken: [] },
        }));

        if (confirmed) {
            console.warn(
                `[selector-health] required selector 매칭 0 (연속 ${brokenStreak}회, 채팅 ${health.chatCount}개):`,
                health.broken.join(', '),
            );

            // OTA는 한 번만 요청 — 재시도마다 CDN 때리지 않는다.
            if (!otaRequested) {
                otaRequested = true;
                browser.runtime.sendMessage({ type: FORCE_OTA_MESSAGE_TYPE })
                    .catch(() => { /* SW 부재 등 — 무시 */ });
            }
        }
        if (health.degraded.length > 0) {
            console.warn('[selector-health] selector branch 일부 사망 (기능은 정상):',
                health.degraded.map(d => `${d.name}[${d.deadBranches.join(' | ')}]`).join(', '));
        }

        // 'ok'로 확정되면 더 볼 필요가 없다. 'unknown'은 근거를 기다리는 상태라 계속,
        // 'broken'도 회복(OTA 적용 후 SPA 이동 등)을 잡기 위해 계속 본다.
        if (health.verdict === 'ok') return;
        if (checks < maxChecks) timer = window.setTimeout(run, retryDelayMs);
    };

    timer = window.setTimeout(run, firstDelayMs);

    return () => {
        cancelled = true;
        if (timer !== undefined) window.clearTimeout(timer);
    };
}
