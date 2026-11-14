/**
 * 상황실. 확인 작업이 끝날 때마다 run.sh가 부른다(겹치지 않게 잠금). 감시 알림은 여기서만 보낸다.
 *
 * 1. watch/checks/*.json 보고서를 전부 읽는다
 * 2. 장부(watch/incidents.json)와 맞춰 보낼 알림을 정한다 (규칙은 incidents.ts)
 * 3. 긴급(깨짐, 위험)은 DISCORD_URGENT_WEBHOOK으로, 깨짐이면 DISCORD_MENTION_USER_ID를 멘션한다.
 *    참고(배포 감지, 새 배지, 회복 등)는 DISCORD_COMMUNITY_WEBHOOK으로
 * 4. 보낸 알림을 alerts.jsonl에 한 줄씩 남기고 장부를 저장한다
 *
 * 보내다 실패하면 장부를 저장하지 않는다. 다음 실행이 같은 알림을 다시 보낸다.
 * --dry-run: 보낼 알림을 출력만 하고 장부, 기록을 건드리지 않는다.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { DRY_RUN, postDiscord } from '../common.ts';
import { formatAlerts, reconcile, type CheckReport, type Ledger } from './incidents.ts';
import { WATCH_DIR, readJson, writeJson } from './state.ts';

const CHECKS_DIR = join(WATCH_DIR, 'checks');
const ALERTS_LOG = join(WATCH_DIR, '../alerts.jsonl');
const DASHBOARD_URL = 'http://192.168.1.162:3400';

function readReports(): CheckReport[] {
    if (!existsSync(CHECKS_DIR)) return [];
    return readdirSync(CHECKS_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(readFileSync(join(CHECKS_DIR, f), 'utf8')) as CheckReport);
}

async function main(): Promise<void> {
    const now = Date.now();
    const prev = readJson<Ledger>('incidents');
    const { ledger, alerts } = reconcile(prev, readReports(), now);

    if (alerts.length) {
        const { urgent, normal, mention } = formatAlerts(alerts, now, DASHBOARD_URL);
        const community = process.env.DISCORD_COMMUNITY_WEBHOOK;
        if (urgent.length) await postDiscord(process.env.DISCORD_URGENT_WEBHOOK || community, urgent, mention ? process.env.DISCORD_MENTION_USER_ID : undefined);
        if (normal.length) await postDiscord(community, normal);
    }
    if (!DRY_RUN) {
        if (alerts.length) appendFileSync(ALERTS_LOG, alerts.map((a) => JSON.stringify(a)).join('\n') + '\n');
        writeJson('incidents', ledger);
    }
    console.log(`[dispatch] ${new Date(now).toISOString()} ${prev ? '' : '장부 새로 만듦, '}열린 사건 ${Object.keys(ledger.open).length}, 알림 ${alerts.map((a) => `${a.state} ${a.key}`).join(', ') || '없음'}`);
}

main().catch((err) => {
    console.error(`[dispatch] ${new Date().toISOString()}`, err);
    process.exit(1);
});
