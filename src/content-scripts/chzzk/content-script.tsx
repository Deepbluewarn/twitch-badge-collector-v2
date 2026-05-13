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

// chzzk fullscreen 진입 시 chzzk가 #aside-chatting에 is_folded 클래스 부여 → display:none
// → host React가 채팅 렌더 멈춤 → 우리 capture가 변화를 못 잡음.
//
// 단순히 display 강제하면 사용자가 chzzk의 채팅 버튼 토글했을 때 우리 !important inline이
// chzzk의 토글을 막아 chat panel이 안 열림 (사용자 보고된 버그).
//
// 해결: aside의 class를 MutationObserver로 watch.
//  - is_folded 클래스 있음 = chzzk가 의도적으로 hide → 우리가 offscreen으로 keep-alive
//  - is_folded 클래스 없음 = chzzk가 보이려 함 → 우리 override 제거, chzzk 정상 렌더
function setupFullscreenKeepAlive() {
    const ASIDE_ID = 'aside-chatting';
    // chzzk minified hash. 추후 OTA로 관리 가능.
    const FOLDED_CLASS_PREFIX = 'live_chatting_is_folded';
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

    let mo: MutationObserver | null = null;
    let overrideActive = false;

    function isFolded(aside: HTMLElement): boolean {
        return Array.from(aside.classList).some(c => c.startsWith(FOLDED_CLASS_PREFIX));
    }

    function applyOverride(aside: HTMLElement) {
        if (overrideActive) return;
        HIDE_PROPS.forEach(([k, v]) => aside.style.setProperty(k, v, 'important'));
        overrideActive = true;
    }

    function removeOverride(aside: HTMLElement) {
        if (!overrideActive) return;
        HIDE_PROPS.forEach(([k]) => aside.style.removeProperty(k));
        overrideActive = false;
    }

    function sync() {
        const aside = document.getElementById(ASIDE_ID);
        if (!aside) return;
        if (isFolded(aside)) applyOverride(aside);
        else removeOverride(aside);
    }

    document.addEventListener('fullscreenchange', () => {
        const aside = document.getElementById(ASIDE_ID);
        if (!aside) return;
        if (document.fullscreenElement) {
            sync(); // 진입 시점 chzzk 의도 반영
            if (!mo) {
                mo = new MutationObserver(sync);
                mo.observe(aside, { attributes: true, attributeFilter: ['class'] });
            }
        } else {
            removeOverride(aside);
            mo?.disconnect();
            mo = null;
        }
    });
}

bootstrap();
