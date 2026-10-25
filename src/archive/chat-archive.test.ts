import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
    clearArchive, closeArchiveDb, countArchivedChats, deleteArchiveChannel, eachArchivedChat, queryArchivedChats, getArchivedChats, hideArchivedChats, listArchiveChannels,
    purgeArchive, putArchivedChats, sanitizeArchivedChat, toCsv, toText, formatArchiveTime, type ArchivedChat,
} from './chat-archive';

const CH = 'chzzk:abc:live';
const chat = (n: number, over: Partial<ArchivedChat> = {}): ArchivedChat => ({
    id: `${CH}|u${n}_${n}`, channel: CH, time: n, savedAt: Date.now(), nickname: `닉${n}`, text: `채팅${n}`, badges: [], kind: 'chat',
    ...over,
});

describe('보관함 DB', () => {
    beforeEach(async () => {
        await clearArchive();
    });

    it('넣은 채팅을 채널별로, 시각 순서로 돌려준다', async () => {
        await putArchivedChats([chat(3), chat(1), chat(2), chat(1, { channel: 'chzzk:zzz:live', id: 'chzzk:zzz:live|x' })]);
        expect((await getArchivedChats(CH)).map(c => c.time)).toEqual([1, 2, 3]);
        const channels = await listArchiveChannels();
        expect(channels.map(c => [c.channel, c.count])).toEqual(expect.arrayContaining([[CH, 3], ['chzzk:zzz:live', 1]]));
        expect(channels.find(c => c.channel === CH)).toMatchObject({ platform: 'chzzk', channelId: 'abc', mode: 'live' });
    });

    it('같은 id는 한 줄로 덮어쓴다', async () => {
        await putArchivedChats([chat(1)]);
        await putArchivedChats([chat(1, { text: '바뀜' })]);
        expect((await getArchivedChats(CH)).map(c => c.text)).toEqual(['바뀜']);
    });

    it('가려진 채팅은 다시 넣어도 본문이 되살아나지 않는다', async () => {
        await putArchivedChats([chat(1)]);
        await hideArchivedChats([chat(1).id]);
        await putArchivedChats([chat(1)]);
        expect(await getArchivedChats(CH)).toMatchObject([{ text: '', hidden: true }]);
    });

    it('보관 기간이 지난 채팅만 지우고, 빈 채널은 목록에서 뺀다', async () => {
        const now = Date.now();
        const day = 86_400_000;
        await putArchivedChats([
            chat(1, { savedAt: now - 40 * day }),
            chat(2, { savedAt: now - 10 * day }),
            chat(1, { channel: 'chzzk:old:live', id: 'chzzk:old:live|x', savedAt: now - 40 * day }),
        ]);
        await purgeArchive(30, now);
        expect((await getArchivedChats(CH)).map(c => c.time)).toEqual([2]);
        expect((await listArchiveChannels()).map(c => c.channel)).toEqual([CH]);
    });

    it('채널 하나만 지운다', async () => {
        await putArchivedChats([chat(1), chat(1, { channel: 'chzzk:zzz:live', id: 'chzzk:zzz:live|x' })]);
        await deleteArchiveChannel(CH);
        expect(await getArchivedChats(CH)).toEqual([]);
        expect((await listArchiveChannels()).map(c => c.channel)).toEqual(['chzzk:zzz:live']);
    });

    it('연결을 닫았다 열어도 남아 있다', async () => {
        await putArchivedChats([chat(1)]);
        await closeArchiveDb();
        expect(await getArchivedChats(CH)).toHaveLength(1);
    });
});

describe('sanitizeArchivedChat', () => {
    it('모양이 틀리면 null', () => {
        expect(sanitizeArchivedChat(null)).toBeNull();
        expect(sanitizeArchivedChat({ ...chat(1), channel: 'evil' })).toBeNull();
        expect(sanitizeArchivedChat({ ...chat(1), id: 'other|x' })).toBeNull();
        expect(sanitizeArchivedChat({ ...chat(1), time: 'x' })).toBeNull();
    });

    it('가려진 채팅의 본문은 받지 않고, 모르는 값은 정리한다', () => {
        expect(sanitizeArchivedChat({ ...chat(1), hidden: true, text: '원문' })).toMatchObject({ text: '', hidden: true });
        expect(sanitizeArchivedChat({ ...chat(1), kind: 'evil', marker: 'red;x', badges: ['https://x/a.png', 1] }))
            .toMatchObject({ kind: 'chat', badges: ['https://x/a.png'] });
        // 트위치 배지 식별자(이미지 주소가 아님)는 받지 않는다
        expect(sanitizeArchivedChat({ ...chat(1), badges: ['subscriber/12', 'https://x/b.png'] })).toMatchObject({ badges: ['https://x/b.png'] });
        expect(sanitizeArchivedChat({ ...chat(1), marker: 'red;x' })).not.toHaveProperty('marker');
    });

    it('끊김 구간은 끝 시각이 있어야 하고, 채팅에는 끝 시각을 붙이지 않는다', () => {
        expect(sanitizeArchivedChat({ ...chat(1), kind: 'gap', until: 5 })).toMatchObject({ kind: 'gap', until: 5 });
        expect(sanitizeArchivedChat({ ...chat(1), kind: 'gap' })).toBeNull();
        expect(sanitizeArchivedChat({ ...chat(5), kind: 'gap', until: 1 })).toBeNull();
        expect(sanitizeArchivedChat({ ...chat(1), until: 5 })).not.toHaveProperty('until');
    });
});

describe('내보내기', () => {
    it('CSV: 첫 줄에 면책 문구, 쉼표·따옴표 처리, 수식으로 읽히는 값 막기', () => {
        const csv = toCsv([chat(1, { nickname: 'a,b', text: '=SUM(1)', amount: 1000, kind: 'donation' })], 'live', '안내');
        const lines = csv.split('\r\n');
        expect(lines[0]).toBe('# 안내');
        expect(lines[2]).toContain('"a,b"');
        expect(lines[2]).toContain("'=SUM(1)");
        expect(lines[2]).toContain(',1000,');
    });

    it('TXT: 가려진 채팅은 이름표로', () => {
        const txt = toText([chat(1, { hidden: true, text: '' })], 'vod', '안내', '가려진 채팅', '연결 끊김');
        expect(txt.split('\n')).toEqual(['# 안내', '', '[0:00] 닉1: 가려진 채팅']);
    });

    it('끊김 구간은 시작 ~ 끝으로', () => {
        const gap = chat(0, { kind: 'gap', nickname: '', text: '', time: 65_000, until: 125_000 });
        expect(toText([gap], 'vod', '안내', '가려진 채팅', '연결 끊김').split('\n')[2]).toBe('[1:05 ~ 2:05] 연결 끊김');
        expect(toCsv([gap], 'vod', '안내').split('\r\n')[2]).toBe('1:05,gap,,~ 2:05,,');
    });

    it('다시보기 시각은 영상 안의 위치', () => {
        expect(formatArchiveTime({ time: 3_725_000 }, 'vod')).toBe('1:02:05');
        expect(formatArchiveTime({ time: 65_000 }, 'vod')).toBe('1:05');
    });
});

describe('상한과 페이지 단위 읽기', () => {
    beforeEach(async () => { await clearArchive(); });

    it('상한을 넘으면 가장 오래 보관한 것부터 지운다', async () => {
        const now = Date.now();
        await putArchivedChats([1, 2, 3, 4, 5].map(n => chat(n, { savedAt: now - (10 - n) * 1000 })));
        await purgeArchive(30, now, 3);
        expect((await getArchivedChats(CH)).map(c => c.time)).toEqual([3, 4, 5]);
    });

    it('최신부터 한 페이지씩 읽는다', async () => {
        await putArchivedChats(Array.from({ length: 25 }, (_, i) => chat(i + 1)));
        expect(await countArchivedChats(CH)).toBe(25);
        const p1 = await queryArchivedChats(CH, { offset: 0, limit: 10 });
        expect(p1.total).toBe(25);
        expect(p1.items.map(c => c.time)).toEqual([25, 24, 23, 22, 21, 20, 19, 18, 17, 16]);
        const p3 = await queryArchivedChats(CH, { offset: 20, limit: 10 });
        expect(p3.items.map(c => c.time)).toEqual([5, 4, 3, 2, 1]);
    });

    it('거를 때는 맞는 것만 세고 그 안에서 페이지를 나눈다', async () => {
        await putArchivedChats(Array.from({ length: 25 }, (_, i) => chat(i + 1, { badges: i % 2 ? ['b'] : [] })));
        const r = await queryArchivedChats(CH, { offset: 5, limit: 3, match: c => c.badges.includes('b') });
        expect(r.total).toBe(12);
        expect(r.items.map(c => c.time)).toEqual([14, 12, 10]);
    });

    it('하나씩 훑는다', async () => {
        await putArchivedChats([chat(2), chat(1)]);
        const seen: number[] = [];
        await eachArchivedChat(CH, c => seen.push(c.time));
        expect(seen).toEqual([1, 2]);
    });
});
