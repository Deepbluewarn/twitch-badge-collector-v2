import { CHAT_ATTR } from '@/interfaces/chat-attributes';
import { userIdFromHostKey } from '@/platform/chzzk';
import { getPlatformConfig } from '@/platform/host-selectors';
import { isChannelOffNow } from '../base/channel-off-flag';

/**
 * 치지직 원래 채팅에서 닉네임을 누르면 뜨는 프로필 창에 "ID 복사"를 붙인다.
 * 복사한 ID를 설정 페이지 닉네임 칸에 붙여 넣으면 그 사람으로 고른다 (NicknameInput).
 * 필터를 여기서 바로 넣고 빼지는 않는다 — 배열 필터와 겹치면 창에 보일 상태가 복잡해져서, 필터 설정은 설정 페이지에서만.
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
const COPIED_MS = 1500;

const STROKE = 'stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"';
const ICON = {
    copy: `<rect x="9" y="9" width="10.5" height="10.5" rx="1.5" ${STROKE}/><path d="M16 9V6.5A1.5 1.5 0 0 0 14.5 5h-8A1.5 1.5 0 0 0 5 6.5v8A1.5 1.5 0 0 0 6.5 16H9" ${STROKE}/>`,
    done: `<path d="M6.5 13l4 4 8-9" ${STROKE}/>`,
};

function decorate(popup: Element, userId: string) {
    if (popup.querySelector(`.${MARK}`)) return;
    const sel = getPlatformConfig('chzzk').selectors;
    const list = popup.querySelector(sel.profilePopupActions ?? ACTIONS);
    const sample = list?.querySelector('button');
    if (!list || !sample) return;
    const iconClass = sample.querySelector('svg')?.getAttribute('class') ?? '';

    const b = document.createElement('button');
    b.type = 'button';
    b.className = `${sample.className} ${MARK}`;
    b.title = userId;
    let reset: number | undefined;
    const show = (copied: boolean) => {
        b.innerHTML = `<svg width="25" height="25" viewBox="0 0 25 25" fill="none" aria-hidden="true" class="${iconClass}">${copied ? ICON.done : ICON.copy}</svg><span></span>`;
        b.querySelector('span')!.textContent = browser.i18n.getMessage(copied ? 'profileIdCopied' : 'profileCopyId');
    };
    b.addEventListener('click', () => {
        navigator.clipboard.writeText(userId).then(() => {
            show(true);
            window.clearTimeout(reset);
            reset = window.setTimeout(() => show(false), COPIED_MS);
        }).catch(e => console.warn('[tbcv2] ID copy failed', e));
    });
    show(false);
    list.append(b);
    fitInView(popup);
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

        window.clearInterval(timer);
        const until = Date.now() + WAIT_MS;
        timer = window.setInterval(() => {
            const popup = item.querySelector(sel.profilePopup ?? POPUP);
            if (popup) decorate(popup, userId);
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
