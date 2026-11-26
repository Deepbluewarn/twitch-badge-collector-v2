/**
 * 그 시각에 방송 중이던 다시보기 채팅에서 확장 언급 찾기. 스토어 유입이 갑자기 몰렸을 때 어느 방송인지 찾는다.
 * 2026-11-25 15:15 몰림을 시즈키 토아 방송으로 찾을 때 만들었다.
 *
 * 채널 목록은 사이트 리포의 구독 배지 채널(약 2,400개). 목록에 없는 방송은 못 찾는다.
 * 판정은 방송 언급 감시와 같은 ops/watch/mention-match.ts.
 *
 *   npx tsx scripts/vod/mentions-at.ts "2026-11-25 15:00" "2026-11-25 15:30" [channels.json]
 *   (기본 채널 목록: ../badgecollector-site/src/data/channels.json, 10~20분 걸린다)
 */
import { readFileSync } from 'fs';
import { matchMention } from '../../ops/watch/mention-match.ts';
import { eachChat, kst, pool, recentReplays, replayStart, type Replay } from './vod-chat.ts';

const [fromArg, toArg, file = '../badgecollector-site/src/data/channels.json'] = process.argv.slice(2);
if (!fromArg || !toArg) {
    console.error('사용: mentions-at.ts "YYYY-MM-DD HH:MM" "YYYY-MM-DD HH:MM" [channels.json]  (한국 시각)');
    process.exit(2);
}
const FROM = Date.parse(`${fromArg.replace(' ', 'T')}:00+09:00`);
const TO = Date.parse(`${toArg.replace(' ', 'T')}:00+09:00`);

const channels: { id: string; name: string }[] = JSON.parse(readFileSync(file, 'utf8')).channels.map((c: any) => c.channel);
const cands: (Replay & { channel: string })[] = [];
await pool(channels, 8, async (ch) => {
    for (const v of await recentReplays(ch.id, 8)) {
        const end = Date.parse(`${v.publishDate.replace(' ', 'T')}+09:00`);
        // publishDate가 시작인지 끝인지 영상마다 확실치 않아 양쪽을 다 덮는다. 정확한 판단은 채팅 시각으로
        if (end + v.duration * 1000 >= FROM && end - v.duration * 1000 - 3_600_000 <= TO) cands.push({ ...v, channel: ch.name });
    }
});
console.error(`후보 다시보기 ${cands.length}개`);

let live = 0, total = 0;
const hits: { channel: string; at: string; who: string; strength: string; text: string }[] = [];
await pool(cands, 6, async (v) => {
    const start = await replayStart(v.videoNo);
    if (!start || start > TO || start + v.duration * 1000 < FROM) return;
    live++;
    total += await eachChat(v.videoNo, (c) => {
        const strength = matchMention(c.text);
        if (strength) hits.push({ channel: v.channel, at: kst(c.at), who: c.who, strength, text: c.text.slice(0, 160) });
    }, { start, from: FROM, to: TO });
});

console.error(`그 시각 방송 ${live}개, 채팅 ${total.toLocaleString()}건, 언급 ${hits.length}건`);
const byChannel = new Map<string, typeof hits>();
for (const h of hits) byChannel.set(h.channel, [...(byChannel.get(h.channel) ?? []), h]);
for (const [channel, list] of [...byChannel].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n## ${channel} (${list.length}건)`);
    for (const h of list.sort((a, b) => a.at.localeCompare(b.at))) console.log(`${h.at} ${h.strength} ${h.who} | ${h.text}`);
}
