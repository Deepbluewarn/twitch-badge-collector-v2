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
    setupFullscreenKeepAlive();

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

// chzzk fullscreen 진입 시 #aside-chatting을 display:none 처리 → host React가 채팅 렌더 멈춤
// → 우리 MutationObserver가 변화를 못 잡음.
// aside는 fullscreen subtree 안에 있어서 browser가 자동으로 가려주지 않음.
// → display:flex로 되살리되, 화면 밖으로 빼서 시각적으로만 숨김.
//   host의 layout/IntersectionObserver에는 정상 element로 보이도록 size 유지.
function setupFullscreenKeepAlive() {
    const ASIDE_ID = 'aside-chatting';
    const HIDE_PROPS: Array<[string, string]> = [
        ['display', 'flex'],
        ['position', 'absolute'],
        ['left', '-99999px'],
        ['top', '0'],
        ['width', '320px'],
        ['height', '600px'],
        ['visibility', 'hidden'],
        ['pointer-events', 'none'],
        ['z-index', '-1'],
    ];
    document.addEventListener('fullscreenchange', () => {
        const aside = document.getElementById(ASIDE_ID);
        if (!aside) return;
        if (document.fullscreenElement) {
            HIDE_PROPS.forEach(([k, v]) => aside.style.setProperty(k, v, 'important'));
        } else {
            HIDE_PROPS.forEach(([k]) => aside.style.removeProperty(k));
        }
    });
}

bootstrap();
