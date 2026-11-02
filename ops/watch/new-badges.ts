/**
 * 10분마다: data/chzzk-badges.json에 없는 치지직 배지를 찾아 Discord로 알린다.
 *
 * 출처 두 곳
 *  - harvester(~/harvester/data/badges.json): 채팅에 지나간 배지. 후원, 구독 선물, 치트키, 팝업스토어 같은 건
 *    목록 API가 없어 이것뿐이다. 구독 배지(채널별)는 목록에 넣지 않으므로 뺀다
 *  - 업적 배지 API(/service/v1/badges/assets?badgeType=CHANNEL_ACHIEVEMENT): 아무도 채팅하지 않아도 나오자마자 보이고
 *    공식 이름(title)이 있다
 *
 * 알림에는 붙여 넣을 JSON 한 줄과 어느 그룹에 넣을지를 담는다. 목록 파일은 사람만 고친다(docs/chzzk-badges.md).
 * 한 번 알린 배지는 다시 알리지 않는다.
 *
 * 상태: watch/new-badges.json
 */
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { sendDiscord } from '../common.ts';
import { fetchJson, readJson, writeJson } from './state.ts';

const LIST_FILE = join(dirname(fileURLToPath(import.meta.url)), '../../data/chzzk-badges.json');
const HARVESTER_FILE = join(homedir(), 'harvester/data/badges.json');
const ACHIEVEMENT_API = 'https://api.chzzk.naver.com/service/v1/badges/assets?badgeType=CHANNEL_ACHIEVEMENT&size=100';

interface HarvestedBadge {
    badgeId: string | null;
    scope: string;
    imageUrl: string;
    imageUrls: string[];
    firstSeen: number;
    channels: string[];
}

export interface NewBadge {
    key: string;
    source: 'harvester' | 'api';
    badgeId: string | null;
    scope: string;
    imageUrl: string;
    /** 넣을 그룹 id 추정. 모르면 null */
    group: string | null;
    /** 이름 추정. 모르면 '' */
    name: string;
    firstSeen: number;
    channels: number;
}

export interface NewBadgesState {
    at: number;
    listed: number;
    unlisted: NewBadge[];
    notified: string[];
    error?: string;
}

/** badgeId, 범위, 파일 이름으로 그룹과 이름을 추정한다. 목록의 그룹 id는 data/chzzk-badges.json 참고 */
export function guess(b: { badgeId: string | null; scope: string; imageUrl: string }): { group: string | null; name: string } {
    const id = b.badgeId ?? '';
    const file = decodeURIComponent(b.imageUrl.split('/').pop() ?? '');
    if (b.scope === 'ROLE') return { group: 'role', name: '' };
    if (b.scope === 'RANK') return { group: 'rank', name: '' };
    if (id.startsWith('chzzkpopup_')) return { group: 'popup', name: file.match(/디지털뱃지_(.+)\.\w+$/)?.[1] ?? '' };
    if (id.startsWith('cheat_key')) {
        const m = file.match(/cheatkey_(\d+)m/);
        return { group: 'cheatkey', name: m ? `치트키 보유자 ${m[1]}개월` : '' };
    }
    if (id.startsWith('donation_')) return { group: 'donation', name: '' };
    if (id.startsWith('subscription_')) return { group: 'subscription', name: '' };
    if (id.startsWith('all_time_viewers_')) {
        const y = id.match(/(\d{4})$/)?.[1];
        return { group: 'recap', name: y ? `${y.slice(2)}년 올타임 시청자` : '' };
    }
    return { group: null, name: '' };
}

async function achievements(): Promise<{ badgeId: string; title: string; imageUrl: string }[]> {
    const all: { badgeId: string; title: string; imageUrl: string }[] = [];
    for (let page = 0; page < 10; page++) {
        const body = await fetchJson<{ content: { totalPages: number; data: { badgeId: string; title: string; imageUrl: string }[] } }>(`${ACHIEVEMENT_API}&page=${page}`);
        all.push(...body.content.data);
        if (page + 1 >= body.content.totalPages) break;
    }
    return all;
}

async function main(): Promise<void> {
    const list = JSON.parse(readFileSync(LIST_FILE, 'utf8')) as { groups: { id: string; badges: { imageUrl: string }[] }[] };
    const known = new Set(list.groups.flatMap((g) => g.badges.map((b) => b.imageUrl)));
    const prev = readJson<NewBadgesState>('new-badges');
    const errors: string[] = [];
    const found: NewBadge[] = [];

    if (existsSync(HARVESTER_FILE)) {
        const harvested = Object.values((JSON.parse(readFileSync(HARVESTER_FILE, 'utf8')) as { badges: Record<string, HarvestedBadge> }).badges);
        for (const b of harvested) {
            if (b.scope === 'SUBSCRIPTION' || b.imageUrls.some((u) => known.has(u))) continue;
            found.push({ key: b.imageUrl, source: 'harvester', badgeId: b.badgeId, scope: b.scope, imageUrl: b.imageUrl, ...guess(b), firstSeen: b.firstSeen, channels: b.channels.length });
        }
    } else errors.push('harvester 데이터 없음');

    try {
        for (const a of await achievements()) {
            if (known.has(a.imageUrl)) continue;
            found.push({ key: a.imageUrl, source: 'api', badgeId: a.badgeId, scope: 'ACHIEVEMENT', imageUrl: a.imageUrl, group: 'achievement', name: a.title, firstSeen: Date.now(), channels: 0 });
        }
    } catch (e) {
        errors.push(`업적 배지 API: ${(e as Error).message}`);
    }

    const notified = new Set(prev?.notified ?? []);
    const fresh = found.filter((b) => !notified.has(b.key));
    if (fresh.length) {
        const lines = [`**새 치지직 배지 ${fresh.length}개** (data/chzzk-badges.json에 없음)`];
        for (const b of fresh.slice(0, 10)) {
            lines.push(
                '',
                `\`${b.badgeId ?? '-'}\` ${b.scope}${b.channels ? `, 채널 ${b.channels}곳` : ''}${b.source === 'api' ? ', 업적 API' : ''}`,
                `그룹 \`${b.group ?? '새 그룹?'}\`에: \`${JSON.stringify({ name: b.name, imageUrl: b.imageUrl })}\``,
                b.imageUrl,
            );
        }
        if (fresh.length > 10) lines.push('', `외 ${fresh.length - 10}개는 현황판에`);
        lines.push('', '이름을 확인해 커밋하면 사이트와 확장에 몇 분 안에 반영된다 (docs/chzzk-badges.md)');
        await sendDiscord(lines);
        for (const b of fresh) notified.add(b.key);
    }

    writeJson('new-badges', {
        at: Date.now(),
        listed: known.size,
        unlisted: found.sort((a, b) => b.firstSeen - a.firstSeen),
        notified: [...notified],
        ...(errors.length ? { error: errors.join(', ') } : {}),
    } satisfies NewBadgesState);
    console.log(`[new-badges] ${new Date().toISOString()} 목록 ${known.size}, 없는 것 ${found.length}, 새로 알림 ${fresh.length}${errors.length ? `, 오류 ${errors.join(', ')}` : ''}`);
    if (errors.length) process.exit(1);
}

main().catch((err) => {
    console.error(`[new-badges] ${new Date().toISOString()}`, err);
    process.exit(1);
});
