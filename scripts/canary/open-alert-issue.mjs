/**
 * canary-alert.json 읽어서 GitHub Issue를 열거나(없으면) 기존 이슈에 코멘트를 붙인다.
 * GitHub Actions 안에서 gh CLI로 실행.
 *
 * 왜 필요한가: canary는 rev 13 사고를 최초 감지부터 사용자 리포트까지 18시간 동안
 * 4회 연속 잡아냈지만, 알림 경로가 Discord webhook 하나뿐이라 아무 조치도 트리거되지
 * 않았고 저장소엔 흔적조차 없었다. 이슈로 남기면 (1) 놓쳐도 목록에 남고 (2) triage
 * 라벨로 상태 추적이 되고 (3) 사람이 손으로 고칠 때 검증된 후보를 바로 참조한다.
 *
 * 스팸 방지: 같은 라벨의 열린 이슈가 있으면 새로 만들지 않고 코멘트만 추가.
 */
import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const ALERT_FILE = join(REPO_ROOT, 'canary-alert.json');
const LABEL = 'canary';

if (!existsSync(ALERT_FILE)) {
    console.log('canary-alert.json 없음 — skip');
    process.exit(0);
}

const alert = JSON.parse(readFileSync(ALERT_FILE, 'utf-8'));

function gh(args, opts = {}) {
    return execFileSync('gh', args, { encoding: 'utf-8', cwd: REPO_ROOT, ...opts }).trim();
}

// 없는 라벨로 이슈를 만들면 gh가 실패하므로 미리 보장한다. 이미 있으면 create가
// 에러를 내는데 그건 정상 경로.
for (const [name, desc, color] of [
    [LABEL, 'chzzk/twitch selector canary 자동 감지', 'B60205'],
    ['ready-for-agent', '에이전트가 바로 착수 가능', '0E8A16'],
]) {
    try {
        gh(['label', 'create', name, '--description', desc, '--color', color]);
        console.log(`라벨 ${name} 생성`);
    } catch { /* 이미 존재 */ }
}

const bodyParts = [];
bodyParts.push('> chzzk canary가 자동 생성한 이슈입니다.');
bodyParts.push('');
bodyParts.push(alert.body ?? '');
bodyParts.push('');

if (Array.isArray(alert.autoFixCandidates) && alert.autoFixCandidates.length > 0) {
    bodyParts.push('## 자동 수정 PR 대상');
    for (const c of alert.autoFixCandidates) {
        bodyParts.push(`- \`${c.selectorName}\`: ${c.reason}`);
        bodyParts.push(`  - \`${c.oldSelector}\``);
        bodyParts.push(`  - → \`${c.newSelector}\``);
    }
    bodyParts.push('');
}

const needManual = (alert.brokenRequired ?? []).filter(b => (b.candidates ?? []).length === 0);
if (needManual.length > 0) {
    bodyParts.push('## 사람이 봐야 하는 selector');
    bodyParts.push('_라이브 DOM에서 검증 통과한 대체 후보가 없었습니다 — 구조 변경일 가능성._');
    for (const b of needManual) {
        bodyParts.push(`- \`${b.name}\`: \`${b.selector}\``);
    }
    bodyParts.push('');
}

bodyParts.push('## 조치');
bodyParts.push('1. `docs/ota-selectors.md` 절차대로 `bundled-selectors.prod.json` + `bundled-selectors.json` 갱신');
bodyParts.push('2. `rev` +1 (strict monotonic)');
bodyParts.push('3. master 푸시 후 jsDelivr purge');
bodyParts.push('');
bodyParts.push(`- 대표 URL: ${alert.url ?? '-'}`);
bodyParts.push(`- 감지 시각: ${alert.capturedAt ?? '-'}`);

const body = bodyParts.join('\n');
const title = alert.title ?? 'chzzk canary: selector 이상';

// 같은 라벨의 열린 이슈 조회
let open = [];
try {
    open = JSON.parse(gh(['issue', 'list', '--label', LABEL, '--state', 'open', '--json', 'number,title', '--limit', '10']));
} catch (e) {
    console.log('이슈 조회 실패 — 새로 생성 시도:', String(e).slice(0, 200));
}

if (open.length > 0) {
    const n = open[0].number;
    gh(['issue', 'comment', String(n), '--body', body]);
    console.log(`기존 이슈 #${n}에 코멘트 추가 (중복 생성 방지)`);
} else {
    const url = gh(['issue', 'create', '--title', title, '--body', body, '--label', LABEL, '--label', 'ready-for-agent']);
    console.log('이슈 생성:', url);
}
