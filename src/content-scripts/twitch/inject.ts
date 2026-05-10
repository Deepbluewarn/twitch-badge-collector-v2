import { getReactProps } from "@/utils/react";
import { Observer } from "../base/observer";
import { CHAT_ATTR } from "@/interfaces/chat-attributes";
import { getPlatformConfig, getAtPath, manifestReady } from "@/platform/host-selectors";

let path = window.location.pathname.split('/')[1];

function isLive() {
    return path !== 'videos';
}

const callback = (_elem: Element | null, mr?: MutationRecord[]) => {
    if (!mr) return;

    const records = Array.from(mr);

    records.forEach(mr => {
        const addedNodes = mr.addedNodes;
        if (!addedNodes) return;

        addedNodes.forEach((node) => {
            const _props = getReactProps(node);
            const paths = getPlatformConfig('twitch').reactPropsPaths!;
            const propPaths = isLive() ? paths.live! : paths.vod!;

            const message_id = getAtPath<string>(_props, propPaths.messageId);
            const message_channel = isLive()
                ? getAtPath<string>(_props, propPaths.channelLogin)
                : undefined;
            const message_channel_id = !isLive()
                ? getAtPath<string>(_props, propPaths.channelId)
                : undefined;
            const badges = getAtPath<Record<string, string>>(_props, propPaths.badges);

            const el = node as Element;

            if (badges) {
                let badges_str = Object.entries(badges).map(b => `${b[0]}/${b[1]}`);
                el.setAttribute(CHAT_ATTR.BADGES, JSON.stringify(badges_str));
            }
            if (message_id) el.setAttribute(CHAT_ATTR.KEY, message_id);
            if (message_channel) el.setAttribute(CHAT_ATTR.CHANNEL, message_channel);
            if (message_channel_id) el.setAttribute(CHAT_ATTR.CHANNEL_ID, message_channel_id);
        });
    });
};

let liveObserver: Observer | null = null;
let vodObserver: Observer | null = null;

function init() {
    path = window.location.pathname.split('/')[1];
    const sel = getPlatformConfig('twitch').selectors;

    // 매번 새 Observer 만듦 — manifest가 갱신됐을 수 있으므로 selector 다시 읽음.
    liveObserver = new Observer(sel.chatRoomLive, false);
    vodObserver = new Observer(sel.chatRoomVod, false);

    if (isLive()) liveObserver.observe(callback);
    else vodObserver.observe(callback);
}

async function bootstrap() {
    await manifestReady; // ISOLATED content가 보낸 manifest 적용 (또는 200ms 후 bundled)
    init();
}

bootstrap();

window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const message = event.data;
    if (message?.action === 'tbc-historyUpdated') {
        init();
    }
});
