/**
 * 10분마다(pull 1분 뒤): OTA 파일이 jsDelivr에 닿았는지 본다. 판정은 ota-reach.ts.
 *
 * 확장은 jsDelivr의 master 주소에서 선택자와 배지 목록을 받는다. jsDelivr는 최대 12시간 옛 파일을 내므로
 * 리포(ovm이 막 pull한 master)와 다르면 바로 purge하고 30초 뒤 다시 본다. purge는 같은 리포 버전에 한 번만.
 * 새 빌드용 선택자가 새 rev로 닿으면 canary, main, vod를 바로 띄워 고친 선택자를 실제 방송과 확장으로 확인한다.
 *
 * 상태: watch/ota.json, 보고서: watch/checks/ota.json
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { TARGETS, judgeOta, newlyReached, nextState, type FileState, type OtaTarget } from './ota-reach.ts';
import { REPO, attempt, fetchText, isError, readJson, spawnJobs, writeCheck, writeJson } from './state.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CDN = `https://cdn.jsdelivr.net/gh/${REPO}@master`;
const PURGE = `https://purge.jsdelivr.net/gh/${REPO}@master`;
const RECHECK_MS = 30_000;
/** 새 선택자가 닿으면 바로 띄울 작업 */
const FOLLOW_UP = ['canary', 'main', 'vod'];

/** rev 숫자, 또는 JSON 내용 해시 (줄바꿈, 공백 차이는 무시) */
function versionOf(t: OtaTarget, text: string): string {
    const json = JSON.parse(text) as { rev?: number };
    if (t.kind === 'rev') return String(json.rev);
    return createHash('sha256').update(JSON.stringify(json)).digest('hex').slice(0, 16);
}

async function cdnVersion(t: OtaTarget): Promise<string> {
    return versionOf(t, await fetchText(`${CDN}/${t.path}`));
}

async function main(): Promise<void> {
    const prev = readJson<Record<string, FileState>>('ota') ?? {};
    const states: Record<string, FileState> = {};
    const now = Date.now();
    let purgedAny = false;
    for (const t of TARGETS) {
        const repo = versionOf(t, readFileSync(join(REPO_ROOT, t.path), 'utf8'));
        let cdn = await attempt(() => cdnVersion(t));
        let purged: string | undefined;
        const purgedFor = prev[t.name]?.repo === repo ? prev[t.name].purgedFor : undefined;
        if (!isError(cdn) && nextState(prev[t.name], t, { repo, cdn }, now).diffSince !== undefined && purgedFor !== repo) {
            const res = await attempt(() => fetchText(`${PURGE}/${t.path}`));
            console.log(`[ota] ${t.name} 리포 ${repo}, jsDelivr ${cdn}: purge ${isError(res) ? `실패 ${res.error}` : '요청'}`);
            if (!isError(res)) {
                purged = repo;
                purgedAny = true;
                await new Promise((r) => setTimeout(r, RECHECK_MS));
                cdn = await attempt(() => cdnVersion(t));
            }
        }
        states[t.name] = nextState(prev[t.name], t, isError(cdn) ? { repo, error: cdn.error, purged } : { repo, cdn, purged }, now);
        if (t.name === 'selectors' && newlyReached(prev[t.name], states[t.name], t)) {
            console.log(`[ota] 선택자 rev ${states[t.name].cdn} 도달, ${FOLLOW_UP.join(', ')} 띄움`);
            spawnJobs(FOLLOW_UP);
        }
    }
    writeJson('ota', states);
    writeCheck(judgeOta(states, Date.now(), now));
    console.log(`[ota] ${new Date().toISOString()} ${TARGETS.map((t) => `${t.name} ${states[t.name].repo}/${states[t.name].cdn ?? '-'}${states[t.name].diffSince ? ' 뒤처짐' : ''}`).join(', ')}${purgedAny ? ' (purge 함)' : ''}`);
}

main().catch((err) => {
    console.error(`[ota] ${new Date().toISOString()}`, err);
    process.exit(1);
});
