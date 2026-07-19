/**
 * 진단 리포트를 개발자 Discord로 자동 제보.
 *
 * 스코프:
 *  - 사용자가 popup "제보" 클릭 → sanitize된 report를 Discord webhook에 POST.
 *  - 첫 제보 전 한 번만 동의 다이얼로그 (미리보기 + 동의) → 이후 storage.local 저장.
 *  - outerHTML은 tag/class/attribute 구조만 유지, 텍스트 노드는 모두 제거.
 *  - extractedNickname/Text 필드는 전송 X.
 *
 * Webhook URL은 build-time env로 주입 — 확장 번들에 그대로 박히므로 스팸 위험 존재.
 * Discord 자체 rate limit(30/min)에 의존. 어뷰징 심하면 webhook rotate 후 신 rev 배포.
 */
import type { DiagnoseReport } from './diagnose';

/** wxt 환경변수 (WXT_PUBLIC_ prefix). 미설정 시 undefined → 제보 버튼 비활성. */
export const REPORT_WEBHOOK_URL: string | undefined =
    (import.meta as unknown as { env?: Record<string, string> }).env?.WXT_PUBLIC_REPORT_WEBHOOK_URL;

export const REPORT_CONSENT_STORAGE_KEY = 'tbc-report-consent';
export const REPORT_LAST_SUBMITTED_KEY = 'tbc-report-last-submitted';
export const REPORT_MIN_INTERVAL_MS = 60 * 60 * 1000; // 1시간

/** 남은 대기 시간(ms). 0이면 즉시 가능. */
export async function getReportCooldownRemainingMs(): Promise<number> {
    try {
        const r = await browser.storage.local.get(REPORT_LAST_SUBMITTED_KEY);
        const last = r[REPORT_LAST_SUBMITTED_KEY] as number | undefined;
        if (!last) return 0;
        const remaining = REPORT_MIN_INTERVAL_MS - (Date.now() - last);
        return Math.max(0, remaining);
    } catch { return 0; }
}

export function isReportingAvailable(): boolean {
    return typeof REPORT_WEBHOOK_URL === 'string' && REPORT_WEBHOOK_URL.startsWith('https://');
}

/**
 * report.sample.outerHTML은 사용자 nickname/발화 텍스트를 담고 있음. Discord에 그대로
 * 흘려보내면 개인정보 노출. 여기서 DOM 순회하며 텍스트 노드만 모두 비움 — tag/class/
 * attribute는 유지되어 selector 분석엔 지장 없음.
 */
function sanitizeOuterHTML(html: string): string {
    if (typeof document === 'undefined') return html;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    stripTextNodes(wrapper);
    return wrapper.firstElementChild?.outerHTML ?? '';
}

function stripTextNodes(node: Node) {
    const children = Array.from(node.childNodes);
    for (const c of children) {
        if (c.nodeType === Node.TEXT_NODE) c.textContent = '';
        else stripTextNodes(c);
    }
}

export function sanitizeReport(report: DiagnoseReport): DiagnoseReport {
    return {
        ...report,
        sample: {
            ...report.sample,
            outerHTML: report.sample.outerHTML ? sanitizeOuterHTML(report.sample.outerHTML) : null,
            extractedNickname: null,
            extractedText: null,
        },
    };
}

/**
 * selector들을 기능 카테고리로 묶어 어느 축이 깨졌는지 한눈에 파악.
 * 카테고리에 없는 이름은 '기타'로.
 */
const SELECTOR_CATEGORIES: Record<string, string[]> = {
    '채팅방/컨테이너': ['chatRoomLive', 'chatRoomVod', 'video'],
    '닉네임/메시지': ['displayName', 'messageText', 'usernameContainer', 'chatterName'],
    '배지/인증': ['badge', 'verifiedIcon', 'blindText'],
    '도네이션': ['donationText'],
    '포인트 박스': ['pointButton', 'pointButtonContainer'],
    '기타': ['popupProfileHeader', 'foldedClassSubstring'],
};

function categorize(name: string): string {
    for (const [cat, names] of Object.entries(SELECTOR_CATEGORIES)) {
        if (names.includes(name)) return cat;
    }
    return '기타';
}

function buildMarkdown(r: DiagnoseReport): string {
    // 진짜 문제는 required=true인데 count=0인 것.
    const failed = r.selectorResults.filter(s => s.count === 0 && s.required);
    const optionalEmpty = r.selectorResults.filter(s => s.count === 0 && !s.required);

    // 카테고리별 실패 grouping
    const failedByCat = new Map<string, typeof failed>();
    for (const f of failed) {
        const cat = categorize(f.name);
        if (!failedByCat.has(cat)) failedByCat.set(cat, []);
        failedByCat.get(cat)!.push(f);
    }

    // 카테고리별 pass/total (전체 select 대비)
    const totalByCat = new Map<string, number>();
    for (const s of r.selectorResults) {
        const cat = categorize(s.name);
        totalByCat.set(cat, (totalByCat.get(cat) ?? 0) + 1);
    }

    const catSummary = Array.from(totalByCat.entries())
        .map(([cat, tot]) => {
            const failCount = failedByCat.get(cat)?.length ?? 0;
            const emoji = failCount === 0 ? '✅' : failCount === tot ? '❌' : '⚠️';
            return `${emoji} ${cat} ${tot - failCount}/${tot}`;
        })
        .join(' · ');

    const extractLabel =
        r.sample.extract === 'pass' ? '✅ pass'
        : r.sample.extract === 'fail-undefined' ? '❌ undefined (selector 미매칭)'
        : r.sample.extract === 'fail-throw' ? '❌ throw'
        : '⚠️ 샘플 없음';

    const lines: string[] = [];
    lines.push(`## TBC 진단 리포트 — \`${r.platform}\` rev ${r.manifest.rev} (${r.manifest.source})`);
    lines.push('');
    lines.push(`**추출**: ${extractLabel}`);
    lines.push(`**Inject wrapper**: ${r.injectWrapper.exists ? `exists, chats ${r.injectWrapper.chatsWithKeyAttr}/${r.injectWrapper.chatCountInside}` : '**없음**'}`);
    lines.push(`**필터**: 전체 ${r.filters.totalGroupCount} · 플랫폼 대상 ${r.filters.currentPlatformGroupCount}`);
    if (r.filters.firstGroupSummary) {
        lines.push(`  - 첫 그룹: \`${r.filters.firstGroupSummary.slice(0, 120)}\``);
    }
    lines.push('');
    lines.push(`**카테고리 요약**: ${catSummary}`);
    lines.push('');

    if (failed.length > 0) {
        lines.push('### 실패 selector (필수)');
        for (const [cat, list] of failedByCat) {
            lines.push(`**${cat}**`);
            for (const f of list) {
                lines.push(`- \`${f.name}\` → \`${f.selector}\``);
            }
        }
        lines.push('');
    } else {
        lines.push('### 필수 selector: 전부 통과');
        lines.push('');
    }
    if (optionalEmpty.length > 0) {
        lines.push(`_참고: 조건별 optional selector ${optionalEmpty.length}개 count=0 (${optionalEmpty.map(s => s.name).join(', ')}) — 화면에 해당 요소가 없어서일 가능성._`);
        lines.push('');
    }

    lines.push(`**URL**: ${r.url.slice(0, 100)}`);
    lines.push(`**시간**: ${r.timestamp}`);
    lines.push(`**UA**: \`${r.userAgent.slice(0, 90)}\``);
    lines.push('');
    lines.push(`_상세는 첨부 \`report.json\` 참조._`);

    // Discord content 필드 max 2000자 — 여유 있게 절단.
    let out = lines.join('\n');
    if (out.length > 1900) out = out.slice(0, 1900) + '\n… (truncated)';
    return out;
}

/**
 * Discord webhook에 sanitize된 리포트 전송. JSON을 file attachment로 보내 2000자 제한 회피.
 * 실패 시 throw.
 */
export async function submitReport(report: DiagnoseReport): Promise<void> {
    if (!REPORT_WEBHOOK_URL) throw new Error('webhook not configured');
    // 1시간 throttle — 사용자 단위 spam 방어. Discord 자체 rate limit(30/min)에 더해 이중.
    const cooldown = await getReportCooldownRemainingMs();
    if (cooldown > 0) {
        const min = Math.ceil(cooldown / 60000);
        throw new Error(`cooldown: ${min}분 후 재제보 가능`);
    }
    const sanitized = sanitizeReport(report);
    const md = buildMarkdown(sanitized);
    const form = new FormData();
    form.append('payload_json', JSON.stringify({ content: md }));
    form.append(
        'file',
        new Blob([JSON.stringify(sanitized, null, 2)], { type: 'application/json' }),
        'report.json',
    );
    const res = await fetch(REPORT_WEBHOOK_URL, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`Discord: ${res.status} ${res.statusText}`);
    await browser.storage.local.set({ [REPORT_LAST_SUBMITTED_KEY]: Date.now() });
}
