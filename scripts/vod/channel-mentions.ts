/**
 * 한 채널의 최근 다시보기 채팅 전체에서 확장 언급 찾기. 그 스트리머 방송에서 확장이 화제가 된 적 있는지 본다.
 * 2026-11-26 토키노 메리 채널(다시보기 10개, 채팅 137만 건)을 볼 때 만들었다.
 *
 *   npx tsx scripts/vod/channel-mentions.ts <채널 ID> [다시보기 수, 기본 10]
 *   (긴 방송 10개면 몇 분 걸린다)
 */
import { matchMention } from '../../ops/watch/mention-match.ts';
import { eachChat, kst, recentReplays } from './vod-chat.ts';

const [channelId, size = '10'] = process.argv.slice(2);
if (!channelId) {
    console.error('사용: channel-mentions.ts <채널 ID> [다시보기 수]');
    process.exit(2);
}

const replays = await recentReplays(channelId, Number(size));
const results = await Promise.all(replays.map(async (v) => {
    const hits: string[] = [];
    let first: number | null = null;
    const n = await eachChat(v.videoNo, (c) => {
        first ??= c.at;
        const strength = matchMention(c.text);
        if (strength) hits.push(`  ${kst(c.at)} ${strength} ${c.who} | ${c.text.slice(0, 160)}`);
    });
    return { v, n, first, hits };
}));

let chats = 0, found = 0;
for (const { v, n, first, hits } of results) {
    chats += n;
    found += hits.length;
    console.log(`## ${first ? kst(first) : v.publishDate} ${(v.duration / 3600).toFixed(1)}시간 채팅 ${n.toLocaleString()} 언급 ${hits.length} | ${v.title}`);
    for (const h of hits) console.log(h);
}
console.log(`\n다시보기 ${results.length}개, 채팅 ${chats.toLocaleString()}건, 언급 ${found}건`);
