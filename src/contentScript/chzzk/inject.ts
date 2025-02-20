import { getReactProps } from "@utils/react";
import { Observer } from "../base/observer"
import { ChatInfo } from "@interfaces/chat";

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

            const time = props?.isReplayChat ? chatMessage?.playerMessageTime : chatMessage?.time;
            const verified = chatMessage?.profile?.verifiedMark;
            const badges = chatMessage?.displayBadgeList;
            const content = chatMessage?.content;

            (node as Element).setAttribute('data-tbc-chat-key', chatMessage?.key);
            (node as Element).setAttribute('data-tbc-chat-time', time);
            (node as Element).setAttribute('data-tbc-chat-replay-chat', props?.isReplayChat);
            (node as Element).setAttribute('data-tbc-chat-verified', verified);
            (node as Element).setAttribute('data-tbc-chat-badges', JSON.stringify(badges?.map((e: any) => e.imageSource)));

            const chatInfo: ChatInfo = {
                badges: [],
                textContents: [''],
                loginName: '',
                nickName: '',
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

