/**
 * 급증 알림 — 최근 30분 스토어 상세 페이지 방문자가 THRESHOLD를 넘으면 바로 Discord로 보낸다.
 * ovm crontab에서 30분마다 돈다. 한 번 보내면 COOLDOWN 동안은 다시 보내지 않는다.
 *
 * 실시간 API는 유입 경로를 주지 않아서 국가별 인원만 담는다. 경로는 다음 날 리포트에서 본다.
 *
 * 플래그:
 *  --dry-run  Discord로 보내지 않고 기준과 상관없이 지금 수치를 출력. 상태 파일도 건드리지 않는다.
 */
import { DRY_RUN, STORE, loadState, realtime, saveState, sendDiscord } from './common.ts';

const THRESHOLD = 20;
const COOLDOWN = 6 * 3_600_000;

async function main(): Promise<void> {
    const rows = await realtime(STORE, ['country'], ['activeUsers']);
    const total = rows.reduce((sum, r) => sum + r.mets[0], 0);
    const state = loadState();
    const cooling = state.lastSpikeAt !== undefined && Date.now() - state.lastSpikeAt < COOLDOWN;
    if (!DRY_RUN && (total < THRESHOLD || cooling)) return;

    const countries = rows
        .sort((a, b) => b.mets[0] - a.mets[0])
        .slice(0, 5)
        .map(({ dims: [c], mets: [n] }) => `${c} ${n}`)
        .join(', ');
    await sendDiscord([`**스토어 방문 급증**: 최근 30분 ${total}명 (${countries})`]);
    if (!DRY_RUN) saveState({ ...state, lastSpikeAt: Date.now() });
}

main().catch((err) => {
    console.error(`[spike] ${new Date().toISOString()}`, err);
    process.exit(1);
});
