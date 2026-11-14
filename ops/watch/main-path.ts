/**
 * 주 경로 시험의 판정. 치지직 라이브는 소켓 경로가 주 경로이고 선택자는 대체 경로다.
 * 가장 큰 고장 두 가지를 본다: 수집 창이 아예 안 생김, 소켓 경로가 죽고 HTML 대체로 넘어감.
 *
 * 방송에 채팅이 있었는지는 화면이 아니라 페이지의 웹소켓 메시지로 센다(확장의 파서로 읽는다).
 * 치지직 화면 구조가 바뀌어도 "확인 못 함"으로 빠지지 않게. 소켓이 안 보이면 화면 채팅 줄로 센다.
 *
 * 창이 차 있으면 내용도 본다 (judgeContent):
 *  - 소켓 데이터가 화면과 같은가: 확장의 비교 도구(src/content-scripts/chzzk/socket-shadow.ts)를 켜고 콘솔 결과를 읽는다.
 *    화면엔 있는데 소켓에 없는 배지는 주 경로 사용자의 필터가 놓치므로 위험, 반대(대체 경로가 못 읽음)는 참고
 *  - 수집 창이 제대로 그리나: 수집 창 채팅과 탭이 넘긴 소켓 채팅을 키로 짝지어 닉네임, 본문, 배지 그림 수를 본다
 *
 * 입출력 없는 순수 함수만 둔다. 관찰은 live-check.ts --main이 한다.
 */
import { badgeGroup } from '../../scripts/canary/judge.ts';
import { CHAT_SOCKET_URL } from '../../src/platform/chzzk-socket-url.ts';
import type { CheckReport, Finding } from './incidents.ts';

export interface PageObservation {
    url: string;
    /** 페이지가 연 웹소켓마다 확장 파서로 읽은 채팅 수 */
    sockets: { url: string; chats: number }[];
    /** 화면의 방송 채팅 줄 수 (고정 선택자) */
    domChats: number;
    /** 확장의 소켓 탭이 페이지 WebSocket에 설치됐는지 (ws-tap.ts의 표시) */
    tapInstalled: boolean;
    /** 탭이 확장에 실제로 넘긴 채팅 수 (window 메시지 tbc-socket-chat). 소켓 경로가 사는지의 근거 */
    tapDelivered: number;
    /** 수집 창 요소가 있는지 */
    paneExists: boolean;
    /** 수집 창의 채팅 수 */
    pane: number;
    paneWithBadge: number;
    paneWithName: number;
    /** 확장이 수집 창을 붙이는 채팅 컨테이너 선택자가 지금 화면에서 맞는 수 */
    container: number;
    /** 내용 비교 재료 (주 경로 시험만) */
    content?: ContentSample;
}

/** 탭이 확장에 넘긴 소켓 채팅 (ChzzkSocketChat에서 비교에 쓰는 것만) */
export interface TapChat {
    id: string;
    type: number;
    status: string;
    nickname: string;
    anonymous: boolean;
    message: string;
    /** 인증 마크는 들어 있지 않다 (CSS 배경이라 그림이 아니다) */
    badges: string[];
}

export interface PaneItem {
    key: string;
    text: string;
    /** 닉네임 영역의 그림 수 */
    nameImgs: number;
}

/** 비교 도구가 콘솔에 남긴 불일치 한 건. html은 원래 채팅 화면, socket은 소켓 쪽 */
export interface ShadowMismatch {
    field: string;
    type: number;
    status: string;
    id: string;
    html: unknown;
    socket: unknown;
}

export interface ContentSample {
    chats: TapChat[];
    items: PaneItem[];
    /** 비교 도구의 마지막 요약. 30초마다 나온다 */
    shadowSummary?: { matched: number; mismatched: number; socketOnly: number; htmlOnly: number };
    mismatches: ShadowMismatch[];
}

/** 선택자 rev. 확장이 받아 적용한 것(저장소), 확장에 들어 있던 것, 지금 jsDelivr가 주는 것 */
export interface OtaRevs {
    applied?: number;
    bundled?: number;
    cdn?: number;
}

export interface MainRun extends Partial<PageObservation> {
    at: number;
    version?: string;
    error?: string;
    ota?: OtaRevs;
}

/** 확장이 쓰는 선택자 rev: 받아 적용한 것이 있으면 그것, 없으면 들어 있던 것 */
export const effectiveRev = (o: OtaRevs) => (o.applied ?? o.bundled);

/** 어긋남이 이만큼(비율과 건수 둘 다) 넘어야 사건이다. 한두 건의 우연한 차이로는 울리지 않게 */
export const CONTENT_RATIO = 0.1;
export const CONTENT_MIN = 3;
/** 비교한 채팅이 이보다 적으면 내용은 판정하지 않는다 */
export const CONTENT_MIN_COMPARED = 10;
/** 비교 도구가 불일치를 자세히 남기는 건수 (socket-shadow.ts DETAILED_MISMATCH_LOGS) */
export const SHADOW_DETAIL_LIMIT = 50;

/** 소켓 채팅 id는 `${uid}_${msgTime}` */
const timeOf = (id: string) => Number(id.split('_').at(-1));

/**
 * 비율의 분모. 자세한 불일치가 상한에 걸렸으면 그 뒤의 불일치는 내용을 모른다. 그때는 자세히 남은 불일치가
 * 걸친 시간 동안 탭이 넘긴 채팅 수를 쓴다(상한에 걸린 채로 전체 비교 수를 쓰면 비율이 줄어 고장을 놓친다).
 */
export function comparedCount(c: ContentSample): number {
    const ids = new Set(c.mismatches.map((m) => m.id));
    if (c.mismatches.length < SHADOW_DETAIL_LIMIT) return c.shadowSummary ? c.shadowSummary.matched + c.shadowSummary.mismatched : ids.size;
    const times = [...ids].map(timeOf).filter(Number.isFinite);
    const [from, to] = [Math.min(...times), Math.max(...times)];
    return Math.max(ids.size, c.chats.filter((x) => timeOf(x.id) >= from && timeOf(x.id) <= to).length);
}

/** 같은 그림의 주소 변형(?type=f40_40 등)은 같은 배지로 본다. 화면 쪽은 변형과 원래 주소를 둘 다 갖는다 */
const baseUrl = (u: string) => u.split('?')[0];
const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
const over = (n: number, of: number) => n >= CONTENT_MIN && n / Math.max(of, 1) >= CONTENT_RATIO;
const typesOf = (types: Map<number, number>) => [...types].map(([t, n]) => `type ${t} ${n}건`).join(', ');

export function judgeContent(c: ContentSample, groupOf: Map<string, string>): Finding[] {
    const findings: Finding[] = [];
    const chats = new Map(c.chats.map((x) => [x.id, x]));

    // 1. 소켓 데이터가 화면과 같은가
    const sum = c.shadowSummary;
    const compared = comparedCount(c);
    if (compared >= CONTENT_MIN_COMPARED) {
        const tally = new Map<string, { level: 'risk' | 'info'; title: string; ids: Set<string>; types: Map<number, number>; samples: Set<string> }>();
        const add = (key: string, level: 'risk' | 'info', title: string, m: ShadowMismatch, sample?: string) => {
            const t = tally.get(key) ?? { level, title, ids: new Set<string>(), types: new Map<number, number>(), samples: new Set<string>() };
            if (!t.ids.has(m.id)) t.types.set(m.type, (t.types.get(m.type) ?? 0) + 1);
            t.ids.add(m.id);
            if (sample) t.samples.add(sample);
            tally.set(key, t);
        };
        for (const m of c.mismatches) {
            if (m.field !== 'badges') {
                add(`main:compare:${m.field}`, 'risk', `소켓과 원래 채팅의 ${m.field === 'name' ? '닉네임' : m.field === 'text' ? '본문' : '필터 판정'}이 다름`, m, `화면 ${JSON.stringify(m.html)} / 소켓 ${JSON.stringify(m.socket)}`.slice(0, 200));
                continue;
            }
            const onlyHtml = ((m.html as { onlyInHtml?: string[] })?.onlyInHtml ?? []);
            const onlySocket = ((m.socket as { onlyInSocket?: string[] })?.onlyInSocket ?? []);
            const socketBases = new Set((chats.get(m.id)?.badges ?? onlySocket).map(baseUrl));
            const htmlBases = new Set(onlyHtml.map(baseUrl));
            for (const u of onlyHtml.filter((u) => !socketBases.has(baseUrl(u)))) {
                const g = badgeGroup(baseUrl(u), groupOf);
                add(`main:compare:missing:${g}`, 'risk', `소켓 경로가 ${g} 배지를 빠뜨림 (원래 채팅엔 있음, 이 배지 필터가 채팅을 놓친다)`, m, u);
            }
            for (const u of onlySocket.filter((u) => !htmlBases.has(baseUrl(u)))) {
                const g = badgeGroup(baseUrl(u), groupOf);
                add(`main:compare:extra:${g}`, 'info', `HTML 대체 경로가 ${g} 배지를 못 읽음 (소켓엔 있음)`, m, u);
            }
        }
        for (const [key, t] of tally) {
            if (!over(t.ids.size, compared)) continue;
            findings.push({ key, level: t.level, title: `${t.title}: 비교한 채팅 ${compared}건 중 ${t.ids.size}건`, lines: [typesOf(t.types), ...[...t.samples].slice(0, 2)] });
        }
        if (sum && over(sum.htmlOnly, compared)) {
            findings.push({ key: 'main:compare:html-only', level: 'risk', title: `소켓이 놓친 채팅: 원래 채팅에만 ${sum.htmlOnly}건 (비교 ${compared}건)`, lines: [] });
        }
    }

    // 2. 수집 창이 제대로 그리나
    const pairs = c.items.flatMap((i) => (chats.has(i.key) ? [{ i, chat: chats.get(i.key)! }] : []));
    const render = { name: { n: 0, bad: new Map<number, number>(), sample: '' }, text: { n: 0, bad: new Map<number, number>(), sample: '' }, badges: { n: 0, bad: new Map<number, number>(), sample: '' } };
    const check = (field: keyof typeof render, ok: boolean, chat: TapChat, sample: string) => {
        const r = render[field];
        r.n++;
        if (ok) return;
        r.bad.set(chat.type, (r.bad.get(chat.type) ?? 0) + 1);
        r.sample ||= sample.slice(0, 200);
    };
    for (const { i, chat } of pairs) {
        const text = norm(i.text);
        if (!chat.anonymous && chat.nickname) check('name', text.includes(norm(chat.nickname)), chat, `${chat.nickname} → ${text}`);
        // 이모티콘({:이름:})은 그림으로 그려지므로 글자 비교에서 뺀다. 가려진 채팅은 안내 문구가 그려진다
        if (chat.status === 'NORMAL' && norm(chat.message) && !/\{:[^}]+:\}/.test(chat.message)) check('text', text.includes(norm(chat.message)), chat, `${chat.message} → ${text}`);
        if (chat.badges.length) check('badges', i.nameImgs >= chat.badges.length, chat, `소켓 배지 ${chat.badges.length}개, 그림 ${i.nameImgs}개 (${chat.id})`);
    }
    const label = { name: '닉네임', text: '본문', badges: '배지 그림' };
    for (const field of ['name', 'text', 'badges'] as const) {
        const r = render[field];
        const bad = [...r.bad.values()].reduce((a, b) => a + b, 0);
        if (!over(bad, r.n)) continue;
        findings.push({ key: `main:render:${field}`, level: 'risk', title: `수집 창이 ${label[field]}을(를) 제대로 안 그림: ${r.n}건 중 ${bad}건`, lines: [typesOf(r.bad), r.sample] });
    }
    return findings;
}

export const hostChats = (o: Partial<PageObservation>) => Math.max((o.sockets ?? []).reduce((n, s) => n + s.chats, 0), o.domChats ?? 0);

export function judgeMain(run: MainRun, groupOf = new Map<string, string>()): CheckReport {
    const base = { check: 'main', at: run.at };
    if (run.error) return { ...base, status: 'unknown', note: run.error, findings: [] };
    const host = hostChats(run);
    if (!host) return { ...base, status: 'unknown', note: '방송 채팅 없음', findings: [] };

    const sockets = run.sockets ?? [];
    const tapped = sockets.filter((s) => CHAT_SOCKET_URL.test(s.url));
    const tappedChats = tapped.reduce((n, s) => n + s.chats, 0);
    const where = [`방송 채팅 ${host}줄 (소켓 ${tappedChats}, 화면 ${run.domChats ?? 0})`, ...(run.url ? [run.url] : []), ...(run.version ? [`확장 v${run.version}`] : [])];
    const findings: Finding[] = [];

    if (!run.paneExists) {
        findings.push({
            key: 'main:no-pane',
            level: 'broken',
            title: '치지직 라이브에 수집 창이 생기지 않음',
            lines: [
                ...where,
                run.container ? `채팅 컨테이너 선택자는 화면에서 ${run.container}개 맞음` : '채팅 컨테이너 선택자(chatRoomLive)가 화면에서 0개. 수집 창이 붙을 곳이 없다',
                '고치는 법: docs/ota-selectors.md',
            ],
        });
    } else if (!run.pane) {
        findings.push({ key: 'main:empty-pane', level: 'broken', title: '치지직 라이브 수집 창이 비었음', lines: where });
    } else if (run.content) {
        findings.push(...judgeContent(run.content, groupOf));
    }

    // 탭이 채팅을 넘겼으면 소켓 경로는 산다. 안 넘겼으면 나머지는 원인 단서다
    if (!run.tapDelivered) {
        const reasons = ['확장의 소켓 탭이 채팅을 하나도 넘기지 않음'];
        if (!run.tapInstalled) reasons.push('탭이 페이지에 설치되지 않음 (ws-tap.ts)');
        if (!tapped.length) reasons.push(`탭이 기다리는 주소의 소켓이 열리지 않음 (열린 소켓: ${sockets.map((s) => s.url).join(', ') || '없음'})`);
        else if (!tappedChats) reasons.push('소켓 메시지를 확장 파서가 채팅으로 읽지 못함');
        else reasons.push('소켓과 파서는 정상. 탭 주소 규칙이나 탭이 확장으로 넘기는 부분을 볼 것 (src/platform/chzzk-socket-url.ts, ws-tap.ts)');
        findings.push({
            key: 'main:socket-path',
            level: 'risk',
            title: run.pane ? '소켓 경로가 죽어 HTML 대체 경로로 동작 중' : '소켓 경로가 죽음',
            lines: [...reasons, ...where, '급하면 OTA constants.socketRender: 0 (docs/ota-selectors.md)'],
        });
    }

    // 확장은 형식 번호가 안 맞으면 받은 선택자를 조용히 버린다 (ota-fetch.ts, host-selectors.ts setManifest)
    const rev = run.ota && effectiveRev(run.ota);
    if (run.ota?.cdn !== undefined && rev !== undefined && rev < run.ota.cdn) {
        findings.push({
            key: 'main:ota-rev',
            level: 'risk',
            title: `확장이 jsDelivr의 선택자 rev ${run.ota.cdn}을(를) 적용하지 않음 (지금 rev ${rev})`,
            lines: [
                run.ota.applied === undefined ? `받아 적용한 선택자 없음, 확장에 든 rev ${run.ota.bundled}` : `받아 적용한 rev ${run.ota.applied}`,
                '형식 번호(schemaVersion)나 검증에 걸려 버려졌는지 볼 것: src/platform/host-selectors.ts setManifest, ota-fetch.ts',
                ...where,
            ],
        });
    }

    return { ...base, status: findings.length ? 'issue' : 'ok', findings };
}

/**
 * 스토어 버전과 최신 릴리스가 다를 때(스토어 심사 중) 둘 다 시험한 판정을 하나로 합친다.
 * 사용자 대부분은 스토어 버전을 쓴다. 번갈아 시험하면 한쪽만 고장일 때 사건이 열렸다 닫혔다 하므로 한 보고서에 둘 다 담는다.
 * 스토어 쪽 사건은 key를 main:store:로 구분한다. 한쪽만 확인 못 했으면 그쪽을 unknownParts로 남겨 그쪽 사건을 닫지 않는다.
 */
const LATEST_PART = '최신 릴리스';
const STORE_PART = '스토어 버전';

export function mergeStoreReport(latest: CheckReport, store: CheckReport, storeVersion: string): CheckReport {
    const findings = [
        ...latest.findings.map((f) => ({ ...f, part: LATEST_PART })),
        ...store.findings.map((f) => ({ ...f, part: STORE_PART, key: f.key.replace(/^main:/, 'main:store:'), title: `스토어 v${storeVersion}: ${f.title}` })),
    ];
    const blind = (r: CheckReport) => r.status === 'unknown' || r.status === 'error';
    if (blind(latest) && blind(store)) return { ...latest, findings };
    const unknownParts = [
        ...(blind(latest) ? [{ part: LATEST_PART, note: latest.note ?? '확인 못 함' }] : []),
        ...(blind(store) ? [{ part: STORE_PART, note: store.note ?? '확인 못 함' }] : []),
    ];
    return { check: 'main', at: latest.at, status: findings.length ? 'issue' : 'ok', findings, ...(unknownParts.length ? { unknownParts } : {}) };
}
