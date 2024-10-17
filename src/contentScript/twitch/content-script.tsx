import browser from "webextension-polyfill";
import { ChatInfo } from "@interfaces/chat";
import { ChatExtractor } from "../base/chatExtractor";
import { BaseContainer } from "../base/container";
import { Handle } from "../base/handler";
import { addHistoryStateListener } from "../base/historyStateListener";
import { observe } from "@utils/utils-common";
import { Logger } from "@utils/logger";

class TwitchChatExtractor extends ChatExtractor {
  extract(node: Node): ChatInfo | undefined {
    if (!this.prep(node)) return;

    const chat_clone = node.cloneNode(true) as Element;

    const display_name = chat_clone.getElementsByClassName(
      "chat-author__display-name"
    )[0];
    const chatter_name = chat_clone.getElementsByClassName("intl-login")[0];

    if (!display_name && !chatter_name) return;

    let loginName: string = "";
    let nickName: string = "";
    let subLoginName: string = "";
    let subNickname: string = "";

    if (display_name) {
      loginName = display_name.getAttribute("data-a-user")?.toLowerCase()!;
      nickName = display_name.textContent?.toLowerCase()!;
    }
    if (chatter_name) {
      subLoginName = chatter_name.textContent!;
      subLoginName = subLoginName.substring(1, subLoginName.length - 1);
      subNickname = chatter_name.parentNode?.childNodes[0].textContent!;
    }

    loginName = loginName ? loginName : subLoginName;
    nickName = nickName ? nickName : subNickname;

    const textContents = (
      chat_clone.getElementsByClassName("text-fragment")
    ) as HTMLCollectionOf<HTMLSpanElement>;
    const badges = (
      chat_clone.getElementsByClassName("chat-badge")
    ) as HTMLCollectionOf<HTMLImageElement>;

    Array.from(textContents).map((text) => text.textContent);

    return {
      textContents: Array.from(textContents).map((text) => text.textContent),
      badges: Array.from(badges).map(
        (badge) => new URL(badge.src).pathname.split("/")[3]
      ),
      loginName: loginName,
      nickName: nickName,
    } as ChatInfo;
  }
}

function init() {
  const pathSegment = window.location.pathname.split('/')[1];

  if (pathSegment === 'videos') {
    vodContainer.create();
  } else {
    liveContainer.create();
  }
}

const liveContainer = new BaseContainer(
  'twitch',
  new TwitchChatExtractor('twitch'),
  new Handle('twitch', '#tbc-twitch-chat-list-container'),
  '.chat-room__content [class*="chat-list--"] .scrollable-area'
);

const vodContainer = new BaseContainer(
  'twitch',
  new TwitchChatExtractor('twitch'),
  new Handle('twitch', '#tbc-twitch-chat-list-container'),
  '.video-chat__message-list-wrapper',
  '.Layout-sc-1xcs6mc-0.video-ref video',
  '#tbc-clone__twitchui',
)

init()

addHistoryStateListener('www.twitch.tv', init);

// 포인트 상자 자동 클릭
observe('.community-points-summary', async (elem) => {
  if(!elem) return;

  const boxBtn = elem.querySelector('button.bCfhNy') as HTMLButtonElement;

  if (boxBtn) {
    const isPointAutoOn = (await browser.storage.local.get('pointBoxAuto')).pointBoxAuto;

    if (isPointAutoOn === 'off') return;

    boxBtn.click();
    Logger('observe .community-points-summary callback: ', '포인트 박스를 클릭했어요!')
  }
}, false)
