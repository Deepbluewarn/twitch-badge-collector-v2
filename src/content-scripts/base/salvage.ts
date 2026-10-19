/**
 * 확장이 업데이트될 때 모아보기 창에 보이던 채팅을 새 창으로 넘긴다.
 *
 * 업데이트는 사용자가 한 일이 아니라, 채팅 유지 설정(새로고침·탭 이동 때 남길지)과 상관없이 보던 채팅이
 * 그대로 있어야 한다. 그런데 새 스크립트는 빈 창에서 시작하고, 저장소로는 다 넘길 수 없다:
 *  - 채팅 유지를 껐거나 트위치(채팅 유지 미지원)면 저장소에 아무것도 없다.
 *  - 2.23.0 이하는 storage.session에 둬서 업데이트 때 비워진다.
 * 대신 화면의 옛 창에는 채팅이 key·시각과 함께 그대로 있다. 새 스크립트가 시작하자마자 —
 * 옛 스크립트가 물러나며 창을 걷기 전에(lifecycle.ts startInstance) — 그대로 떠 두고, 새 창이 처음 채울 때 쓴다.
 */
import type { SettingInterface } from '@/interfaces/setting';
import { CHAT_ATTR } from '@/interfaces/chat-attributes';

type Platform = SettingInterface['platform'];

export interface LeftoverChat {
    key: string;
    time: number;
    html: string;
    /** 옛 창이 붙인 채널 표시(title). 다른 채널 채팅을 거르는 데만 쓴다. */
    title: string;
}

let leftovers: LeftoverChat[] = [];

/** 옛 창(이름 바꾸기 전, 또는 이미 -stale로 숨긴 것)의 채팅을 화면 순서대로 떠 둔다. 동기. */
export function snapshotLeftoverChats(type: Platform) {
    const panes = [`#${type}-container`, `#tbc-floating-${type}`, `#${type}-container-stale`, `#tbc-floating-${type}-stale`];
    const seen = new Set<string>();
    leftovers = [...document.querySelectorAll<HTMLElement>(panes.map(p => `${p} [${CHAT_ATTR.KEY}]`).join(','))]
        .filter(el => !el.parentElement?.closest(`[${CHAT_ATTR.KEY}]`))
        .flatMap(el => {
            const key = el.getAttribute(CHAT_ATTR.KEY)!;
            if (seen.has(key)) return [];
            seen.add(key);
            const clone = el.cloneNode(true) as HTMLElement;
            const title = clone.getAttribute('title') ?? '';
            clone.removeAttribute('title');
            return [{ key, time: Number(el.getAttribute(CHAT_ATTR.TIME)) || 0, html: clone.outerHTML, title }];
        });
}

/** 떠 둔 채팅 중 이 채널 것을 한 번만 내준다. 채널이 아직 정해지지 않았으면 남겨 둔다. */
export function takeLeftoverChats(channelId: string | null | undefined): Omit<LeftoverChat, 'title'>[] {
    if (!channelId || leftovers.length === 0) return [];
    const taken = leftovers.filter(c => !c.title || c.title.includes(channelId)).map(({ title: _, ...c }) => c);
    leftovers = [];
    return taken;
}
