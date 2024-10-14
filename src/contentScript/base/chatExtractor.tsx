import { ChatInfo } from "@interfaces/chat";
import { SettingInterface } from "@interfaces/setting";

export class ChatExtractor {
    type: SettingInterface['platform'] = 'chzzk';

    constructor(type: SettingInterface['platform']) {
        this.type = type;
    }

    // 채팅 추출이 가능한지 확인하는 작업
    prep(node: Node) {
        const nodeElement = node as HTMLElement;

        // 채팅 클릭 시 유저 프로필이 MutationObserver의 이벤트에 잡히는 것을 방지
        // 치지직 플랫폼에만 적용.
        if (nodeElement.classList.contains('live_chatting_popup_profile_header__OWnnU')) {
            return false;
        };

        if (!nodeElement || nodeElement.nodeType !== 1) {
            return false;
        };
        if (!nodeElement.closest(`#tbc-${this.type}-chat-list-wrapper`)) {
            return false;
        };

        const room_clone_parent = (
            nodeElement.closest(`#tbc-${this.type}-chat-list-wrapper`)?.parentNode
        ) as HTMLDivElement;

        if (!room_clone_parent) {
            return false;
        };

        return true;
    }
    extract(node: Node): ChatInfo | undefined {
        if (!this.prep(node)) return;

        // 플랫폼에 맞게 구현해야 함.
    }

}

export function checkVerifiedBadge(chat_clone: Element): boolean {
    const verifiedBadge = (
        chat_clone.getElementsByClassName("name_icon__zdbVH")[0]
    ) as HTMLElement;

    if (verifiedBadge === undefined) return false;

    const text = verifiedBadge.getElementsByClassName('blind')[0].textContent;

    return text === '인증 마크';
}