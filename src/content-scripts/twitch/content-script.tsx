import { BaseContainer } from "../base/container";
import { Handle } from "../base/handler";
import { addHistoryStateListener } from "../base/historyStateListener";
import { Observer } from "../base/observer";
import { Logger } from "@/utils/logger";
import { TwitchAdapter } from "@/platform/twitch";
import {
    getPlatformConfig, manifestReady, getManifest,
    SELECTORS_MESSAGE_TYPE, SELECTORS_REQUEST_TYPE,
} from "@/platform/host-selectors";
import { registerDiagnoseListener } from "@/platform/diagnose";

async function bootstrap() {
    // Manifest(OTA 또는 bundled) 적용 완료까지 대기 후 observer 부착.
    // 안 그러면 bundled selector로 attach해서 OTA 효과 못 봄.
    await manifestReady;

    // MAIN world inject가 같은 manifest 쓰도록 forward. MAIN 은 browser API 가 없어
    // storage 를 못 읽으므로 이 경로가 유일하다.
    // 듣기 먼저, 보내기 나중: MAIN 이 우리보다 먼저 떠서 요청을 이미 쐈다면 초기 push
    // 전에 그 요청을 받을 수 있어야 한다.
    const sendManifest = () =>
        window.postMessage({ type: SELECTORS_MESSAGE_TYPE, manifest: getManifest() }, '*');

    window.addEventListener('message', (e) => {
        if (e.source !== window) return;
        if (e.data?.type !== SELECTORS_REQUEST_TYPE) return;
        sendManifest();
    });

    sendManifest();

    const adapter = new TwitchAdapter();
    registerDiagnoseListener(adapter, 'twitch');

    const SEL = getPlatformConfig('twitch').selectors;

    const liveContainer = new BaseContainer(
        adapter,
        new Handle(adapter, '#tbc-twitch-chat-list-container'),
        SEL.chatRoomLive,
    );

    const vodContainer = new BaseContainer(
        adapter,
        new Handle(adapter, '#tbc-twitch-chat-list-container'),
        SEL.chatRoomVod,
        SEL.video,
        '#tbc-clone__twitchui',
    );

    function init() {
        if (adapter.getPageMode() === 'video') {
            vodContainer.create();
        } else {
            liveContainer.create();
        }
    }

    init();

    addHistoryStateListener('www.twitch.tv', init);
    addHistoryStateListener('www.twitch.tv', () => {
        window.postMessage({ action: 'tbc-historyUpdated' });
    });

    // 포인트 상자 자동 클릭
    if (SEL.pointButtonContainer && SEL.pointButton) {
        new Observer(SEL.pointButtonContainer, false).observe(async (elem) => {
            if (!elem) return;
            const boxBtn = elem.querySelector<HTMLButtonElement>(SEL.pointButton!);
            if (!boxBtn) return;

            const isPointAutoOn = (await browser.storage.local.get('pointBoxAuto')).pointBoxAuto;
            if (isPointAutoOn === 'off') return;

            boxBtn.click();
            Logger('observe pointButtonContainer callback: ', '포인트 박스를 클릭했어요!');
        });
    }
}

bootstrap();
