/**
 * 확장 익명 사용 통계를 모아 현황판에 넘긴다 (ops/usage-report.ts). 5분마다.
 * 기록은 늦게 오므로 어제 숫자도 며칠 동안 바뀐다.
 *
 * 같이 실제 사용자 수집 비율을 판정해 보고서(checks/collect.json)를 남긴다 (collect.ts).
 */
import { kstDate } from '../common.ts';
import { fetchCollect, fetchUsage } from '../usage-report.ts';
import { collectTarget, judgeCollect } from './collect.ts';
import { attempt, isError, writeCheck, writeJson } from './state.ts';

const result = await attempt(() => fetchUsage(kstDate(Date.now() - 86_400_000)));
writeJson('usage', result);
console.log(`[usage] ${new Date().toISOString()} ${'error' in result ? result.error : `${result.days}일치`}`);

const now = Date.now();
const target = collectTarget(kstDate(now), new Date(now + 9 * 3_600_000).getUTCHours());
const collect = await attempt(fetchCollect);
const report = isError(collect) ? { check: 'collect', at: now, status: 'error' as const, note: collect.error, findings: [] } : judgeCollect(collect.rows, target, now, collect.releasedAt);
writeCheck(report);
console.log(`[collect] ${target} ${report.status}${report.note ? ` (${report.note})` : ''} ${report.findings.map((f) => f.title).join(', ')}`);

if ('error' in result || isError(collect)) process.exit(1);
