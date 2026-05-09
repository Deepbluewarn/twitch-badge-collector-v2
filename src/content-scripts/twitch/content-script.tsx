import { BaseContainer } from "../base/container";
import { Handle } from "../base/handler";
import { addHistoryStateListener } from "../base/historyStateListener";
import { Observer } from "../base/observer";
import { Logger } from "@/utils/logger";
import { TwitchAdapter } from "@/platform/twitch";

const adapter = new TwitchAdapter();

const liveContainer = new BaseContainer(
  adapter,
  new Handle(adapter, '#tbc-twitch-chat-list-container'),
  '.chat-room__content [class*="chat-list--"] .scrollable-area'
);

const vodContainer = new BaseContainer(
  adapter,
  new Handle(adapter, '#tbc-twitch-chat-list-container'),
  '.video-chat__message-list-wrapper',
  '.Layout-sc-1xcs6mc-0.video-ref video',
  '#tbc-clone__twitchui',
)

function init() {
  if (adapter.getPageMode() === 'video') {
    vodContainer.create();
  } else {
    liveContainer.create();
  }
}

init()

addHistoryStateListener('www.twitch.tv', init);
addHistoryStateListener('www.twitch.tv', () => {
  window.postMessage({
    action: 'tbc-historyUpdated'
  });
});

// 포인트 상자 자동 클릭

new Observer('.community-points-summary', false).observe(async (elem) => {
  if (!elem) return;

  const boxBtn = elem.querySelector('button.bCfhNy') as HTMLButtonElement;

  if (boxBtn) {
    const isPointAutoOn = (await browser.storage.local.get('pointBoxAuto')).pointBoxAuto;

    if (isPointAutoOn === 'off') return;

    boxBtn.click();
    Logger('observe .community-points-summary callback: ', '포인트 박스를 클릭했어요!')
  }
})
