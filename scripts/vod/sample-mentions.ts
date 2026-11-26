/**
 * 무작위 표본 다시보기의 채팅에서 확장 언급 찾기. 치지직 방송 전반에서 확장이 얼마나 입에 오르는지 가늠한다.
 * 채널 목록(사이트 리포의 구독 배지 채널)에서 채널을 무작위로 고르고, 그 채널 다시보기 중 하나를 뽑는다.
 * 다시보기 보관 기간(약 40일)을 BUCKETS개 구간으로 나눠 구간마다 같은 수만큼 뽑는다.
 * 긴 방송은 앞에서부터 MAX_PAGES 요청(약 200건씩)까지만 본다.
 *
 *   VOD_RPS=10 npx tsx scripts/vod/sample-mentions.ts [표본 수, 기본 160] [결과 JSON] [channels.json]
 *   (기본 160개면 20분쯤 걸린다)
 */
import { readFileSync, writeFileSync } from 'fs';
import { matchMention } from '../../ops/watch/mention-match.ts';
import { eachChat, kst, pool, recentReplays, requests, type Replay } from './vod-chat.ts';

const [sizeArg = '160', out = 'sample-mentions.json', file = '../badgecollector-site/src/data/channels.json'] = process.argv.slice(2);
const SIZE = Number(sizeArg);
const BUCKETS = 8;
const DAYS = 40;
const MAX_PAGES = 80;

const channels: { id: string; name: string; followers: number }[] = JSON.parse(readFileSync(file, 'utf8')).channels.map((c: any) => c.channel);
for (let i = channels.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [channels[i], channels[j]] = [channels[j], channels[i]];
}

const now = Date.now();
const bucketOf = (r: Replay) => Math.floor((now - Date.parse(`${r.publishDate.replace(' ', 'T')}+09:00`)) / (DAYS / BUCKETS * 86_400_000));
const need = Array(BUCKETS).fill(SIZE / BUCKETS);
const picks: { ch: (typeof channels)[number]; replay: Replay; bucket: number }[] = [];

// 채널마다 아직 덜 찬 구간 중 그 채널에 다시보기가 있는 구간을 무작위로 골라 하나 뽑는다
let cursor = 0;
while (picks.length < SIZE && cursor < channels.length) {
    const batch = channels.slice(cursor, cursor += 16);
    await pool(batch, 4, async (ch) => {
        if (picks.length >= SIZE) return;
        const replays = await recentReplays(ch.id, 50);
        const open = [...new Set(replays.map(bucketOf))].filter((b) => b >= 0 && b < BUCKETS && need[b] > 0);
        if (!open.length) return;
        const b = open[Math.floor(Math.random() * open.length)];
        const inBucket = replays.filter((r) => bucketOf(r) === b);
        need[b]--;
        picks.push({ ch, replay: inBucket[Math.floor(Math.random() * inBucket.length)], bucket: b });
    });
}
console.error(`표본 ${picks.length}개 (채널 ${cursor}개 살펴봄), 요청 ${requests}`);

const results: any[] = [];
await pool(picks, 6, async ({ ch, replay, bucket }) => {
    const hits: string[] = [];
    let first: number | null = null, last = 0;
    const chats = await eachChat(replay.videoNo, (c) => {
        first ??= c.at;
        last = c.at;
        const strength = matchMention(c.text);
        if (strength) hits.push(`${kst(c.at)} ${strength} ${c.who} | ${c.text.slice(0, 160)}`);
    }, { maxPages: MAX_PAGES });
    const coveredHours = first ? (last - first) / 3_600_000 : 0;
    results.push({ channel: ch.name, followers: ch.followers, videoNo: replay.videoNo, title: replay.title, date: replay.publishDate, bucket, hours: +(replay.duration / 3600).toFixed(1), coveredHours: +coveredHours.toFixed(1), chats, truncated: chats >= MAX_PAGES * 190, hits });
    if (results.length % 20 === 0) console.error(`${results.length}/${picks.length} 요청 ${requests}`);
});

writeFileSync(out, JSON.stringify(results, null, 1));
const tier = (f: number) => f >= 100_000 ? '10만+' : f >= 10_000 ? '1만~10만' : f >= 1_000 ? '1천~1만' : '1천 미만';
const sum = (rs: any[]) => ({ replays: rs.length, hours: Math.round(rs.reduce((a, r) => a + r.coveredHours, 0)), chats: rs.reduce((a, r) => a + r.chats, 0), withMention: rs.filter((r) => r.hits.length).length, mentions: rs.reduce((a, r) => a + r.hits.length, 0) });
console.log('전체', sum(results));
for (const t of ['10만+', '1만~10만', '1천~1만', '1천 미만']) console.log(t, sum(results.filter((r) => tier(r.followers) === t)));
for (let b = 0; b < BUCKETS; b++) console.log(`${b * DAYS / BUCKETS}~${(b + 1) * DAYS / BUCKETS}일 전`, sum(results.filter((r) => r.bucket === b)));
for (const r of results.filter((r) => r.hits.length)) {
    console.log(`\n## ${r.channel} (팔로워 ${r.followers}) ${r.date} ${r.title}`);
    for (const h of r.hits) console.log(`  ${h}`);
}
console.log(`\n요청 ${requests}번`);
