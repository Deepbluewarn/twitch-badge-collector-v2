/**
 * 채널의 최근 다시보기 채팅 전체에서 확장 언급 찾기. 그 스트리머 방송에서 확장이 화제가 된 적 있는지 본다.
 * 2026-11-26 토키노 메리 채널(다시보기 10개, 채팅 137만 건)을 볼 때 만들었다.
 *
 *   npx tsx scripts/vod/channel-mentions.ts <채널 ID[,채널 ID...]> [채널당 다시보기 수, 기본 10] [결과 폴더]
 *
 * 결과 폴더를 주면 다시보기마다 <videoNo>.json으로 남기고, 다시 돌릴 때 이미 있는 것은 건너뛴다.
 * 여러 채널을 오래 볼 때(스텔라이브 전수조사) 끊겨도 이어서 돌리려고 둔다. 이때는 VOD_RPS를 낮춘다.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { matchMention } from '../../ops/watch/mention-match.ts';
import { eachChat, kst, pool, recentReplays, requests, type Replay } from './vod-chat.ts';

const [ids, size = '10', dir] = process.argv.slice(2);
if (!ids) {
    console.error('사용: channel-mentions.ts <채널 ID[,채널 ID...]> [다시보기 수] [결과 폴더]');
    process.exit(2);
}
if (dir) mkdirSync(dir, { recursive: true });

interface Result { channelId: string; v: Replay; n: number; first: number | null; hits: string[] }

const todo: { channelId: string; v: Replay }[] = [];
for (const channelId of ids.split(',')) {
    for (const v of await recentReplays(channelId, Number(size))) todo.push({ channelId, v });
}
console.error(`다시보기 ${todo.length}개, ${Math.round(todo.reduce((a, x) => a + x.v.duration, 0) / 3600)}시간`);

const results: Result[] = [];
let done = 0;
await pool(todo, dir ? 3 : 10, async ({ channelId, v }) => {
    const file = dir && join(dir, `${v.videoNo}.json`);
    if (file && existsSync(file)) return;
    const hits: string[] = [];
    let first: number | null = null;
    const n = await eachChat(v.videoNo, (c) => {
        first ??= c.at;
        const strength = matchMention(c.text);
        if (strength) hits.push(`  ${kst(c.at)} ${strength} ${c.who} | ${c.text.slice(0, 160)}`);
    });
    const r = { channelId, v, n, first, hits };
    if (file) writeFileSync(file, JSON.stringify(r));
    else results.push(r);
    console.error(`${++done}/${todo.length} ${v.publishDate} 채팅 ${n} 언급 ${hits.length}, 요청 ${requests}`);
});
if (dir) for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) results.push(JSON.parse(readFileSync(join(dir, f), 'utf8')));

let chats = 0, found = 0;
for (const { v, n, first, hits } of results.sort((a, b) => a.channelId.localeCompare(b.channelId) || a.v.publishDate.localeCompare(b.v.publishDate))) {
    chats += n;
    found += hits.length;
    console.log(`## ${first ? kst(first) : v.publishDate} ${(v.duration / 3600).toFixed(1)}시간 채팅 ${n.toLocaleString()} 언급 ${hits.length} | ${v.title}`);
    for (const h of hits) console.log(h);
}
console.log(`\n다시보기 ${results.length}개, 채팅 ${chats.toLocaleString()}건, 언급 ${found}건`);
