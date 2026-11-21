/**
 * 방송 언급 감시. 시청자 많은 치지직 라이브 채팅을 계속 듣다가 확장 이름이 나오면 기록하고 상황실이 알리게 한다.
 * 스토어 방문이 새벽에 한꺼번에 몰리는데(2026-11-15, 11-18, 11-21) 경로가 구글과 direct로 섞여 있어
 * 어느 방송에서 소개됐는지 알 수 없었다. 그걸 그 시각에 잡으려고 만들었다.
 *
 * 상주 서비스(ops/systemd/badge-mentions.service). CYCLE마다 인기 라이브 TOP개를 다시 골라 붙는다.
 * 채팅 본문은 언급으로 판정된 것만, 닉네임과 사용자 ID 없이 남긴다. 판정 규칙은 mention-match.ts.
 *
 * 남기는 것 (~/.local/state/badge-collector/)
 *  - mentions.jsonl            언급마다 한 줄 (추가만)
 *  - watch/checks/mention.json 최근 KEEP 안의 언급 묶음 (참고 사건 mention:<채널>:<한국 시각 시>)
 *  - runs/mentions.json        CYCLE마다 성공 기록. heartbeat가 멈춤을 잡는다
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { collectChat, discoverLives, type LiveTarget } from '../../scripts/capture/socket-client.ts';
import { matchMention, mentionFindings, type Mention } from './mention-match.ts';
import { writeCheck } from './state.ts';

const TOP = 40;
const CYCLE = 20 * 60_000;
/** 이만큼 지난 언급은 보고서에서 뺀다(참고 사건이라 사라져도 알리지 않는다) */
const KEEP = 6 * 3_600_000;
const CHAT = 93101;

const STATE = join(homedir(), '.local/state/badge-collector');
const LOG = join(STATE, 'mentions.jsonl');
const RUN = join(STATE, 'runs/mentions.json');

let recent: Mention[] = loadRecent();
let chats = 0;

function loadRecent(): Mention[] {
    if (!existsSync(LOG)) return [];
    const since = Date.now() - KEEP;
    return readFileSync(LOG, 'utf8').trim().split('\n').slice(-500).flatMap((line) => {
        try {
            const m = JSON.parse(line) as Mention;
            return m.at >= since ? [m] : [];
        } catch {
            return [];
        }
    });
}

function report(): void {
    recent = recent.filter((m) => m.at >= Date.now() - KEEP);
    const findings = mentionFindings(recent);
    writeCheck({ check: 'mention', at: Date.now(), status: findings.length ? 'issue' : 'ok', findings });
}

function onRaw(live: LiveTarget, raw: string): void {
    let p: { cmd?: number; bdy?: unknown };
    try {
        p = JSON.parse(raw);
    } catch {
        return;
    }
    if (p.cmd !== CHAT || !Array.isArray(p.bdy)) return;
    for (const r of p.bdy as { msg?: unknown; msgTime?: unknown }[]) {
        chats++;
        if (typeof r.msg !== 'string') continue;
        const strength = matchMention(r.msg);
        if (!strength) continue;
        const m: Mention = {
            at: typeof r.msgTime === 'number' ? r.msgTime : Date.now(),
            channelId: live.channelId,
            channelName: live.channelName,
            viewers: live.viewers,
            category: live.category,
            strength,
            text: r.msg.replace(/\s+/g, ' ').slice(0, 200),
        };
        appendFileSync(LOG, JSON.stringify(m) + '\n');
        recent.push(m);
        console.log(`[mention] ${strength} ${live.channelName}: ${m.text}`);
        if (strength === 'strong') report();
    }
}

async function cycle(): Promise<void> {
    const start = Date.now();
    const until = start + CYCLE;
    const lives = await discoverLives(TOP);
    chats = 0;
    const joined = await Promise.allSettled(lives.map((l) => collectChat(l.chatChannelId!, until, (raw) => onRaw(l, raw))));
    const ok = joined.filter((r) => r.status === 'fulfilled').length;
    console.log(`[mentions] 방송 ${ok}/${lives.length}개에 붙음 (시청 ${lives.at(-1)?.viewers ?? 0}명 이상)`);
    report();
    await new Promise((r) => setTimeout(r, Math.max(0, until - Date.now()) + 2000));
    const found = recent.filter((m) => m.at >= start).length;
    console.log(`[mentions] ${new Date().toISOString()} 채팅 ${chats}건, 언급 ${found}건`);
    if (ok === 0) throw new Error('붙은 방송이 없다');
    writeFileSync(RUN, JSON.stringify({ job: 'mentions', start: Math.floor(start / 1000), end: Math.floor(Date.now() / 1000), code: 0, lastOk: Math.floor(Date.now() / 1000) }) + '\n');
}

async function main(): Promise<void> {
    mkdirSync(join(STATE, 'runs'), { recursive: true });
    report();
    for (;;) {
        try {
            await cycle();
        } catch (e) {
            // 목록, 토큰을 못 받았다. 잠깐 쉬고 다시. 계속되면 runs 기록이 낡아 heartbeat가 알린다
            console.error(`[mentions] ${new Date().toISOString()}`, e);
            await new Promise((r) => setTimeout(r, 60_000));
        }
    }
}

main();
