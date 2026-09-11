/**
 * Selector 건강 검사 — 진단 리포트 전용.
 *
 * required selector가 이 페이지에서 하나도 안 잡히는지 세어, 사용자가 popup에서 뜨는
 * 진단 리포트에 판정을 담는다. **런타임 동작에는 영향을 주지 않는다** — 필터를 끄거나
 * UI를 띄우거나 네트워크를 때리지 않는다.
 *
 * 한때 이 판정으로 ChatInfo.unavailable을 채우고 배너까지 띄웠는데 전부 걷어냈다:
 *  - 배너/즉시 OTA — 채팅 필터가 잠깐 안 되는 건 긴급 상황이 아니고, 확장이 알아서
 *    띄우는 알림이 좁은 채팅창을 가리는 비용이 이득보다 컸다.
 *  - 필터 차단 — "배지 selector가 0건"은 배지 단 사람이 아무도 없을 때도 성립한다.
 *    그 오탐이 멀쩡한 사용자의 배지 필터를 통째로 꺼버렸다. 지금은 배지를 React props와
 *    selector 두 출처에서 읽으므로(ChzzkAdapter.extract) 애초에 판정할 필요가 없다.
 *
 * 남은 규칙: 채팅이 0개면 채팅 의존 selector는 판정하지 않는다('unknown'). "멀쩡함"과
 * "판단 근거 없음"은 다르고, 리포트를 읽는 사람이 그걸 구별해야 오진하지 않는다.
 */
import { PlatformAdapter } from './index';
import { getPlatformConfig } from './host-selectors';
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

    return { verdict, broken: verdict === 'broken' ? broken : [], degraded, chatCount, checkedAt: Date.now() };
}
