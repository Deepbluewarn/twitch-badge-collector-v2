/**
 * 검사 결과(live, bundle, info)를 모아 판정을 내리고 현황판 HTML을 쓴다. 검사가 끝날 때마다 부른다.
 *
 * 판정
 *  - 깨짐: 실제 확장 시험에서 방송엔 채팅이 있는데 모아보기 창이 비었다, 또는 canary가 깨짐을 찾았다
 *  - 위험: 확장이 기대던 이름이 번들에서 사라졌다, 시험 결과가 오래됐다, 감시 작업이 멈췄다
 *  - 정상: 그 밖
 * 판정이 바뀌거나 번들에 새 신호가 생기면 Discord로 알린다.
 *
 * 출력: ops/public/index.html (serve.ts가 LAN에 연다)
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { DRY_RUN, sendDiscord } from '../common.ts';
import type { Dependency, SignalDiff } from './bundle.ts';
import type { BundleResult, LiveResult } from './live-check.ts';
import type { CanaryResult } from './canary.ts';
import type { DeployState } from './deploy.ts';
import type { Heartbeat } from './heartbeat.ts';
import type { Ratio, UsageSummary } from '../usage-report.ts';
import { REPO, readJson, writeJson } from './state.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../public/index.html');
const DASHBOARD_URL = 'http://192.168.1.162:3400';
const LIVE_STALE_MS = 13 * 3_600_000;

type Level = 'ok' | 'risk' | 'broken';
const LEVEL_LABEL: Record<Level, string> = { ok: '정상', risk: '위험', broken: '깨짐' };

type Err = { error: string };
type Info = {
    at: number;
    stores: Err | {
        chrome: Err | { users: string | null; rating: number | null; ratingCount: number | null; version: string | null; updated: string | null };
        firefox: Err | { users: string; rating: number; ratingCount: number; version: string; updated: string };
        release: Err | { version: string; published: string };
    };
    github: Err | {
        runs: ({ file: string; name: string; error: string } | { file: string; name: string; conclusion: string | null; at: string | null; url: string; recent: (string | null)[] })[];
        issues: Err | { number: number; title: string; url: string; labels: string[]; created: string }[];
    };
    badges: Err | {
        listed: number;
        common: number;
        unlisted: BadgeView[];
        recent: BadgeView[];
        subscriptionRecent: number;
    };
    ga: Err | { date: string; visits: number; installs: number; siteUsers: number; siteViews: number }[];
};
type BadgeView = { badgeId: string; scope: string; imageUrl: string; firstSeen: number; lastSeen: number; sightings: number; channels: number };

const isErr = (x: unknown): x is Err => !!x && typeof x === 'object' && 'error' in x;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** 모든 시각은 한국 시간 MM-DD HH:mm 하나로 */
const time = (ms: number | string | null | undefined) => {
    if (ms == null) return '-';
    const iso = new Date(new Date(ms).getTime() + 9 * 3_600_000).toISOString();
    return `${iso.slice(5, 10)} ${iso.slice(11, 16)}`;
};
const ago = (ms: number) => {
    const m = Math.round((Date.now() - ms) / 60_000);
    return m < 60 ? `${m}분 전` : m < 48 * 60 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
};

interface Reason {
    level: Level;
    text: string;
}

interface Extra {
    deploy?: DeployState;
    canaries: CanaryResult[];
    heartbeat?: Heartbeat;
    usage?: UsageSummary | Err;
}
const CANARY_LABEL = { selector: '선택자 카나리', socket: '소켓 카나리' } as const;

function judge(live: LiveResult | undefined, bundle: BundleResult | undefined, info: Info | undefined, extra: Extra): Reason[] {
    const reasons: Reason[] = [];
    for (const c of extra.canaries) {
        if (c.status === 'broken') reasons.push({ level: 'broken', text: `${CANARY_LABEL[c.kind]}: ${c.problems[0] ?? '깨짐'}` });
        else if (c.status === 'error') reasons.push({ level: 'risk', text: `${CANARY_LABEL[c.kind]} 실행 실패` });
    }
    for (const j of extra.heartbeat?.jobs.filter((x) => x.stale) ?? []) reasons.push({ level: 'risk', text: `감시 멈춤: ${j.label}` });
    for (const s of extra.heartbeat?.services.filter((x) => x.state !== 'active') ?? []) reasons.push({ level: 'risk', text: `서비스 ${s.name}: ${s.state}` });
    if (extra.deploy?.error) reasons.push({ level: 'risk', text: `배포 감지 실패: ${extra.deploy.error}` });
    if (!live) reasons.push({ level: 'risk', text: '확장 시험 결과 없음' });
    else {
        if (Date.now() - live.at > LIVE_STALE_MS) reasons.push({ level: 'risk', text: `확장 시험이 ${ago(live.at)} 결과` });
        if (live.error) reasons.push({ level: 'risk', text: `확장 시험 실패: ${live.error}` });
        for (const r of live.runs) {
            if (r.verdict === 'broken') reasons.push({ level: 'broken', text: `${r.name}: 방송 채팅 ${r.host}줄, 모아보기 0줄` });
            else if (r.verdict === 'unknown') reasons.push({ level: 'risk', text: `${r.name}: 판정 못 함${r.error ? ` (${r.error})` : ' (방송 채팅 없음)'}` });
        }
    }
    if (info && !isErr(info.github)) {
        for (const run of info.github.runs) {
            if ('error' in run) continue;
            if (run.conclusion === 'failure') reasons.push({ level: 'broken', text: `GitHub ${run.name} 실패` });
        }
    }
    const gone = bundle?.dependencies.filter((d) => d.status === 'gone') ?? [];
    if (gone.length) reasons.push({ level: 'risk', text: `번들에서 사라진 이름 ${gone.length}개: ${gone.map((d) => d.name).join(', ')}` });
    return reasons;
}

function levelOf(reasons: Reason[]): Level {
    return reasons.some((r) => r.level === 'broken') ? 'broken' : reasons.length ? 'risk' : 'ok';
}

function diffLines(diff: SignalDiff): string[] {
    const lines: string[] = [];
    for (const [kind, items] of Object.entries(diff.added)) lines.push(`+ ${kind}: ${items.join(', ')}`);
    for (const [kind, items] of Object.entries(diff.removed)) lines.push(`- ${kind}: ${items.join(', ')}`);
    return lines;
}

function riskPrompt(reasons: Reason[], live: LiveResult | undefined, bundle: BundleResult | undefined): string {
    const deps = bundle?.dependencies ?? [];
    return [
        '치지직, 트위치 현황판이 확장(twitch-badge-collector-v2) 상태를 아래처럼 판정했어. 확장 코드와 대조해서 실제로 깨졌는지, 깨질 위험이 있는지, 고친다면 어디를 어떻게 고칠지 알려줘.',
        '',
        '## 판정 근거',
        ...(reasons.length ? reasons.map((r) => `- [${LEVEL_LABEL[r.level]}] ${r.text}`) : ['- 없음']),
        '',
        '## 실제 확장 시험',
        live ? `버전 ${live.version}, ${time(live.at)}` : '없음',
        ...(live?.runs ?? []).map((r) => `- ${r.name}: ${r.verdict}, 방송 채팅 ${r.host}, 모아보기 ${r.pane}, 배지 이미지 있는 줄 ${r.paneWithBadge}${r.url ? `, ${r.url}` : ''}${r.error ? `, 오류 ${r.error}` : ''}`),
        '',
        '## 번들 의존 확인 (gone: 전에 있다가 사라짐, absent: 처음부터 못 찾음)',
        ...deps.filter((d) => d.status !== 'ok').map((d) => `- ${d.status} ${d.kind} ${d.name} (${d.where})${d.detail ? ` ${d.detail}` : ''}`),
        '',
        '관련 코드: src/platform/bundled-selectors.prod.json, src/platform/chzzk.ts, src/platform/chzzk-socket.ts, src/platform/twitch.ts. 선택자는 OTA로 고칠 수 있음(docs/ota-selectors.md).',
    ].join('\n');
}

function featurePrompt(bundle: BundleResult): string {
    return [
        '치지직 웹 번들에서 아래 변화가 감지됐어. 새 기능이나 바뀐 동작이 뭔지 추정하고, 확장(twitch-badge-collector-v2)이 대응해야 할 게 있는지 코드와 대조해서 알려줘.',
        '',
        ...bundle.history.slice(0, 10).flatMap((h) => [`## ${time(h.at)}`, ...diffLines(h.diff), '']),
        '## 지금 번들의 메시지 타입 enum',
        JSON.stringify(bundle.signals.msgTypes),
        '## 지금 번들의 소켓 cmd 표',
        JSON.stringify(bundle.signals.socketCmds),
        '',
        '관련 코드: src/platform/chzzk-socket.ts (CHZZK_CMD, CHZZK_MSG_TYPE), src/platform/chzzk.ts.',
    ].join('\n');
}

const copyButton = (id: string, text: string) =>
    `<button class="copy" data-target="${id}">프롬프트 복사</button><textarea id="${id}" class="prompt" readonly>${esc(text)}</textarea>`;

// 상태 표시는 탈리 램프 하나로 통일한다. 정상은 꺼진 불, 이상이 있을 때만 켜진다
const lamp = (level: Level | 'off', title = '') => `<span class="lamp ${level}"${title ? ` title="${esc(title)}"` : ''} aria-hidden="true"></span>`;
const statusCell = (level: Level, text = LEVEL_LABEL[level]) => `<span class="status ${level}">${lamp(level)}${esc(text)}</span>`;

/** 사람이 읽을 오류. 자주 나는 것은 원인과 할 일로 바꾼다 */
function humanError(e: string): string {
    if (/launchPersistentContext|browser has been closed/.test(e)) return '브라우저를 띄우지 못함. ovm에 Chromium 시스템 라이브러리가 없다 (docs/monitoring.md 남은 일)';
    return e;
}

/** 스토어마다 갱신일 표기가 달라 MM-DD로 맞춘다 */
function day(s: string | null | undefined): string {
    if (!s) return '-';
    const t = Date.parse(s);
    return Number.isNaN(t) ? s : time(t).slice(0, 5);
}

function mainChart(ga: { date: string; visits: number; installs: number; siteUsers: number }[]): string {
    const W = 720, H = 240, L = 44, R = 8, T = 12, B = 32;
    const max = Math.max(1, ...ga.map((d) => d.installs));
    const top = Math.ceil(max / 20) * 20;
    const step = (W - L - R) / ga.length;
    const bw = Math.min(28, step * 0.62);
    const y = (v: number) => T + (H - T - B) * (1 - v / top);
    const grid = [0, top / 2, top].map((v) => `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
    const bars = ga.map((d, i) => {
        const x = L + i * step + (step - bw) / 2;
        const h = Math.max(d.installs > 0 ? 2 : 0, y(0) - y(d.installs));
        const today = i === ga.length - 1;
        return `<g class="bar${today ? ' today' : ''}"><rect class="hit" x="${L + i * step}" y="${T}" width="${step}" height="${H - T - B}"/><rect x="${x}" y="${y(0) - h}" width="${bw}" height="${h}" rx="3"/><title>${d.date} 설치 ${d.installs}, 스토어 페이지 방문 ${d.visits}, badgecollector.dev 방문자 ${d.siteUsers}${today ? ' (오늘, 진행 중)' : ''}</title></g>`;
    }).join('');
    const labels = ga.map((d, i) => (i % 2 === (ga.length - 1) % 2 ? `<text class="axis" x="${L + i * step + step / 2}" y="${H - 8}" text-anchor="middle">${d.date.slice(5)}</text>` : '')).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="날짜별 스토어 설치">${grid}${bars}${labels}</svg>`;
}

const pct = (r: number) => { const p = r * 100; return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`; };

function usageChart(daily: UsageSummary['daily']): string {
    const W = 480, H = 200, L = 44, R = 20, T = 12, B = 28;
    const max = Math.max(1, ...daily.map((d) => d.users));
    const top = Math.ceil(max / 10) * 10;
    const step = (W - L - R) / daily.length;
    const bw = Math.min(14, step * 0.62);
    const y = (v: number) => T + (H - T - B) * (1 - v / top);
    const grid = [0, top / 2, top].map((v) => `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
    const bars = daily.map((d, i) => {
        const x = L + i * step + (step - bw) / 2;
        const h = Math.max(d.users > 0 ? 2 : 0, y(0) - y(d.users));
        const last = i === daily.length - 1;
        return `<g class="bar${last ? ' today' : ''}"><rect class="hit" x="${L + i * step}" y="${T}" width="${step}" height="${H - T - B}"/><rect x="${x}" y="${y(0) - h}" width="${bw}" height="${h}" rx="2"/><title>${d.date} 사용자 ${d.users} (Chrome ${d.chrome}, Edge ${d.edge})</title></g>`;
    }).join('');
    const labels = daily.map((d, i) => ((daily.length - 1 - i) % 7 === 0 ? `<text class="axis" x="${L + i * step + step / 2}" y="${H - 8}" text-anchor="middle">${d.date.slice(5)}</text>` : '')).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="날짜별 확장 사용자">${grid}${bars}${labels}</svg>`;
}

/** 기능, 설정 비율 표. 4주 평균이 기준 아래면 램프를 켠다(모인 기간이 짧으면 켜지 않는다) */
function ratioTable(items: Ratio[], nowLabel: string, judged: boolean, review: number): string {
    const rows = [...items].sort((a, b) => b.avg - a.avg || b.now - a.now).map((r) => {
        const low = judged && r.avg < review;
        return `<tr><td>${lamp(low ? 'risk' : 'off', low ? `4주 평균 ${pct(review)} 미만` : '')} ${esc(r.label)}</td><td class="n">${pct(r.now)}</td><td class="n${low ? ' warn' : ''}">${pct(r.avg)}</td></tr>`;
    }).join('');
    return `<table><thead><tr><th></th><th class="n">${nowLabel}</th><th class="n">4주 평균</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function usagePanels(u: UsageSummary | Err | undefined): string {
    if (!u) return '';
    if (isErr(u)) return `<section class="panel"><div class="panel-head"><h2>확장 사용</h2></div><p class="err">${esc(u.error)}</p></section>`;
    const y = u.daily.at(-1);
    const empty = !u.daily.some((d) => d.users > 0);
    const users = `<section class="panel chart usage-chart"><div class="panel-head"><h2>확장 사용자</h2><span class="meta">${esc(u.yesterday.slice(5))}까지, ${ago(u.at)} 갱신</span></div>
<p class="figure-line"><span class="label">어제</span><span class="mono">${y?.users ?? 0} <span class="meta">(Chrome ${y?.chrome ?? 0}, Edge ${y?.edge ?? 0})</span></span></p>
<p class="figure-line"><span class="label">이번 주</span><span class="mono">${u.week}</span></p>
<p class="figure-line"><span class="label">이번 달</span><span class="mono">${u.month}</span></p>
${empty ? '<p class="meta">아직 기록 없음</p>' : usageChart(u.daily)}
<p class="meta">늦게 오는 기록이 있어 최근 며칠은 더 늘 수 있음. 실제 릴리스 버전만 셈</p></section>`;
    const judgedDays = u.days >= u.minDays;
    const features = `<section class="panel"><div class="panel-head"><h2>기능 사용</h2><span class="meta">쓴 사람 비율, ${u.days}일치</span></div>
${empty ? '<p class="meta">아직 기록 없음</p>' : ratioTable(u.features, '어제', judgedDays, u.review)}
${!empty && !judgedDays ? `<p class="meta">${u.minDays}일치가 모이면 4주 평균 ${pct(u.review)} 미만을 표시</p>` : ''}</section>`;
    const st = u.settings;
    const settings = `<section class="panel"><div class="panel-head"><h2>설정</h2><span class="meta">${st ? `${esc(st.week)}${st.partial ? ' 진행 중' : ''}, 사용자 ${st.users}, 기본값에서 바꾼 비율` : '기록 없음'}</span></div>
${st ? ratioTable(st.items, st.partial ? '이번 주' : '지난주', st.weeks >= u.minWeeks, u.review) : ''}
${st ? `<p class="figure-line" style="margin-top:12px"><span class="label">언어</span><span class="mono">${st.langs.slice(0, 6).map((l) => `${esc(l.lang)} ${pct(l.ratio)}`).join(', ')}</span></p>` : ''}</section>`;
    return `<div class="grid usage">${users}${features}${settings}</div>`;
}

function render(live: LiveResult | undefined, bundle: BundleResult | undefined, info: Info | undefined, extra: Extra, reasons: Reason[]): string {
    const level = levelOf(reasons);
    const ga = info && !isErr(info.ga) ? info.ga : [];
    const stores = info && !isErr(info.stores) ? info.stores : undefined;
    const github = info && !isErr(info.github) ? info.github : undefined;
    const issues = github && !isErr(github.issues) ? github.issues : [];
    const today = ga.at(-1);
    const yesterday = ga.at(-2);
    const chrome = stores && !isErr(stores.chrome) ? stores.chrome : undefined;
    const firefox = stores && !isErr(stores.firefox) ? stores.firefox : undefined;

    // 판정 띠
    const verdict = `<section class="verdict ${level}">
<div class="verdict-head">${lamp(level)}<h1>${LEVEL_LABEL[level]}</h1><span class="meta">${time(Date.now())} 갱신</span></div>
${reasons.length ? `<ul class="reasons">${reasons.map((r) => `<li>${lamp(r.level)}<span>${esc(humanError(r.text))}</span></li>`).join('')}</ul>` : '<p class="calm">모든 검사 통과</p>'}
</section>`;

    // 핵심 숫자
    const stat = (label: string, value: string, sub: string) => `<div class="stat"><div class="label">${label}</div><div class="figure">${value}</div><div class="sub">${sub}</div></div>`;
    const stats = `<div class="stats">
${stat('크롬 스토어 사용자', esc(chrome?.users ?? '-'), `Firefox ${esc(firefox?.users ?? '-')}`)}
${stat('오늘 설치', today ? String(today.installs) : '-', yesterday ? `어제 ${yesterday.installs}` : '')}
${stat('오늘 badgecollector.dev 방문자', today ? String(today.siteUsers) : '-', yesterday ? `어제 ${yesterday.siteUsers}` : '')}
${stat('열린 이슈', String(issues.length), `버그 ${issues.filter((i) => i.labels.includes('bug')).length}`)}
</div>`;

    // 주인공 차트와 감시 작업
    const chart = ga.length ? `<section class="panel chart"><div class="panel-head"><h2>스토어 설치</h2><span class="meta">최근 ${ga.length}일, 오늘은 진행 중</span></div>${mainChart(ga)}
<details><summary>날짜별 표</summary><table><thead><tr><th>날짜</th><th class="n">설치</th><th class="n">스토어 페이지 방문</th><th class="n">badgecollector.dev 방문자</th><th class="n">페이지뷰</th></tr></thead><tbody>
${[...ga].reverse().map((d) => `<tr><td class="mono">${d.date.slice(5)}</td><td class="n">${d.installs}</td><td class="n">${d.visits}</td><td class="n">${d.siteUsers}</td><td class="n">${d.siteViews}</td></tr>`).join('')}
</tbody></table></details></section>` : `<section class="panel chart"><h2>스토어 설치</h2><p class="meta">GA 결과 없음</p></section>`;

    const hb = extra.heartbeat;
    const jobs = hb ? `<section class="panel"><div class="panel-head"><h2>감시 작업</h2><span class="meta">${time(hb.at)}</span></div><ul class="rows">
${hb.jobs.map((j) => `<li>${lamp(j.stale ? 'risk' : 'off', j.stale ? '멈춤' : '정상')}<span class="name">${esc(j.label)}</span><span class="when">${j.lastOk ? ago(j.lastOk) : '아직 안 돎'}</span></li>`).join('')}
${hb.services.map((s) => `<li>${lamp(s.state === 'active' ? 'off' : 'risk', s.state)}<span class="name">서비스 ${esc(s.name)}</span><span class="when">${s.state === 'active' ? '실행 중' : esc(s.state)}</span></li>`).join('')}
</ul></section>` : '';

    // 치지직 배포
    const d = extra.deploy;
    const deploy = d ? `<section class="panel"><div class="panel-head"><h2>치지직 배포</h2><span class="meta">${time(d.checkedAt)} 확인</span></div>
${d.error ? `<p class="err">${esc(d.error)}</p>` : ''}
<p class="figure-line"><span class="label">지금 HTML</span><span class="mono">${d.lastModified ? time(d.lastModified) : '-'}</span></p>
${d.history.length ? `<ul class="rows">${d.history.slice(0, 6).map((h) => `<li>${lamp('off')}<span class="name">${esc([...h.changed, ...h.added.map((x) => `+${x}`), ...h.removed.map((x) => `-${x}`)].join(', '))}</span><span class="when">${time(h.at)}</span></li>`).join('')}</ul>` : '<p class="meta">이 감시를 켠 뒤 배포 없음</p>'}
<details><summary>지금 파일 ${d.files.length}</summary><pre>${esc(d.files.join('\n'))}</pre></details></section>` : '';

    // 카나리
    const CANARY_TEXT = { ok: '정상', warn: '처음 보는 값', broken: '깨짐', error: '실행 실패' } as const;
    const canaryLevel = (s: CanaryResult['status']): Level | 'off' => (s === 'ok' ? 'off' : s === 'broken' ? 'broken' : 'risk');
    const canary = extra.canaries.length ? `<section class="panel"><div class="panel-head"><h2>카나리</h2></div><ul class="rows tall">
${extra.canaries.map((c) => `<li>${lamp(canaryLevel(c.status))}<div class="name"><div>${CANARY_LABEL[c.kind]}${c.status !== 'ok' ? ` <span class="${c.status === 'broken' ? 'err' : 'warn'}">${CANARY_TEXT[c.status]}, ${ago(c.since)}부터</span>` : ''}</div><div class="history">${[...c.history].reverse().slice(-12).map((h) => lamp(canaryLevel(h.status), `${time(h.at)} ${CANARY_TEXT[h.status]}`)).join('')}</div>${c.problems.length ? `<pre>${esc(c.problems.slice(0, 6).join('\n'))}</pre>` : ''}</div><span class="when">${ago(c.at)}</span></li>`).join('')}
</ul>${extra.canaries.some((c) => c.autofix) ? `<details><summary>자동 수정 후보</summary><pre>${esc(JSON.stringify(extra.canaries.find((c) => c.autofix)?.autofix, null, 2))}</pre></details>` : ''}</section>` : '';

    // 확장 동작
    const liveLevel = (v: string): Level | 'off' => (v === 'ok' ? 'off' : v === 'broken' ? 'broken' : 'risk');
    const liveSec = `<section class="panel"><div class="panel-head"><h2>확장 실제 시험</h2><span class="meta">${live ? `v${esc(live.version)}, ${ago(live.at)}` : '결과 없음'}</span></div>
${live?.error ? `<p class="err">${esc(humanError(live.error))}</p>` : ''}
${live?.runs.length ? `<table><thead><tr><th>시험</th><th class="n">방송 채팅</th><th class="n">모아보기</th><th class="n">배지</th></tr></thead><tbody>
${live.runs.map((r) => `<tr><td>${lamp(liveLevel(r.verdict))} ${r.url ? `<a href="${esc(r.url)}">${esc(r.name)}</a>` : esc(r.name)}${r.error ? `<div class="err">${esc(humanError(r.error))}</div>` : ''}</td><td class="n">${r.host}</td><td class="n">${r.pane}</td><td class="n">${r.paneWithBadge}</td></tr>`).join('')}
</tbody></table>` : ''}</section>`;

    // 번들
    let bundleSec = '';
    if (bundle) {
        const by = (s: Dependency['status']) => bundle.dependencies.filter((x) => x.status === s);
        const row = (x: Dependency) => `<tr><td>${esc(x.kind)}</td><td><code>${esc(x.name)}</code></td><td class="meta">${esc(x.where)}${x.detail ? `, ${esc(x.detail)}` : ''}</td></tr>`;
        const hist = bundle.history;
        const s = bundle.signals;
        bundleSec = `<section class="panel wide"><div class="panel-head"><h2>치지직 번들</h2><span class="meta">${ago(bundle.at)} 확인</span></div>
<div class="split">
<div><h3>확장이 기대는 이름</h3><p class="figure-line"><span class="label">있음</span><span class="mono">${by('ok').length} / ${bundle.dependencies.length}</span></p>
${by('gone').length ? `<p class="err">사라짐 ${by('gone').length}</p><table><tbody>${by('gone').map(row).join('')}</tbody></table>` : ''}
${by('absent').length ? `<details><summary>처음부터 못 찾음 ${by('absent').length}</summary><table><tbody>${by('absent').map(row).join('')}</tbody></table></details>` : ''}
<details><summary>있음 ${by('ok').length}</summary><table><tbody>${by('ok').map(row).join('')}</tbody></table></details>
${copyButton('prompt-risk', riskPrompt(reasons, live, bundle))}</div>
<div><h3>새 기능 흔적</h3><p class="meta mono">메시지 타입 ${Object.keys(s.msgTypes).length}, 소켓 cmd ${Object.keys(s.socketCmds).length}, 이벤트 ${s.eventTypes.length}, 경로 ${s.apiPaths.length}, CSS 이름 ${s.cssNames.length}</p>
${hist.length ? hist.slice(0, 5).map((h) => `<div class="change"><div class="meta mono">${time(h.at)}</div><pre>${esc(diffLines(h.diff).join('\n'))}</pre></div>`).join('') + copyButton('prompt-feature', featurePrompt(bundle)) : '<p class="meta">기록된 변화 없음</p>'}
<details><summary>메시지 타입, 소켓 cmd</summary><pre>${esc(Object.entries(s.msgTypes).map(([k, v]) => `${k} ${v}`).join('\n'))}\n\n${esc(Object.entries(s.socketCmds).map(([k, v]) => `${k} ${v}`).join('\n'))}</pre></details></div>
</div></section>`;
    }

    // 배지
    let badges = '';
    if (info && !isErr(info.badges)) {
        const b = info.badges;
        const card = (x: BadgeView) => `<li><img src="${esc(x.imageUrl)}" alt="" loading="lazy" width="32" height="32"><div><code>${esc(x.badgeId)}</code><div class="meta">${esc(x.scope)}, ${time(x.firstSeen)} 처음, 채널 ${x.channels}</div></div></li>`;
        badges = `<section class="panel"><div class="panel-head"><h2>배지</h2></div>
<p class="figure-line"><span class="label">목록</span><span class="mono">${b.listed}</span></p>
<p class="figure-line"><span class="label">harvester 공통 배지</span><span class="mono">${b.common}</span></p>
<p class="figure-line"><span class="label">오늘 새 구독 배지</span><span class="mono">${b.subscriptionRecent}</span></p>
<p class="figure-line"><span class="label">목록에 없음</span><span class="mono${b.unlisted.length ? ' warn' : ''}">${b.unlisted.length}</span></p>
${b.unlisted.length ? `<ul class="badges">${b.unlisted.map(card).join('')}</ul>` : ''}
${b.recent.length ? `<details><summary>최근 14일 처음 보임 ${b.recent.length}</summary><ul class="badges">${b.recent.map(card).join('')}</ul></details>` : ''}</section>`;
    }

    // 스토어
    let store = '';
    if (stores) {
        const rel = isErr(stores.release) ? undefined : stores.release.version;
        const row = (name: string, x: typeof stores.chrome | typeof stores.firefox) => isErr(x)
            ? `<tr><td>${name}</td><td colspan="4" class="err">${esc(x.error)}</td></tr>`
            : `<tr><td>${name}</td><td class="n">${esc(x.users ?? '-')}</td><td class="n">${x.rating != null ? x.rating.toFixed(2) : '-'} <span class="meta">(${x.ratingCount ?? '-'})</span></td><td class="mono${rel && x.version && x.version !== rel ? ' warn' : ''}">${esc(x.version ?? '-')}</td><td class="mono">${day(x.updated)}</td></tr>`;
        store = `<section class="panel"><div class="panel-head"><h2>스토어</h2></div><table><thead><tr><th></th><th class="n">사용자</th><th class="n">평점</th><th>버전</th><th>갱신</th></tr></thead><tbody>
${row('Chrome', stores.chrome)}${row('Firefox', stores.firefox)}
<tr><td>GitHub 릴리스</td><td></td><td></td><td class="mono">${esc(rel ?? '-')}</td><td class="mono">${isErr(stores.release) ? '' : day(stores.release.published)}</td></tr>
</tbody></table></section>`;
    }

    // GitHub (이관 중인 카나리와 열린 이슈)
    let gh = '';
    if (github) {
        gh = `<section class="panel"><div class="panel-head"><h2>GitHub</h2><span class="meta">카나리는 11-09쯤 정리</span></div><ul class="rows">
${github.runs.map((r) => 'error' in r
            ? `<li>${lamp('risk')}<span class="name">${esc(r.name)}</span><span class="when err">${esc(r.error)}</span></li>`
            : `<li>${lamp(r.conclusion === 'success' ? 'off' : r.conclusion === 'failure' ? 'broken' : 'risk', r.conclusion ?? '')}<span class="name"><a href="${esc(r.url)}">${esc(r.name)}</a></span><span class="when">${r.recent.map((c) => lamp(c === 'success' ? 'off' : c === 'failure' ? 'broken' : 'risk', c ?? '')).join('')}</span></li>`).join('')}
</ul>
<details><summary>열린 이슈 ${issues.length}</summary><ul class="issues">${issues.map((i) => `<li><a href="${esc(i.url)}"><span class="mono">#${i.number}</span> ${esc(i.title)}</a>${i.labels.map((l) => ` <span class="tag">${esc(l)}</span>`).join('')}</li>`).join('')}</ul></details></section>`;
    }

    return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="600"><title>Badge Collector 현황</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
:root{color-scheme:light dark;
--page:#f5f5f4;--card:#ffffff;--raised:#efefee;--ink:#171717;--ink2:#525252;--muted:#737373;--line:rgba(23,23,23,.08);
--accent:#f2c200;--lamp-off:#d4d4d2;--ok:#16a34a;--risk:#c27a00;--broken:#dc2626;--shadow:0 1px 2px rgba(0,0,0,.05)}
@media (prefers-color-scheme:dark){:root{
--page:#141415;--card:#19191b;--raised:#232325;--ink:#ededed;--ink2:#a1a1a6;--muted:#85858b;--line:rgba(237,237,237,.08);
--accent:#f2c200;--lamp-off:#3a3a3d;--ok:#4cc38a;--risk:#f0a020;--broken:#e5484d;--shadow:none}}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);font:14px/20px "Pretendard Variable",Pretendard,system-ui,sans-serif;font-variant-numeric:tabular-nums}
.mono,code,pre,.axis{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:12px}
td.mono{white-space:nowrap}
a{color:inherit;text-decoration:none;border-bottom:1px solid var(--line)}a:hover{border-color:var(--ink2)}
main{max-width:1440px;margin:0 auto;padding:24px 32px 48px}
.top{display:flex;align-items:baseline;gap:12px;margin-bottom:16px}
.brand{font-size:16px;font-weight:600}.brand span{color:var(--muted);font-weight:400}
.top .spacer{flex:1}
h1{font-size:32px;line-height:1;font-weight:500;margin:0}
h2{font-size:15px;line-height:20px;font-weight:500;margin:0}
h3{font-size:13px;font-weight:500;color:var(--ink2);margin:0 0 8px}
.meta{color:var(--muted);font-size:12px;line-height:16px}
.err{color:var(--broken);font-size:13px}.warn{color:var(--risk)}
/* 탈리 램프 */
.lamp{display:inline-block;flex:none;width:8px;height:8px;border-radius:50%;background:var(--lamp-off);vertical-align:middle}
.lamp.ok{background:var(--ok)}.lamp.risk{background:var(--risk)}.lamp.broken{background:var(--broken)}
.lamp.ok,.lamp.risk,.lamp.broken{box-shadow:inset 0 -1px 0 rgba(0,0,0,.2)}
/* 판정 띠 */
.verdict{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px;box-shadow:var(--shadow);margin-bottom:16px}
.verdict-head{display:flex;align-items:center;gap:12px}
.verdict-head .lamp{width:16px;height:16px}
.verdict-head .meta{margin-left:auto}
.verdict.risk h1{color:var(--risk)}.verdict.broken h1{color:var(--broken)}
.reasons{list-style:none;margin:16px 0 0;padding:0;display:grid;gap:8px}
.reasons li{display:flex;align-items:baseline;gap:12px;color:var(--ink2);font-size:15px;line-height:22px}
.reasons .lamp{position:relative;top:-1px}
.calm{color:var(--ink2);margin:12px 0 0}
/* 숫자 */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:16px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;box-shadow:var(--shadow)}
.stat .label{color:var(--ink2);font-size:13px}
.stat .figure{font-size:32px;line-height:1;font-weight:500;margin:12px 0 8px}
.stat .sub{color:var(--muted);font-size:12px}
/* 패널 */
.layout{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:16px;align-items:start;margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start}
.panel{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;box-shadow:var(--shadow);min-width:0}
.panel.wide{grid-column:span 2}
.panel-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:16px}
.split{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.figure-line{display:flex;justify-content:space-between;margin:0 0 8px;font-size:13px}.figure-line .label{color:var(--ink2)}
.rows{list-style:none;margin:0;padding:0}
.rows li{display:flex;align-items:center;gap:12px;min-height:36px;border-top:1px solid var(--line)}
.rows li:first-child{border-top:0}
.rows.tall li{align-items:flex-start;padding:12px 0}.rows.tall .lamp{margin-top:6px}
.rows .name{flex:1;min-width:0}
.rows .when{color:var(--muted);white-space:nowrap;font-size:12px}
.history{display:flex;gap:4px;margin-top:8px}.history .lamp{width:6px;height:6px}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:8px 12px 8px 0;border-top:1px solid var(--line);vertical-align:top;font-size:13px}
thead th{border-top:0;color:var(--muted);font-weight:400;font-size:12px;padding-top:0}
.n{text-align:right}
pre{white-space:pre-wrap;word-break:break-all;margin:8px 0 0;color:var(--ink2);font-size:12px;line-height:16px}
details{margin-top:12px}summary{cursor:pointer;color:var(--ink2);font-size:13px}summary:hover{color:var(--ink)}
.change{border-left:2px solid var(--line);padding-left:12px;margin-bottom:12px}
.badges{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:8px}.badges li{display:flex;gap:12px;align-items:center}.badges img{width:32px;height:32px;object-fit:contain}
.issues{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:8px}.issues a{border:0}.issues a:hover{color:var(--ink2)}
.tag{font-size:11px;color:var(--muted);border:1px solid var(--line);border-radius:4px;padding:0 4px}
/* 차트 */
.chart svg{width:100%;height:auto;display:block}
.chart .gl{stroke:var(--line)}.chart .axis{fill:var(--muted);font-size:11px}
.chart .bar rect:not(.hit){fill:var(--lamp-off);transition:fill .15s cubic-bezier(.22,1,.36,1)}
.chart .bar.today rect:not(.hit){fill:var(--accent)}
.chart .bar:hover rect:not(.hit){fill:var(--ink2)}.chart .hit{fill:transparent}
.grid.usage{margin-bottom:16px}
@media (max-width:760px){.usage-chart .axis{font-size:15px}}
.prompt{position:absolute;left:-9999px;width:1px;height:1px}
button.copy{margin-top:12px;font:inherit;font-size:12px;height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--line);background:var(--raised);color:var(--ink);cursor:pointer;transition:background-color .15s cubic-bezier(.22,1,.36,1)}
button.copy:hover{background:var(--line)}button.copy:active{transform:scale(.98)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
footer{margin-top:24px}
@media (max-width:1100px){.grid{grid-template-columns:1fr 1fr}.panel.wide{grid-column:span 2}}
@media (max-width:760px){main{padding:16px}.stats{grid-template-columns:1fr 1fr}.layout,.grid,.split{grid-template-columns:1fr}.panel.wide{grid-column:auto}h1{font-size:28px}.chart .axis{font-size:22px}}
</style></head><body><main>
<header class="top"><div class="brand">Badge Collector <span>현황</span></div><span class="spacer"></span><a class="meta" href="https://github.com/${REPO}/blob/master/docs/monitoring.md">docs/monitoring.md</a></header>
${verdict}
${stats}
<div class="layout">${chart}${jobs}</div>
${usagePanels(extra.usage)}
<div class="grid">${deploy}${canary}${liveSec}${bundleSec}${badges}${store}${gh}</div>
<footer class="meta">ovm 192.168.1.162, 10분마다 새로고침</footer>
</main>
<script>
// http(LAN)라 navigator.clipboard가 없을 수 있다. 숨긴 textarea를 골라 execCommand로 복사한다
for (const b of document.querySelectorAll('button.copy')) b.addEventListener('click', async () => {
  const t = document.getElementById(b.dataset.target);
  try { await navigator.clipboard.writeText(t.value); } catch { t.select(); document.execCommand('copy'); }
  b.textContent = '복사됨'; setTimeout(() => (b.textContent = '프롬프트 복사'), 1500);
});
</script></body></html>`;
}

async function main(): Promise<void> {
    const live = readJson<LiveResult>('live');
    const bundle = readJson<BundleResult>('bundle');
    const info = readJson<Info>('info');
    const extra: Extra = {
        deploy: readJson<DeployState>('deploy'),
        canaries: (['selector', 'socket'] as const).map((k) => readJson<CanaryResult>(`canary-${k}`)).filter((c): c is CanaryResult => !!c),
        heartbeat: readJson<Heartbeat>('heartbeat'),
        usage: readJson<UsageSummary | Err>('usage'),
    };
    const reasons = judge(live, bundle, info, extra);
    const level = levelOf(reasons);

    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, render(live, bundle, info, extra, reasons));

    // 알림: 판정이 바뀌었을 때, 번들에 새 변화가 기록됐을 때
    const prev = readJson<{ level: Level; bundleChangeAt?: number }>('verdict');
    const lines: string[] = [];
    if (prev && prev.level !== level) {
        lines.push(`**확장 현황 ${LEVEL_LABEL[prev.level]} → ${LEVEL_LABEL[level]}**`);
        for (const r of reasons) lines.push(`- ${r.text}`);
    }
    const latest = bundle?.history[0];
    if (latest && prev && latest.at !== prev.bundleChangeAt) {
        lines.push('**치지직 번들 변화**', ...diffLines(latest.diff).map((l) => (l.length > 300 ? `${l.slice(0, 300)}…` : l)));
    }
    if (lines.length) {
        lines.push(DASHBOARD_URL);
        await sendDiscord(lines);
    }
    if (!DRY_RUN) writeJson('verdict', { level, bundleChangeAt: latest?.at ?? prev?.bundleChangeAt });
    console.log(`[render] ${new Date().toISOString()} ${level} ${reasons.length}`);
}

main().catch((err) => {
    console.error(`[render] ${new Date().toISOString()}`, err);
    process.exit(1);
});
