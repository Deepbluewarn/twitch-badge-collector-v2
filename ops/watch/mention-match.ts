/**
 * 방송 채팅에서 확장 언급 찾기와 사건 묶기. 파일, 네트워크를 건드리지 않는 순수 함수만 둔다 (입출력은 mentions.ts).
 */
import type { Finding } from './incidents.ts';

export type Strength = 'strong' | 'weak';

export interface Mention {
    at: number;
    channelId: string;
    channelName: string;
    viewers: number;
    category: string;
    strength: Strength;
    /** 언급된 채팅 본문만. 닉네임, 사용자 ID는 남기지 않는다 */
    text: string;
}

// 띄어쓰기, 문장 부호를 지운 소문자에서 찾는다 ("뱃지 콜렉터", "Badge-Collector")
const STRONG = /(뱃|배|벳)지(콜|컬)렉터|badgecollector|gbcdobpip/;
// 이름 없이 기능으로 말하는 경우. 혼자서는 알리지 않고 기록만 한다
const WEAK_BADGE = /(뱃|배|벳)지/;
const WEAK_WHAT = /확장|모아보기|모아보는|따로보는|따로보기/;

export function matchMention(text: string): Strength | null {
    const s = text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
    if (STRONG.test(s)) return 'strong';
    if (WEAK_BADGE.test(s) && WEAK_WHAT.test(s)) return 'weak';
    return null;
}

/** 한국 시각 YYYYMMDDHH */
export function kstHour(at: number): string {
    return new Date(at + 9 * 3_600_000).toISOString().slice(0, 13).replace(/\D/g, '');
}

/**
 * 최근 언급을 채널, 한국 시각 한 시간 단위 사건으로 묶는다. 강한 언급이 하나라도 있거나 약한 언급이 3건 이상인 묶음만.
 * key에 시간을 넣어 같은 방송의 다음 시간 언급은 새 사건(새 알림)이 된다.
 */
export function mentionFindings(mentions: Mention[]): Finding[] {
    const groups = new Map<string, Mention[]>();
    for (const m of mentions) {
        const key = `mention:${m.channelId}:${kstHour(m.at)}`;
        groups.set(key, [...(groups.get(key) ?? []), m]);
    }
    const findings: Finding[] = [];
    for (const [key, list] of groups) {
        const strong = list.filter((m) => m.strength === 'strong');
        if (strong.length === 0 && list.length < 3) continue;
        const first = list[0];
        const hour = Number(kstHour(first.at).slice(8));
        const shown = (strong.length ? strong : list).slice(0, 3);
        findings.push({
            key,
            level: 'info',
            title: `방송 채팅에 확장 언급: ${first.channelName} (${hour}시, 시청 ${first.viewers.toLocaleString('ko-KR')}명, ${list.length}건)`,
            lines: [...shown.map((m) => `"${m.text}"`), `https://chzzk.naver.com/live/${first.channelId}`],
        });
    }
    return findings;
}
