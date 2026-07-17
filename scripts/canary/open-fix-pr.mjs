/**
 * canary-autofix.json 읽어서 bundled-selectors.prod.json 갱신 → draft PR 생성.
 * GitHub Actions 안에서 실행. gh CLI로 PR 오픈.
 *
 * class hash rotation 케이스만 처리 — 앞 word 같고 hash suffix만 다른 selector 치환.
 * 여러 selector에서 같은 word를 공유할 경우 (예: displayName, usernameContainer 둘 다
 * `_container_zw6kq_` 사용) 자연스레 함께 치환됨.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const AUTOFIX_FILE = join(REPO_ROOT, 'canary-autofix.json');
const MANIFEST_FILE = join(REPO_ROOT, 'src/platform/bundled-selectors.prod.json');

if (!existsSync(AUTOFIX_FILE)) {
    console.log('canary-autofix.json 없음 — skip');
    process.exit(0);
}

const autofix = JSON.parse(readFileSync(AUTOFIX_FILE, 'utf-8'));
const candidates = autofix.candidates ?? [];
if (candidates.length === 0) {
    console.log('후보 없음 — skip');
    process.exit(0);
}

const manifest = JSON.parse(readFileSync(MANIFEST_FILE, 'utf-8'));
const oldRev = manifest.rev;
manifest.rev = oldRev + 1;

// chzzk selectors만 대상 (canary가 chzzk 전용)
const chzzk = manifest.platforms.chzzk.selectors;
const applied = [];
for (const c of candidates) {
    if (chzzk[c.selectorName] === c.oldSelector) {
        chzzk[c.selectorName] = c.newSelector;
        applied.push(c);
    }
}
if (applied.length === 0) {
    console.log('현재 manifest와 매칭 안 됨 — 이미 fix된 상태이거나 stale. skip');
    process.exit(0);
}

writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + '\n');

const branch = `canary/autofix-rev${manifest.rev}`;
const runCmd = (cmd) => {
    console.log(`$ ${cmd}`);
    execSync(cmd, { stdio: 'inherit', cwd: REPO_ROOT });
};

runCmd('git config user.name "github-actions[bot]"');
runCmd('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');
runCmd(`git checkout -b ${branch}`);
runCmd('git add src/platform/bundled-selectors.prod.json');
const commitMsg = `chore(canary): chzzk selector auto-fix rev ${manifest.rev}\n\n` +
    applied.map(c => `- ${c.selectorName}: ${c.reason}`).join('\n');
runCmd(`git commit -m ${JSON.stringify(commitMsg)}`);
runCmd(`git push -u origin ${branch}`);

const prBody = [
    '## Chzzk canary auto-fix',
    '',
    `Canary 봇이 chzzk DOM에서 class hash rotation 감지 → rev ${oldRev} → ${manifest.rev} bump.`,
    '',
    '### 적용된 치환',
    ...applied.map(c => `- \`${c.selectorName}\`\n  - reason: ${c.reason}\n  - new selector: \`${c.newSelector}\``),
    '',
    `**URL**: ${autofix.url}`,
    `**capturedAt**: ${autofix.capturedAt}`,
    '',
    '⚠️ **Draft PR입니다.** merge 전에:',
    '1. 로컬에서 dev build → 실 chzzk 페이지에서 채팅 수집 확인',
    '2. 다른 필터 (배지/닉네임 기반) 동작 확인',
    '3. approve + merge → jsDelivr 캐시 갱신 후 사용자 자동 배포',
].join('\n');

runCmd(`gh pr create --draft --title "chore(canary): chzzk selector auto-fix rev ${manifest.rev}" --body ${JSON.stringify(prBody)} --base master`);
console.log('draft PR 생성 완료');
