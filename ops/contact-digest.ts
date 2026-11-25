/**
 * 익명 문의 주간 묶음. badgecollector.dev/api/contact가 Analytics Engine(tbc_contact)에 쓴 지난 7일치를 읽어
 * Jev로 욕설과 스팸을 거르고 나머지를 Discord로 한 번에 보낸다. 욕설, 스팸은 건수만 적는다.
 * 문의가 없는 주에는 아무것도 보내지 않는다.
 *
 * 문의 내용은 Analytics Engine에서 90일 뒤 지워진다. 여기서는 따로 남기지 않는다.
 * 열 순서는 사이트 리포 functions/api/contact.ts: blob1 = 내용, blob2 = 확장 버전, blob3 = 브라우저
 *
 * env: cloudflare.env (CF_ACCOUNT_ID, CF_ANALYTICS_TOKEN), community-watch.env (TYPESAFE_API_KEY, DISCORD_COMMUNITY_WEBHOOK)
 * --dry-run: Discord 대신 콘솔에 출력
 */
import { noul, TypeSafeClient } from '@typesafe-ai/sdk';
import { kstDate, sendDiscord } from './common.ts';
import { sql } from './usage-report.ts';

const DAYS = 7;
const MODEL = 'jev-1.13.0';
const DROP_AT = 0.5;

// Jev는 영어가 주 학습 언어라 질문은 영어로, 문의 본문은 원문 그대로 넣는다.
const QUESTIONS = {
    abusive: noul('Is `message` mainly insults, profanity, or harassment aimed at the developer or others, with no real request or report?', {
        true: 'Insulting or harassing, nothing to act on',
        false: 'Has a real question, bug report, request, or opinion, even if rude',
    }),
    spam: noul('Is `message` spam: an ad, a link drop, random characters, a test, or something unrelated to the browser extension?', {
        true: 'Ad, gibberish, test, or unrelated',
        false: 'About the extension or its use',
    }),
};

interface Contact {
    at: string;
    text: string;
    v: string;
    b: string;
}

// 데이터셋은 첫 문의가 들어올 때 생긴다. 그 전엔 SQL API가 열을 못 찾는다며 422를 낸다
async function fetchContacts(): Promise<Awaited<ReturnType<typeof sql>>> {
    try {
        return await sql(`SELECT timestamp AS at, blob1 AS text, blob2 AS v, blob3 AS b FROM tbc_contact
            WHERE timestamp > NOW() - INTERVAL '${DAYS}' DAY ORDER BY timestamp`);
    } catch (e) {
        if (String(e).includes('unable to find type of column')) return [];
        throw e;
    }
}

async function main(): Promise<void> {
    const rows = await fetchContacts();
    const contacts = rows.map((r) => ({ at: String(r.at), text: String(r.text), v: String(r.v), b: String(r.b) }));
    console.log(`[contact] 지난 ${DAYS}일 문의 ${contacts.length}건`);
    if (contacts.length === 0) return;

    const client = new TypeSafeClient({ defaultModel: MODEL });
    const kept: Contact[] = [];
    let dropped = 0;
    for (const c of contacts) {
        const { answers } = await client.systemOne({ state: { message: c.text }, questions: QUESTIONS });
        if (answers.abusive.noul >= DROP_AT || answers.spam.noul >= DROP_AT) dropped++;
        else kept.push(c);
    }

    const lines = [`**익명 문의 (지난 ${DAYS}일 ${kept.length}건${dropped ? `, 욕설, 스팸 ${dropped}건 뺌` : ''})**`];
    for (const c of kept) {
        const meta = [kstDate(Date.parse(`${c.at.replace(' ', 'T')}Z`)), c.v && `v${c.v}`, c.b].filter(Boolean).join(' · ');
        lines.push(`${meta}\n> ${c.text.slice(0, 1500).replace(/\n/g, '\n> ')}`);
    }
    await sendDiscord(lines);
}

await main();
