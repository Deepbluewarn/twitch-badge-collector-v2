import { BaseContainer } from "../base/container";
import { Handle } from "../base/handler";
import { addHistoryStateListener } from "../base/historyStateListener";
import { Observer } from "../base/observer";
import { Logger } from "@/utils/logger";
import { ChzzkAdapter } from "@/platform/chzzk";
import {
    getPlatformConfig, manifestReady, getManifest,
    SELECTORS_MESSAGE_TYPE,
} from "@/platform/host-selectors";

async function bootstrap() {
    await manifestReady;
    window.postMessage({ type: SELECTORS_MESSAGE_TYPE, manifest: getManifest() }, '*');

    const adapter = new ChzzkAdapter();
    const SEL = getPlatformConfig('chzzk').selectors;

    const liveContainer = new BaseContainer(
        adapter,
        new Handle(adapter, '#tbc-chzzk-chat-list-container'),
        SEL.chatRoomLive,
    );

    const vodContainer = new BaseContainer(
        adapter,
        new Handle(adapter, '#tbc-chzzk-chat-list-container'),
        SEL.chatRoomVod,
        SEL.video,
        '#tbc-clone__chzzkui',
    );

    function init() {
        const mode = adapter.getPageMode();
        console.log('init pageMode: ', mode);
        if (mode === 'video') vodContainer.create();
        else if (mode === 'live') liveContainer.create();
    }

    init();
    addHistoryStateListener('chzzk.naver.com', init);

    if (SEL.pointButton) {
        new Observer(SEL.pointButton, false).observe(async (elem) => {
            if (!elem) return;
            const isPointAutoOn = (await browser.storage.local.get('pointBoxAuto')).pointBoxAuto;
            if (isPointAutoOn === 'off') return;
            (elem as HTMLButtonElement).click();
            Logger('observe pointButton callback: ', '포인트 박스를 클릭했어요!');
        });
    }
}

bootstrap();
