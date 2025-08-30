
import { getReactProps } from "@/utils/react";
import { Observer } from "../base/observer"

let path = window.location.pathname.split('/')[1];

const liveObserver = new Observer('.chat-room__content [class*="chat-list--"] .scrollable-area', false);
const vodObserver = new Observer('.video-chat__message-list-wrapper', false)

const callback = (elem: Element | null, mr?: MutationRecord[]) => {
    if (!mr) return;

    const records = Array.from(mr);

    records.forEach(mr => {
        const addedNodes = mr.addedNodes;
        if (!addedNodes) return;

        addedNodes.forEach((node) => {
            const _props = getReactProps(node);
            
            let badges, message_id, message_channel, message_channel_id;

            if (isLive()) {
                const message = _props?.children?.props?.message; // object
                message_id = message?.id;
                message_channel = _props?.children?.props?.channelLogin;
                badges = message?.badges; // ex.. {moderator: '1', founder: '0', subtember-2024: '1'}
            } else {
                // VOD
                const message_context = _props?.children?.props?.messageContext;
                message_id = message_context?.comment?.message?.id;
                message_channel_id = message_context?.comment?.channelId;
                badges = message_context?.comment?.userBadges;
            }

            if (badges) {
                let badges_str = Object.entries(badges).map(b => `${b[0]}/${b[1]}`);
                (node as Element).setAttribute('data-tbc-chat-badges', JSON.stringify(badges_str));
            }

            if (message_id) {
                (node as Element).setAttribute('data-tbc-chat-key', message_id ?? '');
            }

            if (message_channel) {
                (node as Element).setAttribute('data-tbc-chat-channel', message_channel);
            }

            if (message_channel_id) {
                (node as Element).setAttribute('data-tbc-chat-channel-id', message_channel_id);
            }
        })
    })
}

function isLive() {
    return path !== 'videos';
}

function init() {
    path = window.location.pathname.split('/')[1];

    if (isLive()) {
        liveObserver.observe(callback);
    } else {
        vodObserver.observe(callback);
    }
}

init();

window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;

    const message = event.data;
    if (message.action === 'tbc-historyUpdated') {
        init();
    }
});
