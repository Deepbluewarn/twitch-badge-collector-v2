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
    sample: {
        source: 'inject-wrapper' | 'chatRoomLive' | 'none';
        outerHTML: string | null;
        extract: 'pass' | 'fail-undefined' | 'fail-throw' | 'no-sample';
        extractedNickname: string | null;
        extractedText: string | null;
        extractError: string | null;
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
            selectorResults.push({ name, selector: value, count, required });
        } catch (e) {
            selectorResults.push({ name, selector: value, count: 0, error: String(e), required });
        }
    }

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

    // 3) 샘플 chat outerHTML — 배지 있는 chat 우선 (badge selector 깨졌는지 판별 위해).
    // 없으면 첫 chat. (chzzk의 inject wrapper엔 list_bottom marker 등 non-chat 자식도 섞임.)
    let sampleSource: DiagnoseReport['sample']['source'] = 'none';
    let sampleEl: HTMLElement | null = null;
    const allChats = wrapper ? Array.from(wrapper.querySelectorAll<HTMLElement>(`[${CHAT_ATTR.KEY}]`)) : [];
    const chatWithBadge = allChats.find(el => {
        const raw = el.getAttribute('data-tbc-chat-badges');
        return raw && raw !== '[]' && raw !== 'null';
    });
    const chatWithKey = chatWithBadge ?? allChats[0];
    if (chatWithKey) {
        sampleEl = chatWithKey;
        sampleSource = 'inject-wrapper';
    } else {
        const chatRoom = document.querySelector(cfg.selectors.chatRoomLive);
        const firstChild = chatRoom?.firstElementChild as HTMLElement | undefined;
        if (firstChild) {
            sampleEl = firstChild;
            sampleSource = 'chatRoomLive';
        }
    }
    const outerHTML = sampleEl?.outerHTML.slice(0, 3000) ?? null;

    // 4) adapter.extract 시도 — selector가 잘 나와도 extract 로직에서 nickname/text 못 뽑으면
    // 결국 chat 수집 안 됨. 여기서 pass/fail 판정.
    let extract: DiagnoseReport['sample']['extract'] = 'no-sample';
    let extractedNickname: string | null = null;
    let extractedText: string | null = null;
    let extractError: string | null = null;
    if (sampleEl) {
        try {
            // extract가 wrapper 직속 child 여부 체크하므로, 필요 시 임시 wrapper attach.
            let target = sampleEl;
            if (sampleEl.parentElement?.id !== wrapperId) {
                const tmp = document.createElement('div');
                tmp.id = wrapperId;
                const cloned = sampleEl.cloneNode(true) as HTMLElement;
                tmp.appendChild(cloned);
                target = cloned;
            }
            const info = adapter.extract(target);
            if (info) {
                extract = 'pass';
                extractedNickname = info.nickName ?? null;
                extractedText = info.textContents.filter(Boolean).join(' ').trim() || null;
            } else {
                extract = 'fail-undefined';
            }
        } catch (e) {
            extract = 'fail-throw';
            extractError = String(e);
        }
    }

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
        sample: {
            source: sampleSource,
            outerHTML,
            extract,
            extractedNickname,
            extractedText,
            extractError,
        },
        filters,
        userAgent: navigator.userAgent,
    };
}

/**
 * 페이지 컨텍스트별 필수 selector 이름. 없으면 채팅 수집 자체가 안 됨.
 * 나머지는 상황별 optional — 화면에 도네가 없으면 donationText가 0인 게 당연.
 * required 판정은 카테고리 요약에서 "진짜 실패"만 골라내는 데 사용.
 */
function getRequiredSelectorNames(pageMode: string): Set<string> {
    const common = new Set(['displayName', 'messageText', 'usernameContainer', 'badge']);
    if (pageMode === 'live') common.add('chatRoomLive');
    else if (pageMode === 'video') common.add('chatRoomVod');
    return common;
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
