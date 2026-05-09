import { getReactProps } from "@/utils/react";
import { Observer } from "../base/observer";
import { CHAT_ATTR } from "@/interfaces/chat-attributes";

const callback = (elem: Element | null, mr?: MutationRecord[]) => {
    if (!mr) return;

    const records = Array.from(mr);

    records.forEach(mr => {
        const addedNodes = mr.addedNodes;
        if (!addedNodes) return;

        addedNodes.forEach((node) => {
            const _props = getReactProps(node);
            const chatMessage = _props?.children?.props?.chatMessage;
            const props = _props?.children?.props;

            const isReplayChat = props?.isReplayChat;
            const time = isReplayChat ? chatMessage?.playerMessageTime : chatMessage?.time;
            const badges = chatMessage?.displayBadgeList;

            const el = node as Element;
            el.setAttribute(CHAT_ATTR.KEY, chatMessage?.key);
            el.setAttribute(CHAT_ATTR.TIME, time);
            el.setAttribute(CHAT_ATTR.BADGES, JSON.stringify(badges?.map((e: any) => e.imageSource)));

            if (isReplayChat) {
                el.setAttribute(CHAT_ATTR.REPLAY_CHAT, isReplayChat);
            }
        })
    })
}

function init() {
    const liveObserver = new Observer('.live_chatting_list_wrapper__a5XTV', false);
    const vodObserver = new Observer('.vod_chatting_list__+LZHw', false)

    liveObserver.observe(callback);
    vodObserver.observe(callback);
}

init();

window.addEventListener('message', (e)=> {
    if (e.source !== window) {
        return;
    }

    if (e.data.type !== 'TBC_ON_HISTORY_STATE_UPDATED') {
        return;
    }

    init();
});
