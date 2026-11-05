/**
 * 확장 익명 사용 통계를 모아 현황판에 넘긴다 (ops/usage-report.ts). 3시간마다.
 * 기록은 늦게 오므로 어제 숫자도 며칠 동안 바뀐다.
 */
import { kstDate } from '../common.ts';
import { fetchUsage } from '../usage-report.ts';
import { attempt, writeJson } from './state.ts';

const result = await attempt(() => fetchUsage(kstDate(Date.now() - 86_400_000)));
writeJson('usage', result);
console.log(`[usage] ${new Date().toISOString()} ${'error' in result ? result.error : `${result.days}일치`}`);
if ('error' in result) process.exit(1);
