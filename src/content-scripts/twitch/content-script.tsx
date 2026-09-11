import { BaseContainer } from "../base/container";
import { Handle } from "../base/handler";
import { addHistoryStateListener } from "../base/historyStateListener";
import { Observer } from "../base/observer";
import { Logger } from "@/utils/logger";
import { TwitchAdapter } from "@/platform/twitch";
import {
    getPlatformConfig, manifestReady, getManifest,
    SELECTORS_MESSAGE_TYPE,
} from "@/platform/host-selectors";
import { registerDiagnoseListener } from "@/platform/diagnose";
import { startSelectorHealthWatch } from "@/platform/selector-health";

async function bootstrap() {
    // Manifest(OTA 또는 bundled) 적용 완료까지 대기 후 observer 부착.
    // 안 그러면 bundled selector로 attach해서 OTA 효과 못 봄.
    await manifestReady;

    // MAIN world inject가 같은 manifest 쓰도록 forward.
    window.postMessage({ type: SELECTORS_MESSAGE_TYPE, manifest: getManifest() }, '*');

    const adapter = new TwitchAdapter();
    registerDiagnoseListener(adapter, 'twitch');

    // required selector가 전멸했는지 조용히 관찰해 broken 레지스트리를 채운다.
    // Adapter.extract가 이걸 읽어 ChatInfo.unavailable을 세팅 → 확정 못 한 필드를 쓰는
    // 필터만 평가에서 빠진다. UI도 네트워크 요청도 없다 (selector-health 상단 주석 참고).
    // Container mount 여부와 무관해야 하므로 React 밖 — content-script bootstrap에 둔다.
    let stopHealthWatch = startSelectorHealthWatch(adapter, 'twitch');

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
        // 채널 이동 = 새 DOM. 옛 페이지 기준 판정을 버리고 다시 검사.
        stopHealthWatch();
        stopHealthWatch = startSelectorHealthWatch(adapter, 'twitch');
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
