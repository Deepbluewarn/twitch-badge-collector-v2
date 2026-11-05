/**
 * 익명 사용 통계의 "그날 한 일" 표시 (docs/adr/0001-anonymous-usage-stats.md).
 * 콘텐츠 스크립트, 팝업, 설정 페이지가 부른다. 저장과 전송은 백그라운드(usage-stats.ts)가 한다.
 * 이 파일은 콘텐츠 스크립트에 들어가므로 가볍게 둔다.
 */

import { USAGE_FLAGS, type UsageFlag } from './flags';

export { USAGE_FLAGS, type UsageFlag };

export const USAGE_MARK_MESSAGE = 'tbc-usage-mark';

export function isUsageFlag(x: unknown): x is UsageFlag {
    return typeof x === 'string' && (USAGE_FLAGS as readonly string[]).includes(x);
}

/** 사용자 컴퓨터 기준 날짜 YYYY-MM-DD */
export function localDay(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const sentThisPage = new Set<string>();

/**
 * 그날 한 일을 백그라운드에 알린다. 같은 페이지에서 같은 날 같은 표시는 한 번만 보낸다.
 * 꺼져 있는지는 백그라운드가 본다. 채팅 처리 한가운데서도 불리므로 무슨 일이 있어도 던지지 않는다
 * (업데이트로 연결이 끊긴 옛 스크립트에선 sendMessage가 "Extension context invalidated"를 바로 던진다).
 */
export function markUsage(flag: UsageFlag): void {
    if (import.meta.env.BROWSER === 'firefox') return;
    try {
        const key = `${localDay(new Date())}:${flag}`;
        if (sentThisPage.has(key)) return;
        sentThisPage.add(key);
        if (!browser.runtime?.id) return;
        browser.runtime.sendMessage({ type: USAGE_MARK_MESSAGE, flags: [flag] }).catch(() => { /* 백그라운드 깨는 중 */ });
    } catch { /* 통계는 없어도 된다 */ }
}
