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
import { SettingInterface } from '@/interfaces/setting';

export const SELECTOR_HEALTH_EVENT = 'tbc-selector-health';
export const FORCE_OTA_MESSAGE_TYPE = 'tbc-force-ota-fetch';

export interface SelectorHealth {
    /** required인데 매칭 0인 selector 이름 */
    broken: string[];
    /**
     * selector list 중 일부 branch만 죽은 것들. 전체 selector는 아직 매칭되므로
     * 기능은 정상 — 다음 롤링 전에 갈아둬야 한다는 조기 경보용.
     */
    degraded: Array<{ name: string; deadBranches: string[] }>;
    checkedAt: number;
}

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

    const broken: string[] = [];
    const degraded: SelectorHealth['degraded'] = [];

    for (const [name, value] of Object.entries(cfg.selectors)) {
        if (typeof value !== 'string') continue;

        // foldedClassSubstring처럼 selector가 아닌 값은 querySelectorAll 대상이 아님.
        if (name === 'foldedClassSubstring') continue;

        const total = countSafe(value);
        if (required.has(name) && total <= 0) {
            broken.push(name);
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

    setBrokenSelectors(broken);
    return { broken, degraded, checkedAt: Date.now() };
}

/**
 * 검사를 여러 번 재시도하며 감시한다.
 *
 * 첫 검사를 늦추는 이유: 채팅 목록은 페이지 로드 직후 비어 있어서 messageText/badge가
 * 자연히 0이다. 그 시점 판정은 전부 false positive다. chzzk 라이브는 보통 수 초 내에
 * 채팅이 붙으므로 지연 후 검사하고, 회복 가능성을 고려해 몇 차례 재확인한다.
 *
 * @returns cleanup 함수
 */
export function startSelectorHealthWatch(
    adapter: PlatformAdapter,
    platform: SettingInterface['platform'],
    opts?: { firstDelayMs?: number; retryDelayMs?: number; maxChecks?: number },
): () => void {
    const firstDelayMs = opts?.firstDelayMs ?? 8000;
    const retryDelayMs = opts?.retryDelayMs ?? 15000;
    const maxChecks = opts?.maxChecks ?? 3;

    let checks = 0;
    let timer: number | undefined;
    let cancelled = false;
    let otaRequested = false;

    const run = () => {
        if (cancelled) return;
        checks++;

        const health = inspectSelectors(adapter, platform);

        window.dispatchEvent(new CustomEvent<SelectorHealth>(SELECTOR_HEALTH_EVENT, { detail: health }));

        if (health.broken.length > 0) {
            console.warn('[selector-health] required selector 매칭 0:', health.broken.join(', '));

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

        // 깨진 게 없어도 재확인 — 뒤늦게 로드되는 요소(도네 등)로 상태가 바뀔 수 있고,
        // broken이 있으면 회복(OTA 적용 후 SPA 이동 등) 가능성 때문에 계속 본다.
        if (checks < maxChecks) {
            timer = window.setTimeout(run, retryDelayMs);
        }
    };

    timer = window.setTimeout(run, firstDelayMs);

    return () => {
        cancelled = true;
        if (timer !== undefined) window.clearTimeout(timer);
    };
}
