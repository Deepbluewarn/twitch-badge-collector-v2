import { getReactProps } from "@/utils/react";
import { Observer } from "../base/observer";
import { CHAT_ATTR } from "@/interfaces/chat-attributes";
import { getPlatformConfig, getAtPath, manifestReady } from "@/platform/host-selectors";

const callback = (_elem: Element | null, mr?: MutationRecord[]) => {
    if (!mr) return;

    const records = Array.from(mr);

    records.forEach(mr => {
        const addedNodes = mr.addedNodes;
        if (!addedNodes) return;

        addedNodes.forEach((node) => {
            const _props = getReactProps(node);
            const paths = getPlatformConfig('chzzk').reactPropsPaths!;
            // live와 vod의 차이는 messageTime 필드만 — isReplayChat 값으로 분기.
            const isReplayChat = getAtPath<boolean>(_props, paths.live!.isReplayChat);
            const propPaths = isReplayChat ? paths.vod! : paths.live!;

            const messageKey = getAtPath<string>(_props, propPaths.messageKey);
            const time = getAtPath<string | number>(_props, propPaths.messageTime);
            const badges = getAtPath<Array<{ imageSource: string }>>(_props, propPaths.messageBadges);

            const el = node as Element;
            el.setAttribute(CHAT_ATTR.KEY, messageKey ?? '');
            el.setAttribute(CHAT_ATTR.TIME, String(time ?? ''));
            el.setAttribute(CHAT_ATTR.BADGES, JSON.stringify(badges?.map((e) => e.imageSource) ?? []));
            if (isReplayChat) el.setAttribute(CHAT_ATTR.REPLAY_CHAT, String(isReplayChat));
        });
    });
};

function init() {
    const sel = getPlatformConfig('chzzk').selectors;
    const liveObserver = new Observer(sel.chatRoomLive, false);
    const vodObserver = new Observer(sel.chatRoomVod, false);
    liveObserver.observe(callback);
    vodObserver.observe(callback);
}

async function bootstrap() {
    await manifestReady;
    init();
}

bootstrap();

window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (e.data?.type !== 'TBC_ON_HISTORY_STATE_UPDATED') return;
    init();
});
