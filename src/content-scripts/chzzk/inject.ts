import { getReactProps } from "@/utils/react";
import { Observer } from "../base/observer";
import { CHAT_ATTR, TBC_CHAT_PASSED_ACTION, TbcChatPassedMessage } from "@/interfaces/chat-attributes";
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
            const key = messageKey ?? '';
            el.setAttribute(CHAT_ATTR.KEY, key);
            el.setAttribute(CHAT_ATTR.TIME, String(time ?? ''));
            el.setAttribute(CHAT_ATTR.BADGES, JSON.stringify(badges?.map((e) => e.imageSource) ?? []));
            if (isReplayChat) el.setAttribute(CHAT_ATTR.REPLAY_CHAT, String(isReplayChat));

            // key 없으면 ISOLATED에서 querySelector로 못 찾으므로 skip.
            if (!key) return;

            // 같은 MAIN 동기 컨텍스트에서 prevSibling key 추출 — forEach 순차 실행이므로
            // 이번 batch 중 자신 이전 chat들은 이미 KEY 세팅 완료. 이전 mutation에서 들어온
            // chat들도 KEY 보유. race 없음.
            let prev = el.previousElementSibling;
            while (prev && !prev.getAttribute(CHAT_ATTR.KEY)) {
                prev = prev.previousElementSibling;
            }
            const prevKey = prev?.getAttribute(CHAT_ATTR.KEY) ?? null;

            const msg: TbcChatPassedMessage = {
                action: TBC_CHAT_PASSED_ACTION,
                key,
                time: typeof time === 'number' ? time : parseInt(String(time ?? '0'), 10) || 0,
                prevKey,
                html: (el as HTMLElement).outerHTML,
            };
            window.postMessage(msg, '*');
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
