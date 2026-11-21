import { describe, expect, it } from 'vitest';
import { kstHour, matchMention, mentionFindings, type Mention } from './mention-match.ts';

// 2026-11-21 02:10 KST
const AT = Date.UTC(2026, 10, 20, 17, 10);
const m = (text: string, over: Partial<Mention> = {}): Mention => ({
    at: AT, channelId: 'c1', channelName: '방송1', viewers: 1234, category: 'talk', strength: matchMention(text) ?? 'weak', text, ...over,
});

describe('matchMention', () => {
    it('이름은 띄어쓰기, 표기가 달라도 강한 언급', () => {
        for (const t of ['뱃지 콜렉터 깔아', '배지컬렉터 뭐임', 'Badge-Collector', 'badgecollector.dev 들어가봐', '벳지 콜렉터?']) {
            expect(matchMention(t)).toBe('strong');
        }
    });
    it('스토어 링크의 확장 ID도 강한 언급', () => {
        expect(matchMention('chromewebstore.google.com/detail/badge/gbcdobpipglclbhabpkacoecddmopojp')).toBe('strong');
    });
    it('배지와 확장, 모아보기가 같이 나오면 약한 언급', () => {
        expect(matchMention('뱃지 모아보기 확장 있음')).toBe('weak');
        expect(matchMention('배지 단 사람 채팅 따로 보는 거')).toBe('weak');
    });
    it('그 밖은 언급 아님', () => {
        expect(matchMention('구독 뱃지 이쁘다')).toBeNull();
        expect(matchMention('확장팩 언제 나옴')).toBeNull();
        expect(matchMention('콜렉터 에디션')).toBeNull();
    });
});

describe('kstHour', () => {
    it('한국 시각 기준 시간', () => {
        expect(kstHour(AT)).toBe('2026112102');
    });
});

describe('mentionFindings', () => {
    it('강한 언급은 하나로도 사건', () => {
        const f = mentionFindings([m('뱃지 콜렉터 깔아')]);
        expect(f).toHaveLength(1);
        expect(f[0].key).toBe('mention:c1:2026112102');
        expect(f[0].title).toContain('방송1 (2시, 시청 1,234명, 1건)');
        expect(f[0].lines).toContain('"뱃지 콜렉터 깔아"');
    });
    it('약한 언급은 같은 방송 같은 시간에 3건부터', () => {
        expect(mentionFindings([m('뱃지 모아보기 확장'), m('뱃지 확장 뭐임')])).toHaveLength(0);
        expect(mentionFindings([m('뱃지 모아보기 확장'), m('뱃지 확장 뭐임'), m('배지 따로 보는 확장')])).toHaveLength(1);
    });
    it('방송과 시간이 다르면 다른 사건', () => {
        const f = mentionFindings([
            m('뱃지 콜렉터'),
            m('뱃지 콜렉터', { at: AT + 3_600_000 }),
            m('뱃지 콜렉터', { channelId: 'c2', channelName: '방송2' }),
        ]);
        expect(f.map((x) => x.key).sort()).toEqual(['mention:c1:2026112102', 'mention:c1:2026112103', 'mention:c2:2026112102']);
    });
});
