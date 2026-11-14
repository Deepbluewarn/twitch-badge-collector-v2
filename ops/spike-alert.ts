/**
 * 급증 확인. 최근 30분 스토어 상세 페이지 방문자가 THRESHOLD를 넘으면 보고서(watch/checks/spike.json)에
 * 참고 사건으로 남긴다. 상황실이 알린다. ovm crontab에서 30분마다 돈다.
 * 한 번 넘으면 COOLDOWN 동안 같은 사건으로 둔다(그동안 다시 넘어도 새로 알리지 않는다).
 *
 * 실시간 API는 유입 경로를 주지 않아서 국가별 인원만 담는다. 경로는 다음 날 리포트에서 본다.
 *
 * 플래그:
 *  --dry-run  기준과 상관없이 지금 수치를 출력. 상태 파일, 보고서를 건드리지 않는다.
 */
import { DRY_RUN, STORE, loadState, realtime, saveState } from './common.ts';
import { writeCheck } from './watch/state.ts';

const THRESHOLD = 20;
const COOLDOWN = 6 * 3_600_000;

async function main(): Promise<void> {
    const rows = await realtime(STORE, ['country'], ['activeUsers']);
    const total = rows.reduce((sum, r) => sum + r.mets[0], 0);
    const countries = rows
        .sort((a, b) => b.mets[0] - a.mets[0])
        .slice(0, 5)
        .map(({ dims: [c], mets: [n] }) => `${c} ${n}`)
        .join(', ');
    const title = `스토어 방문 급증: 최근 30분 ${total}명 (${countries})`;
    if (DRY_RUN) {
        console.log(title);
        return;
    }

    const now = Date.now();
    let state = loadState();
    const cooling = state.lastSpikeAt !== undefined && now - state.lastSpikeAt < COOLDOWN;
    if (total >= THRESHOLD && !cooling) {
        state = { ...state, lastSpikeAt: now, lastSpikeTitle: title };
        saveState(state);
    }
    const active = state.lastSpikeAt !== undefined && now - state.lastSpikeAt < COOLDOWN;
    writeCheck({
        check: 'spike',
        at: now,
        status: active ? 'issue' : 'ok',
        findings: active ? [{ key: `spike:${state.lastSpikeAt}`, level: 'info', title: state.lastSpikeTitle ?? title }] : [],
    });
}

main().catch((err) => {
    console.error(`[spike] ${new Date().toISOString()}`, err);
    process.exit(1);
});
