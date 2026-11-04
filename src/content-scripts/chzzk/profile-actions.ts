import { CHAT_ATTR } from '@/interfaces/chat-attributes';
import type { CompositeFilterElement } from '@/interfaces/filter';
import { userIdFromHostKey } from '@/platform/chzzk';
import { getPlatformConfig } from '@/platform/host-selectors';
import { personState, togglePerson, type Person, type PersonState } from '@/filter/person';
import { isChannelOffNow } from '../base/channel-off-flag';

/**
 * 치지직 원래 채팅에서 닉네임을 누르면 뜨는 프로필 창에 "채팅 수집", "채팅 제외"를 붙인다.
 * 누르면 그 사람(ID)의 필터를 넣고, 다시 누르면 뺀다 (src/filter/person.ts).
 *
 * 프로필 창에는 사람 ID가 없다. 그래서 닉네임을 누르는 순간(capture) 그 채팅의 host key에서 ID를 꺼내 두고,
 * 곧 뜨는 창을 찾아 붙인다. 창은 누른 채팅 안에 그려진다(2026-11 실측). 못 찾으면 붙이지 않는다.
 * 버튼 모양은 창에 원래 있는 버튼의 class를 빌려 쓴다 — hash가 바뀌어도 따라간다.
 * 선택자는 OTA로 바꿀 수 있고(profilePopup, profilePopupActions), 없으면 아래 기본값.
 */
const MARK = 'tbcv2-profile-action';
const POPUP = '[role="alertdialog"]';
const ACTIONS = '[class*="_list_"]';
const WAIT_MS = 1500;

const ICON: Record<'include' | 'exclude', string> = {
    include: '<path d="M6 7.5h13a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-6.5l-3.5 3v-3H6A1.5 1.5 0 0 1 4.5 16V9A1.5 1.5 0 0 1 6 7.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M12.5 10v5M10 12.5h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    exclude: '<circle cx="12.5" cy="12.5" r="7" stroke="currentColor" stroke-width="1.3"/><path d="M7.6 7.6l9.8 9.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
};
const LABEL = {
    include: ['profileCollect', 'profileCollectUndo'],
    exclude: ['profileExclude', 'profileExcludeUndo'],
} as const;

const readFilters = async () => ((await browser.storage.local.get('filter')).filter ?? []) as CompositeFilterElement[];

function decorate(popup: Element, person: Person) {
    if (popup.querySelector(`.${MARK}`)) return;
    const sel = getPlatformConfig('chzzk').selectors;
    const list = popup.querySelector(sel.profilePopupActions ?? ACTIONS);
    const sample = list?.querySelector('button');
    if (!list || !sample) return;
    const iconClass = sample.querySelector('svg')?.getAttribute('class') ?? '';

    const buttons = (['include', 'exclude'] as const).map(kind => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `${sample.className} ${MARK}`;
        b.innerHTML = `<svg width="25" height="25" viewBox="0 0 25 25" fill="none" aria-hidden="true" class="${iconClass}">${ICON[kind]}</svg><span></span>`;
        b.addEventListener('click', async () => {
            if (b.disabled) return;
            buttons.forEach(x => x.disabled = true);
            try {
                const next = togglePerson(await readFilters(), person, kind);
                await browser.storage.local.set({ filter: next });
                render(personState(next, person.userId));
            } finally {
                buttons.forEach(x => x.disabled = false);
            }
        });
        list.append(b);
        return b;
    });
    const render = (state: PersonState) => buttons.forEach((b, i) => {
        const kind = i === 0 ? 'include' : 'exclude';
        b.querySelector('span')!.textContent = browser.i18n.getMessage(LABEL[kind][state === kind ? 1 : 0]);
        b.setAttribute('aria-pressed', String(state === kind));
    });
    render(null);
    fitInView(popup);
    readFilters().then(f => render(personState(f, person.userId))).catch(() => { /* 끊긴 뒤 — 기본 문구 그대로 */ });
}

/**
 * 치지직은 창을 열 때 높이를 재서 화면 안에 놓는다. 버튼은 그 뒤에 붙으니 아래쪽 채팅에서 연 창은 화면 밖으로
 * 밀린다 — 넘친 만큼 올린다(창 위쪽이 화면 밖으로 나가지 않는 데까지).
 */
function fitInView(popup: Element) {
    const el = popup as HTMLElement;
    const rect = el.getBoundingClientRect();
    const over = Math.min(rect.bottom + 8 - window.innerHeight, rect.top);
    const top = parseFloat(getComputedStyle(el).top);
    if (over > 0 && Number.isFinite(top)) el.style.top = `${top - over}px`;
}

export function setupProfileActions(): () => void {
    let timer: number | undefined;

    const onClick = (e: MouseEvent) => {
        if (isChannelOffNow()) return;
        const sel = getPlatformConfig('chzzk').selectors;
        const item = (e.target as Element | null)?.closest?.('button[aria-haspopup="true"]')?.closest(`[${CHAT_ATTR.KEY}]`);
        // 원래 채팅만 — 수집 영역의 복제본도 key를 달고 있지만 거기선 프로필 창이 안 뜬다
        if (!item?.parentElement?.matches(`${sel.chatRoomLive}, ${sel.chatRoomVod}`)) return;
        const userId = userIdFromHostKey(item.getAttribute(CHAT_ATTR.KEY) ?? '');
        if (!userId) return;   // 익명 후원 등
        const nickname = item.querySelector(sel.displayName)?.textContent?.trim() ?? '';

        window.clearInterval(timer);
        const until = Date.now() + WAIT_MS;
        timer = window.setInterval(() => {
            const popup = item.querySelector(sel.profilePopup ?? POPUP);
            if (popup) {
                const img = popup.querySelector('img')?.getAttribute('src') ?? '';
                // 사진을 안 올린 사람은 기본 그림 — 저장하지 않는다
                decorate(popup, { userId, nickname, image: img && !img.includes('default_profile') ? img : undefined });
            }
            if (popup || Date.now() > until) window.clearInterval(timer);
        }, 50);
    };

    document.addEventListener('click', onClick, true);
    return () => {
        document.removeEventListener('click', onClick, true);
        window.clearInterval(timer);
        document.querySelectorAll(`.${MARK}`).forEach(b => b.remove());
    };
}
