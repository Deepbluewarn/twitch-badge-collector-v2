import { BaseContainer } from "../base/container";
import { Handle } from "../base/handler";
import { addHistoryStateListener } from "../base/historyStateListener";
import { Observer } from "../base/observer";
import { Logger } from "@/utils/logger";
import { ChzzkAdapter } from "@/platform/chzzk";

const adapter = new ChzzkAdapter();

const liveContainer = new BaseContainer(
    adapter,
    new Handle(adapter, '#tbc-chzzk-chat-list-container'),
    '.live_chatting_list_wrapper__a5XTV',
);

const vodContainer = new BaseContainer(
    adapter,
    new Handle(adapter, '#tbc-chzzk-chat-list-container'),
    '.vod_chatting_list__+LZHw',
    '.pzp-pc__video video.webplayer-internal-video',
    '#tbc-clone__chzzkui',
)

function init() {
    const mode = adapter.getPageMode();

    console.log('init pageMode: ', mode)

    if (mode === 'video') {
        vodContainer.create();
    } else if (mode === 'live') {
        liveContainer.create();
    }
}

init()

addHistoryStateListener('chzzk.naver.com', init);

new Observer('.live_chatting_power_button__Ov3eJ', false).observe(async (elem) => {
    if (!elem) return;

    if (elem) {
        const isPointAutoOn = (await browser.storage.local.get('pointBoxAuto')).pointBoxAuto;

        if (isPointAutoOn === 'off') return;

        (elem as HTMLButtonElement).click();
        Logger('observe .live_chatting_power_button__Ov3eJ callback: ', '포인트 박스를 클릭했어요!')
    }
})
