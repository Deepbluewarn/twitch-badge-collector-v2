/**
 * Selector 건강 검사 — host page에서 required selector가 하나도 안 잡히는지 본다.
 *
 * 용도는 하나다: **필터 의미가 뒤집히는 것을 막기 위한 판정 근거 제공.**
 *
 * 채팅 하나만 보면 "배지 없는 유저"와 "badge selector 깨짐"이 구별되지 않는다(둘 다 0).
 * 후자인데 구별을 못 하면 `chat.badges`가 빈 배열로 흘러가고, `exclude` atomic이 그걸
 * 부정해 true가 되어 "이 배지 제외" 필터가 전원 매칭으로 뒤집힌다. 페이지 전체에 채팅이
 * 있는데도 badge selector가 0건이면 후자로 확정할 수 있고, 그때 broken 레지스트리에
 * 올려 Adapter가 ChatInfo.unavailable을 채우게 한다 (src/filter/evaluate.ts 참고).
 *
 * 사용자에게 알리거나 복구를 앞당기는 기능은 **의도적으로 넣지 않았다.** 한때 배너 +
 * 즉시 OTA fetch까지 있었는데, (1) 채팅 필터가 잠깐 안 되는 건 긴급 상황이 아니고
 * (2) 확장이 알아서 띄우는 배너가 좁은 채팅창을 가리는 비용이 이득보다 크고
 * (3) 판정 오탐이 곧바로 사용자 필터를 꺼버리는 사고로 이어졌기 때문에 걷어냈다.
 * selector가 깨지면 평소 OTA 경로(SW wake + 1시간 TTL)로 복구된다.
 */
import { PlatformAdapter } from './index';
import { getPlatformConfig, setBrokenSelectors } from './host-selectors';
import { splitSelectorBranches } from './selector-syntax';
import { CHAT_ATTR } from '@/interfaces/chat-attributes';
import { SettingInterface } from '@/interfaces/setting';

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
 * 검사를 반복하며 broken 레지스트리를 갱신한다. 조용히 돈다 — UI도 네트워크 요청도 없다.
 *
 * 두 가지를 기다린다:
 *
 *  1. **판정 근거** — 채팅이 한 개도 없으면 채팅 의존 selector는 판정할 수 없다
 *     (verdict 'unknown'). 시청자 적은 채널은 몇 분간 채팅이 없을 수 있어서, 고정
 *     횟수로 끊지 않고 채팅이 나타날 때까지 기다린다.
 *  2. **연속 확인** — 한 번 broken이 나왔다고 바로 확정하지 않는다. host의 리렌더
 *     순간에 스친 상태일 수 있어서, 연속 2회 같은 결과일 때만 레지스트리에 올린다.
 *
 * 확정 전에는 레지스트리를 비워둔다 — 근거 없는 판정이 필터를 꺼버리는 게 가장 나쁜
 * 실패 모드다. 있는 필터를 잠시 못 고치는 것보다, 없는 문제로 필터를 끄는 쪽이 해롭다.
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

    const run = () => {
        if (cancelled) return;
        checks++;

        const health = inspectSelectors(adapter, platform);

        if (health.verdict === 'broken') brokenStreak++;
        else brokenStreak = 0;

        // 연속 confirmCount회 전에는 레지스트리에 올리지 않는다.
        if (health.verdict === 'broken' && brokenStreak < confirmCount) {
            setBrokenSelectors([]);
        } else if (health.verdict === 'broken') {
            console.warn(
                `[selector-health] required selector 매칭 0 (연속 ${brokenStreak}회, 채팅 ${health.chatCount}개):`,
                health.broken.join(', '),
            );
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
