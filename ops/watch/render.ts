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
import { REPO, readJson, writeJson } from './state.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../public/index.html');
const DASHBOARD_URL = 'http://192.168.1.162:3400';
const LIVE_STALE_MS = 13 * 3_600_000;

type Level = 'ok' | 'risk' | 'broken';
const LEVEL_LABEL: Record<Level, string> = { ok: '정상', risk: '위험', broken: '깨짐' };
const LEVEL_ICON: Record<Level, string> = { ok: '●', risk: '▲', broken: '✕' };

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
const time = (ms: number | string | null | undefined) =>
    ms == null ? '-' : new Date(ms).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
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

const pill = (level: Level, text = LEVEL_LABEL[level]) => `<span class="pill ${level}"><span aria-hidden="true">${LEVEL_ICON[level]}</span> ${esc(text)}</span>`;

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

function barChart(title: string, points: { label: string; value: number }[]): string {
    const W = 320, H = 120, PAD_B = 18, PAD_T = 14;
    const max = Math.max(1, ...points.map((p) => p.value));
    const step = W / Math.max(points.length, 1);
    const bw = Math.max(4, Math.min(16, step - 4));
    const bars = points
        .map((p, i) => {
            const h = Math.max(p.value > 0 ? 2 : 0, ((H - PAD_B - PAD_T) * p.value) / max);
            const x = i * step + (step - bw) / 2;
            const y = H - PAD_B - h;
            const r = Math.min(4, bw / 2, h);
            const d = h > 0
                ? `M${x},${H - PAD_B}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${H - PAD_B}Z`
                : '';
            return `<g class="bar"><rect x="${i * step}" y="0" width="${step}" height="${H}" fill="transparent"/><path d="${d}"/><title>${esc(p.label)}: ${p.value}</title></g>`;
        })
        .join('');
    const last = points.at(-1);
    const first = points[0];
    return `<figure class="chart"><figcaption>${esc(title)}<span class="num">${last ? last.value : '-'}</span></figcaption>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><line class="base" x1="0" x2="${W}" y1="${H - PAD_B}" y2="${H - PAD_B}"/>${bars}
<text class="axis" x="0" y="${H - 4}">${esc(first?.label.slice(5) ?? '')}</text><text class="axis" x="${W}" y="${H - 4}" text-anchor="end">${esc(last?.label.slice(5) ?? '')}</text>
<text class="axis" x="0" y="10">${max}</text></svg></figure>`;
}

function render(live: LiveResult | undefined, bundle: BundleResult | undefined, info: Info | undefined, extra: Extra, reasons: Reason[]): string {
    const level = levelOf(reasons);
    const sections: string[] = [];

    // 치지직 배포
    if (extra.deploy) {
        const d = extra.deploy;
        sections.push(`<section><h2>치지직 배포</h2>
<p class="meta">${time(d.checkedAt)} 확인${d.error ? '' : ', 정상'}${d.lastModified ? `, 지금 HTML 수정 시각 ${time(d.lastModified)}` : ''}</p>${d.error ? `<div class="err">${esc(d.error)}</div>` : ''}
${d.history.length ? `<table><thead><tr><th>감지</th><th>바뀐 파일</th></tr></thead><tbody>${d.history.slice(0, 10).map((h) => `<tr><td>${time(h.at)}</td><td>${esc([...h.changed, ...h.added.map((x) => `+${x}`), ...h.removed.map((x) => `-${x}`)].join(', '))}</td></tr>`).join('')}</tbody></table>` : '<p class="meta">감지된 배포 없음</p>'}
<details><summary>지금 파일 ${d.files.length}</summary><pre>${esc(d.files.join('\n'))}</pre></details></section>`);
    }

    // ovm 카나리
    if (extra.canaries.length) {
        const st = (s: CanaryResult['status']) => pill(s === 'ok' ? 'ok' : s === 'broken' ? 'broken' : 'risk', s === 'warn' ? '처음 보는 값' : s === 'error' ? '실행 실패' : undefined);
        sections.push(`<section><h2>카나리</h2><table><thead><tr><th>작업</th><th>결과</th><th>최근</th></tr></thead><tbody>
${extra.canaries.map((c) => `<tr><td>${CANARY_LABEL[c.kind]}<div class="meta">${time(c.at)}, ${Math.round(c.durationMs / 1000)}초</div></td><td>${st(c.status)}${c.status !== 'ok' ? `<div class="meta">${ago(c.since)}부터</div>` : ''}${c.problems.length ? `<pre>${esc(c.problems.slice(0, 8).join('\n'))}</pre>` : ''}</td><td>${c.history.slice(0, 10).map((h) => `<span class="dot ${h.status === 'ok' ? 'ok' : h.status === 'broken' ? 'broken' : 'risk'}" title="${esc(`${time(h.at)} ${h.status}`)}"></span>`).join('')}</td></tr>`).join('')}
</tbody></table>${extra.canaries.some((c) => c.autofix) ? `<details><summary>자동 수정 후보</summary><pre>${esc(JSON.stringify(extra.canaries.find((c) => c.autofix)?.autofix, null, 2))}</pre></details>` : ''}</section>`);
    }

    // 감시 작업
    if (extra.heartbeat) {
        const hb = extra.heartbeat;
        sections.push(`<section><h2>감시 작업</h2><p class="meta">${time(hb.at)} 확인</p><table><thead><tr><th>작업</th><th>마지막 성공</th><th></th></tr></thead><tbody>
${hb.jobs.map((j) => `<tr><td>${esc(j.label)}</td><td>${j.lastOk ? `${time(j.lastOk)} <span class="meta">(${ago(j.lastOk)})</span>` : '-'}${j.code ? `<div class="err">마지막 종료 코드 ${j.code}</div>` : ''}</td><td>${pill(j.stale ? 'risk' : 'ok', j.stale ? '멈춤' : '정상')}</td></tr>`).join('')}
${hb.services.map((s) => `<tr><td>서비스 ${esc(s.name)}</td><td>${esc(s.state)}</td><td>${pill(s.state === 'active' ? 'ok' : 'risk', s.state === 'active' ? '정상' : '멈춤')}</td></tr>`).join('')}
</tbody></table></section>`);
    }

    // 확장 동작
    sections.push(`<section><h2>확장 동작</h2>
${live ? `<p class="meta">v${esc(live.version)}, ${time(live.at)} (${ago(live.at)})</p>` : '<p class="meta">결과 없음</p>'}
<table><thead><tr><th>시험</th><th>판정</th><th class="n">방송 채팅</th><th class="n">모아보기</th><th class="n">배지 있는 줄</th></tr></thead><tbody>
${(live?.runs ?? [])
    .map((r) => `<tr><td>${r.url ? `<a href="${esc(r.url)}">${esc(r.name)}</a>` : esc(r.name)}</td><td>${pill(r.verdict === 'ok' ? 'ok' : r.verdict === 'broken' ? 'broken' : 'risk', r.verdict === 'unknown' ? '판정 못 함' : undefined)}${r.error ? `<div class="err">${esc(r.error)}</div>` : ''}</td><td class="n">${r.host}</td><td class="n">${r.pane}</td><td class="n">${r.paneWithBadge}</td></tr>`)
    .join('')}
</tbody></table></section>`);

    // canary
    if (info && !isErr(info.github)) {
        const issues = isErr(info.github.issues) ? [] : info.github.issues;
        sections.push(`<section><h2>GitHub canary (ovm으로 이관 중)</h2><table><thead><tr><th>작업</th><th>마지막</th><th>최근 5회</th></tr></thead><tbody>
${info.github.runs
    .map((r) => 'error' in r
        ? `<tr><td>${esc(r.name)}</td><td colspan="2" class="err">${esc(r.error)}</td></tr>`
        : `<tr><td><a href="${esc(r.url)}">${esc(r.name)}</a></td><td>${pill(r.conclusion === 'success' ? 'ok' : r.conclusion === 'failure' ? 'broken' : 'risk', r.conclusion ?? '-')} <span class="meta">${time(r.at)}</span></td><td>${r.recent.map((c) => `<span class="dot ${c === 'success' ? 'ok' : c === 'failure' ? 'broken' : 'risk'}" title="${esc(c)}"></span>`).join('')}</td></tr>`)
    .join('')}
</tbody></table>
<h3>열린 이슈 ${issues.length}</h3><ul class="issues">${issues
            .map((i) => `<li><a href="${esc(i.url)}">#${i.number} ${esc(i.title)}</a>${i.labels.map((l) => ` <span class="label">${esc(l)}</span>`).join('')}</li>`)
            .join('')}</ul></section>`);
    }

    // 번들 의존
    if (bundle) {
        const by = (s: Dependency['status']) => bundle.dependencies.filter((d) => d.status === s);
        const row = (d: Dependency) => `<tr><td>${esc(d.kind)}</td><td><code>${esc(d.name)}</code></td><td class="meta">${esc(d.where)}${d.detail ? `, ${esc(d.detail)}` : ''}</td></tr>`;
        sections.push(`<section><h2>번들 의존</h2><p class="meta">${time(bundle.at)}, 확인 ${bundle.dependencies.length}개, 있음 ${by('ok').length}</p>
${by('gone').length ? `<h3>${pill('risk', '사라짐')}</h3><table><tbody>${by('gone').map(row).join('')}</tbody></table>` : ''}
${by('absent').length ? `<details><summary>처음부터 못 찾음 ${by('absent').length}</summary><table><tbody>${by('absent').map(row).join('')}</tbody></table></details>` : ''}
<details><summary>있음 ${by('ok').length}</summary><table><tbody>${by('ok').map(row).join('')}</tbody></table></details>
${copyButton('prompt-risk', riskPrompt(reasons, live, bundle))}</section>`);

        // 새 기능 흔적
        const hist = bundle.history;
        sections.push(`<section><h2>번들 변화</h2>
<p class="meta">메시지 타입 ${Object.keys(bundle.signals.msgTypes).length}, 소켓 cmd ${Object.keys(bundle.signals.socketCmds).length}, 이벤트 타입 ${bundle.signals.eventTypes.length}, 경로 ${bundle.signals.apiPaths.length}, CSS 이름 ${bundle.signals.cssNames.length}</p>
${hist.length ? hist.map((h) => `<div class="change"><div class="meta">${time(h.at)}</div><pre>${esc(diffLines(h.diff).join('\n'))}</pre></div>`).join('') : '<p class="meta">기록된 변화 없음</p>'}
${hist.length ? copyButton('prompt-feature', featurePrompt(bundle)) : ''}
<details><summary>메시지 타입, 소켓 cmd</summary><pre>${esc(Object.entries(bundle.signals.msgTypes).map(([k, v]) => `${k} ${v}`).join('\n'))}\n\n${esc(Object.entries(bundle.signals.socketCmds).map(([k, v]) => `${k} ${v}`).join('\n'))}</pre></details>
</section>`);
    }

    // 배지
    if (info && !isErr(info.badges)) {
        const b = info.badges;
        const card = (x: BadgeView) => `<li><img src="${esc(x.imageUrl)}" alt="" loading="lazy" width="36" height="36"><div><code>${esc(x.badgeId)}</code><div class="meta">${esc(x.scope)}, ${time(x.firstSeen)} 처음, 채널 ${x.channels}, ${x.sightings.toLocaleString()}회</div></div></li>`;
        sections.push(`<section><h2>배지</h2><p class="meta">목록 ${b.listed}, 수집된 공통 배지 ${b.common}, 오늘 새 구독 배지 ${b.subscriptionRecent}</p>
<h3>목록에 없음 ${b.unlisted.length}</h3>${b.unlisted.length ? `<ul class="badges">${b.unlisted.map(card).join('')}</ul>` : ''}
<h3>최근 14일 처음 보임 ${b.recent.length}</h3>${b.recent.length ? `<ul class="badges">${b.recent.map(card).join('')}</ul>` : ''}</section>`);
    }

    // 스토어
    if (info && !isErr(info.stores)) {
        const s = info.stores;
        const rel = isErr(s.release) ? undefined : s.release.version;
        const store = (name: string, x: typeof s.chrome | typeof s.firefox) => isErr(x)
            ? `<tr><td>${name}</td><td colspan="4" class="err">${esc(x.error)}</td></tr>`
            : `<tr><td>${name}</td><td class="n">${esc(x.users ?? '-')}</td><td class="n">${x.rating != null ? x.rating.toFixed(2) : '-'} (${x.ratingCount ?? '-'})</td><td>${esc(x.version ?? '-')}${rel && x.version && x.version !== rel ? ` ${pill('risk', `릴리스 ${rel}`)}` : ''}</td><td class="meta">${esc(x.updated ?? '-')}</td></tr>`;
        sections.push(`<section><h2>스토어</h2><table><thead><tr><th></th><th class="n">사용자</th><th class="n">평점</th><th>버전</th><th>갱신</th></tr></thead><tbody>
${store('Chrome', s.chrome)}${store('Firefox', s.firefox)}
<tr><td>GitHub 릴리스</td><td></td><td></td><td>${esc(rel ?? '-')}</td><td class="meta">${isErr(s.release) ? '' : time(s.release.published)}</td></tr>
</tbody></table></section>`);
    }

    // GA
    if (info && !isErr(info.ga)) {
        const ga = info.ga;
        sections.push(`<section><h2>GA 최근 ${ga.length}일</h2><div class="charts">
${barChart('스토어 페이지 방문', ga.map((d) => ({ label: d.date, value: d.visits })))}
${barChart('스토어 설치', ga.map((d) => ({ label: d.date, value: d.installs })))}
${barChart('badgecollector.dev 방문자', ga.map((d) => ({ label: d.date, value: d.siteUsers })))}
</div><details><summary>표</summary><table><thead><tr><th>날짜</th><th class="n">방문</th><th class="n">설치</th><th class="n">사이트 방문자</th><th class="n">페이지뷰</th></tr></thead><tbody>
${ga.map((d) => `<tr><td>${d.date}</td><td class="n">${d.visits}</td><td class="n">${d.installs}</td><td class="n">${d.siteUsers}</td><td class="n">${d.siteViews}</td></tr>`).join('')}
</tbody></table><p class="meta">오늘은 진행 중, 최근 몇 시간은 덜 잡힘</p></details></section>`);
    }

    return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="600"><title>Badge Collector 현황</title>
<style>
:root{--page:#f9f9f7;--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--muted:#898781;--line:#e4e3df;--series:#2a78d6;--ok:#0ca30c;--risk:#c98500;--broken:#d03b3b;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--page:#0d0d0d;--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--muted:#898781;--line:#2e2e2c;--series:#3987e5;--risk:#fab219}}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:14px/1.5 system-ui,-apple-system,"Noto Sans KR",sans-serif}
main{max-width:1100px;margin:0 auto;padding:16px}header{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:8px}
h1{font-size:18px;margin:0}h2{font-size:15px;margin:0 0 8px}h3{font-size:13px;margin:14px 0 6px;color:var(--ink2)}
.verdict{font-size:16px}.reasons{margin:0 0 16px;padding-left:20px;color:var(--ink2)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,500px),1fr));gap:12px}
section{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px;min-width:0;overflow-x:auto}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:4px 8px 4px 0;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:500;font-size:12px}
.n{text-align:right;font-variant-numeric:tabular-nums}.meta{color:var(--muted);font-size:12px;margin:0 0 6px}.err{color:var(--broken);font-size:12px}
a{color:inherit}code{font-size:12px}pre{white-space:pre-wrap;word-break:break-all;font-size:12px;margin:4px 0;color:var(--ink2)}
.pill{display:inline-block;padding:0 8px;border-radius:10px;font-size:12px;border:1px solid currentColor;white-space:nowrap}.pill.ok{color:var(--ok)}.pill.risk{color:var(--risk)}.pill.broken{color:var(--broken)}
.verdict .pill{font-size:15px;padding:2px 12px}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:3px}.dot.ok{background:var(--ok)}.dot.risk{background:var(--risk)}.dot.broken{background:var(--broken)}
.label{font-size:11px;color:var(--muted);border:1px solid var(--line);border-radius:8px;padding:0 6px}.issues{margin:0;padding-left:18px}
.badges{list-style:none;margin:0;padding:0;display:grid;gap:6px}.badges li{display:flex;gap:8px;align-items:center}.badges img{width:36px;height:36px;object-fit:contain}
.change{border-left:2px solid var(--line);padding-left:8px;margin-bottom:8px}
.prompt{position:absolute;left:-9999px;width:1px;height:1px}button.copy{margin-top:10px;font:inherit;font-size:12px;padding:4px 10px;border-radius:6px;border:1px solid var(--line);background:var(--page);color:var(--ink);cursor:pointer}
.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}.chart{margin:0}.chart figcaption{font-size:12px;color:var(--ink2);display:flex;justify-content:space-between}.chart .num{color:var(--ink);font-variant-numeric:tabular-nums}
.chart svg{width:100%;height:auto;display:block}.chart .bar path{fill:var(--series)}.chart .bar:hover path{opacity:.75}.chart .base{stroke:var(--line)}.chart .axis{fill:var(--muted);font-size:10px}
details{margin-top:8px}summary{cursor:pointer;color:var(--ink2);font-size:13px}
</style></head><body><main>
<header><h1>Badge Collector 현황</h1><span class="verdict">${pill(level)}</span><span class="meta">${time(Date.now())} 갱신</span></header>
${reasons.length ? `<ul class="reasons">${reasons.map((r) => `<li>${pill(r.level)} ${esc(r.text)}</li>`).join('')}</ul>` : ''}
<div class="grid">${sections.join('\n')}</div>
<p class="meta"><a href="https://github.com/${REPO}">${REPO}</a></p>
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
