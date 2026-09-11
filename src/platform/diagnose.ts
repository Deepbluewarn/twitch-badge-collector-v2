/**
 * Host DOM에 대한 selector 진단.
 *
 * 사용자가 popup에서 "진단" 클릭 → active tab의 content-script가 이 함수 호출 →
 * 각 selector 매칭 개수 + 샘플 chat outerHTML + adapter.extract 시도 결과를
 * 하나의 리포트로 뱉음. popup은 그걸 클립보드에 복사만 하고 사용자가 이슈에 붙임.
 *
 * chzzk/twitch host가 CSS-in-JS 클래스 해시 바꿀 때 어느 selector가 깨졌는지
 * 즉시 짚기 위한 툴. OTA push 전 rev bump 판단 근거.
 */
import { PlatformAdapter } from './index';
import { getPlatformConfig, getManifest } from './host-selectors';
import { getRequiredSelectorNames, inspectSelectors } from './selector-health';
import { splitSelectorBranches } from './selector-syntax';
import { SettingInterface } from '@/interfaces/setting';
import { CHAT_ATTR } from '@/interfaces/chat-attributes';

export interface DiagnoseSelectorResult {
    name: string;
    selector: string;
    count: number;
    error?: string;
    /**
     * 이 selector가 현재 페이지 컨텍스트에서 매칭되어야 하는지.
     * - true: count=0이면 진짜 문제 (예: 라이브 페이지의 chatRoomLive, displayName 등)
     * - false: count=0도 정상 (도네이션/인증마크/풀스크린 등 상황별)
     * "실패 N개" 요약은 required만 셈.
     */
    required: boolean;
    /**
     * selector list(콤마)의 branch별 매칭 수. branch가 2개 이상일 때만 채워진다.
     * 전체 count>0 이어도 여기 0인 branch가 있으면 그 branch는 이미 사망 — 남은
     * branch까지 깨지기 전에 교체해야 한다는 신호.
     */
    branchCounts?: Array<{ selector: string; count: number; error?: string }>;
}

export interface DiagnoseSample {
    source: 'inject-wrapper' | 'chatRoomLive' | 'none';
    outerHTML: string | null;
    extract: 'pass' | 'fail-undefined' | 'fail-throw' | 'no-sample';
    extractedNickname: string | null;
    extractedText: string | null;
    extractError: string | null;
    /** extract가 "값을 확정 못 함"으로 표시한 필드 — 부분 수집 상태 확인용. */
    unavailable: string[] | null;
}

export interface DiagnoseReport {
    timestamp: string;
    url: string;
    platform: SettingInterface['platform'];
    pageMode: string;
    manifest: {
        rev: number;
        schemaVersion: number;
        source: 'bundled' | 'ota';
        fetchedAt: string | null;
    };
    selectorResults: DiagnoseSelectorResult[];
    injectWrapper: {
        exists: boolean;
        chatCountInside: number;
        chatsWithKeyAttr: number;
    };
    /** samples[0]과 동일 — 기존 리포트 포맷 호환용. */
    sample: DiagnoseSample;
    /**
     * 샘플 여러 개. 하나만 뜨면 그 노드가 하필 전이 상태(삽입 직후/삭제 직전)일 때
     * 페이지 전체가 깨진 것처럼 보인다. 실제로 rev 13 사고 리포트에서 단일 샘플의
     * 텍스트가 비어 나와 오진을 유발했다 — 여러 개를 담아 그런 오독을 막는다.
     */
    samples: DiagnoseSample[];
    /** selector-health와 동일한 판정. */
    health: {
        /**
         * 'unknown'은 "멀쩡함"이 아니라 "판단 근거 없음" — 채팅이 0개인 페이지에서는
         * 채팅 의존 selector를 판정할 수 없다. 이 구분이 없으면 조용한 채널의 리포트를
         * 보고 selector가 깨진 것으로 오진한다.
         */
        verdict: 'ok' | 'broken' | 'unknown';
        broken: string[];
        degraded: Array<{ name: string; deadBranches: string[] }>;
        /** 판정 근거로 쓴 채팅 노드 수 */
        chatCount: number;
    };
    filters: {
        totalGroupCount: number;
        currentPlatformGroupCount: number;
        firstGroupSummary: string | null;
    };
    userAgent: string;
}

export async function runDiagnose(
    adapter: PlatformAdapter,
    platform: SettingInterface['platform'],
): Promise<DiagnoseReport> {
    const cfg = getPlatformConfig(platform);
    const manifest = getManifest();

    // 1) selector 전수 test
    const pageMode = adapter.getPageMode();
    const requiredNames = getRequiredSelectorNames(pageMode);
    const selectorResults: DiagnoseSelectorResult[] = [];
    for (const [name, value] of Object.entries(cfg.selectors)) {
        if (typeof value !== 'string') continue;
        const required = requiredNames.has(name);
        try {
            const count = document.querySelectorAll(value).length;
            // selector list(콤마)는 branch 하나만 살아도 전체가 매칭된다. 그래서 total만
            // 보면 "절반 죽은" 상태를 놓친다 — branch별로도 세서 다음 롤링 전에 갈아둘
            // 근거를 남긴다. branch가 1개면 total과 같으니 생략.
            const branches = splitSelectorBranches(value);
            const branchCounts = branches.length > 1
                ? branches.map(b => {
                    try { return { selector: b, count: document.querySelectorAll(b).length }; }
                    catch (e) { return { selector: b, count: 0, error: String(e) }; }
                })
                : undefined;
            selectorResults.push({ name, selector: value, count, required, branchCounts });
        } catch (e) {
            selectorResults.push({ name, selector: value, count: 0, error: String(e), required });
        }
    }

    // 1b) selector-health와 같은 판정으로 broken/degraded 요약.
    // 부수 효과로 broken 레지스트리가 갱신되어 아래 extract 시도가 Adapter의
    // 부분 수집 경로(unavailable 표시)를 실제 런타임과 같은 조건에서 타게 된다.
    const health = inspectSelectors(adapter, platform);

    // 2) inject.ts가 만드는 wrapper 상태
    const wrapperId = `tbc-${adapter.type}-chat-list-wrapper`;
    const wrapper = document.getElementById(wrapperId);
    const chatsInside = wrapper ? Array.from(wrapper.children) : [];
    const chatsWithKey = chatsInside.filter(el => el.getAttribute(CHAT_ATTR.KEY)).length;
    const injectWrapper = {
        exists: !!wrapper,
        chatCountInside: chatsInside.length,
        chatsWithKeyAttr: chatsWithKey,
    };

    // 3) 샘플 chat 여러 개 — 배지 있는 chat을 앞에 두고(badge selector 판별용) 최신 순.
    // (chzzk의 inject wrapper엔 list_bottom marker 등 non-chat 자식도 섞임.)
    const MAX_SAMPLES = 3;
    const allChats = wrapper ? Array.from(wrapper.querySelectorAll<HTMLElement>(`[${CHAT_ATTR.KEY}]`)) : [];
    const hasBadgeAttr = (el: HTMLElement) => {
        const raw = el.getAttribute(CHAT_ATTR.BADGES);
        return !!raw && raw !== '[]' && raw !== 'null';
    };
    // 배지 보유 chat 우선, 그 뒤 나머지. 둘 다 DOM 순서 유지.
    const ordered = [...allChats.filter(hasBadgeAttr), ...allChats.filter(el => !hasBadgeAttr(el))];

    let sampleEls: Array<{ el: HTMLElement; source: DiagnoseSample['source'] }> =
        ordered.slice(0, MAX_SAMPLES).map(el => ({ el, source: 'inject-wrapper' as const }));

    if (sampleEls.length === 0) {
        const chatRoom = document.querySelector(cfg.selectors.chatRoomLive);
        const children = chatRoom ? Array.from(chatRoom.children).slice(0, MAX_SAMPLES) : [];
        sampleEls = children.map(el => ({ el: el as HTMLElement, source: 'chatRoomLive' as const }));
    }

    // 4) adapter.extract 시도 — selector가 잘 나와도 extract 로직에서 nickname/text 못 뽑으면
    // 결국 chat 수집 안 됨. 샘플별로 pass/fail 판정.
    const emptySample: DiagnoseSample = {
        source: 'none',
        outerHTML: null,
        extract: 'no-sample',
        extractedNickname: null,
        extractedText: null,
        extractError: null,
        unavailable: null,
    };

    const samples: DiagnoseSample[] = sampleEls.map(({ el, source }) => {
        const out: DiagnoseSample = {
            source,
            outerHTML: el.outerHTML.slice(0, 3000),
            extract: 'no-sample',
            extractedNickname: null,
            extractedText: null,
            extractError: null,
            unavailable: null,
        };
        try {
            // extract가 wrapper 직속 child 여부 체크하므로, 필요 시 임시 wrapper attach.
            let target = el;
            if (el.parentElement?.id !== wrapperId) {
                const tmp = document.createElement('div');
                tmp.id = wrapperId;
                const cloned = el.cloneNode(true) as HTMLElement;
                tmp.appendChild(cloned);
                target = cloned;
            }
            const info = adapter.extract(target);
            if (info) {
                out.extract = 'pass';
                out.extractedNickname = info.nickName ?? null;
                out.extractedText = info.textContents.filter(Boolean).join(' ').trim() || null;
                out.unavailable = info.unavailable && info.unavailable.length > 0 ? [...info.unavailable] : null;
            } else {
                out.extract = 'fail-undefined';
            }
        } catch (e) {
            out.extract = 'fail-throw';
            out.extractError = String(e);
        }
        return out;
    });

    // 5) 필터 그룹 상태 — extract 되어도 predicate가 false면 채팅 수집 안 됨.
    // 사용자가 필터 세팅 안 했거나 platform 미스매치로 걸리는 케이스 판별용.
    let filters: DiagnoseReport['filters'] = {
        totalGroupCount: 0,
        currentPlatformGroupCount: 0,
        firstGroupSummary: null,
    };
    try {
        const stored = await browser.storage.local.get('filter');
        const groups = (stored.filter as Array<{ platform: string; filters: Array<{ category?: string; value?: string }> }> | undefined) ?? [];
        const forPlatform = groups.filter(g => g.platform === platform);
        filters = {
            totalGroupCount: groups.length,
            currentPlatformGroupCount: forPlatform.length,
            firstGroupSummary: forPlatform[0]
                ? forPlatform[0].filters.map(f => `${f.category ?? '?'}=${f.value ?? '?'}`).join(' & ')
                : null,
        };
    } catch { /* silent */ }

    // 6) OTA rev / fetchedAt (있으면)
    let source: 'bundled' | 'ota' = 'bundled';
    let fetchedAt: string | null = null;
    try {
        const stored = await browser.storage.local.get([
            'tbcv2-selectors-manifest',
            'tbcv2-selectors-fetched-at',
        ]);
        const otaManifest = stored['tbcv2-selectors-manifest'] as { rev?: number } | undefined;
        if (otaManifest?.rev === manifest.rev) source = 'ota';
        const fa = stored['tbcv2-selectors-fetched-at'] as number | undefined;
        if (fa) fetchedAt = new Date(fa).toISOString();
    } catch { /* storage 읽기 실패 = bundled로 간주 */ }

    return {
        timestamp: new Date().toISOString(),
        url: window.location.href,
        platform,
        pageMode: adapter.getPageMode(),
        manifest: {
            rev: manifest.rev,
            schemaVersion: manifest.schemaVersion,
            source,
            fetchedAt,
        },
        selectorResults,
        injectWrapper,
        sample: samples[0] ?? emptySample,
        samples,
        health: {
            verdict: health.verdict,
            broken: health.broken,
            degraded: health.degraded,
            chatCount: health.chatCount,
        },
        filters,
        userAgent: navigator.userAgent,
    };
}

export const TBC_DIAGNOSE_MESSAGE_TYPE = 'tbc-diagnose';

/**
 * content-script bootstrap에서 호출 — popup이 sendMessage 하면 진단 리포트 반환.
 */
export function registerDiagnoseListener(
    adapter: PlatformAdapter,
    platform: SettingInterface['platform'],
) {
    browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
        if ((msg as { type?: string })?.type !== TBC_DIAGNOSE_MESSAGE_TYPE) return;
        runDiagnose(adapter, platform).then(report => sendResponse({ ok: true, report }))
            .catch((e: unknown) => sendResponse({ ok: false, error: String(e) }));
        return true; // async sendResponse
    });
}
