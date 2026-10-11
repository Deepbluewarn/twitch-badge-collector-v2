/**
 * captures/chzzk-socket/<run>/ 수집본 분석.
 *  - cmd별 / msgTypeCode별 등장 횟수
 *  - 필드 경로 인벤토리 (profile·extras는 JSON 문자열을 풀어서) — 타입과 등장 비율
 *  - enum성 필드의 값 분포 (개인정보 필드는 값 출력 안 함)
 *  - src/platform/chzzk-socket.ts 파서를 전량 통과시켜 실패/누락 집계
 *
 * 실행: npx tsx scripts/capture/analyze-chzzk-socket.ts captures/chzzk-socket/<run> [out.json]
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseChzzkPacket, normalizeChzzkMessage } from '../../src/platform/chzzk-socket.ts';

const dir = process.argv[2];
if (!dir) { console.error('usage: analyze-chzzk-socket.ts <capture dir> [out.json]'); process.exit(1); }

// 값 자체를 기록하면 안 되는 경로 (닉네임, 해시, 본문, 토큰 등).
const PII = /(nickname|userIdHash|uid|userId|cuid|msg$|content$|extraToken|profileImageUrl|accTkn|sid$|title\.name|donatorName|receiverNickname|anonymousToken|channelName|.*Nickname)/i;
// 값 분포를 보고 싶은 enum성 경로.
const ENUMISH = /(cmd|msgTypeCode|messageTypeCode|msgStatusType|messageStatusType|userRoleCode|osType|chatType|donationType|payType|scope|type$|tier$|tierName|verifiedMarkType|colorCode|giftType|styleType|badgeId|imageUrl)$/;

type Inv = Map<string, { count: number; types: Set<string>; values: Map<string, number> }>;

function walk(inv: Inv, prefix: string, v: unknown) {
    const kind = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    const e = inv.get(prefix) ?? { count: 0, types: new Set(), values: new Map() };
    e.count++; e.types.add(kind);
    if (!PII.test(prefix) && ENUMISH.test(prefix) && (kind === 'string' || kind === 'number' || kind === 'boolean')) {
        const s = String(v);
        e.values.set(s, (e.values.get(s) ?? 0) + 1);
    }
    inv.set(prefix, e);
    if (kind === 'array') (v as unknown[]).forEach(x => walk(inv, `${prefix}[]`, x));
    else if (kind === 'object') for (const [k, x] of Object.entries(v as object)) walk(inv, prefix ? `${prefix}.${k}` : k, x);
    else if (kind === 'string' && (prefix.endsWith('profile') || prefix.endsWith('extras'))) {
        try { const j = JSON.parse(v as string); if (j && typeof j === 'object') walk(inv, `${prefix}⟨json⟩`, j); } catch { /* not json */ }
    }
}

const packets: any[] = [];
for (const f of readdirSync(dir).filter(f => f.endsWith('.jsonl'))) {
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
        if (!line) continue;
        try { packets.push({ ch: f.replace('.jsonl', ''), ...JSON.parse(line), p: JSON.parse(JSON.parse(line).raw) }); } catch { /* skip */ }
    }
}

const cmdCount: Record<string, number> = {};
const byCmd = new Map<number, Inv>();
const byMsgType = new Map<string, Inv>();
const msgItems: { cmd: number; item: any }[] = [];

for (const { p } of packets) {
    cmdCount[p.cmd] = (cmdCount[p.cmd] ?? 0) + 1;
    if (!byCmd.has(p.cmd)) byCmd.set(p.cmd, new Map());
    walk(byCmd.get(p.cmd)!, '', p);
    const items = p.cmd === 15101 ? p.bdy?.messageList ?? [] : (p.cmd === 93101 || p.cmd === 93102) ? p.bdy ?? [] : [];
    for (const it of items) {
        msgItems.push({ cmd: p.cmd, item: it });
        const k = `type ${it.msgTypeCode ?? it.messageTypeCode}`;
        if (!byMsgType.has(k)) byMsgType.set(k, new Map());
        walk(byMsgType.get(k)!, '', it);
    }
}

const parsed = packets.flatMap(({ p }) => parseChzzkPacket(p));
const failed = msgItems.filter(({ item }) => !normalizeChzzkMessage(item));
const ids = new Set(parsed.map(c => c.id));
const typeCount: Record<string, number> = {};
const statusCount: Record<string, number> = {};
for (const c of parsed) { typeCount[c.type] = (typeCount[c.type] ?? 0) + 1; statusCount[c.status] = (statusCount[c.status] ?? 0) + 1; }

const dump = (inv: Inv, total: number) => Object.fromEntries([...inv]
    .filter(([k]) => k)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, e]) => [k, {
        ratio: +(e.count / total).toFixed(3),
        types: [...e.types].join('|'),
        ...(e.values.size ? { values: Object.fromEntries([...e.values].sort((a, b) => b[1] - a[1]).slice(0, 15)) } : {}),
    }]));

const report = {
    capture: dir,
    packets: packets.length,
    cmdCount,
    messages: {
        items: msgItems.length,
        parsed: parsed.length,
        parseFailed: failed.length,
        uniqueIds: ids.size,
        emptyNickname: parsed.filter(c => !c.nickname && !c.anonymous).length,
        anonymous: parsed.filter(c => c.anonymous).length,
        withBadges: parsed.filter(c => c.badges.length).length,
        verified: parsed.filter(c => c.verified).length,
        byType: typeCount,
        byStatus: statusCount,
    },
    fieldsByCmd: Object.fromEntries([...byCmd].map(([cmd, inv]) => [cmd, dump(inv, cmdCount[cmd])])),
    fieldsByMsgType: Object.fromEntries([...byMsgType].map(([k, inv]) => [k, dump(inv, inv.get('')?.count ?? 1)])),
};

const out = process.argv[3];
if (out) writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, fieldsByCmd: undefined, fieldsByMsgType: undefined }, null, 2));
