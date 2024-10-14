import browser from "webextension-polyfill";
import { SettingInterface } from "@interfaces/setting";
import { createRoot } from "react-dom/client";
import { Handle } from "./handler";
import { ChatExtractor } from "./chatExtractor";
import App from "@components/Extension/App";
import { observe, selectElement } from "@utils/utils-common";
import { Logger } from "@utils/logger";

export class BaseContainer {
  theme: 'dark' | 'light';
  pointBox: boolean = false;
  type: SettingInterface["platform"];
  position: SettingInterface['position'];
  chatExtractor: ChatExtractor;
  handle: Handle;
  origChatContainerSelector: string;
  videoSelector?: string;
  cloneChatWrapperSelector?: string;
  currentPath: string;

  // observer를 등록하는 기능?
  // mutationObserver는 css selector를 받은 다음 타겟을 찾았을 때 
  constructor(
    type: SettingInterface["platform"],
    extractor: ChatExtractor,
    handle: Handle,
    origChatContainerSelector: string,

    // 다시보기, VOD 채팅 삭제를 위한 선택자
    videoSelector?: string,
    cloneChatWrapperSelector?: string,
  ) {
    this.theme = 'dark';
    this.type = type;
    this.chatExtractor = extractor;
    this.handle = handle;
    this.origChatContainerSelector = origChatContainerSelector;
    this.videoSelector = videoSelector;
    this.cloneChatWrapperSelector = cloneChatWrapperSelector;
    this.position = 'up';
    this.currentPath = window.location.pathname;
  }

  // DOM API로 "#tbc_container" 요소를 생성하고 반환하는 메소드
  async create() {
    Logger('BaseContainer create', '실행')
    
    const container = document.createElement('div');
    container.id = `${this.type}-container`;

    // 채팅 목록의 최근접 부모 요소(원본 채팅창)를 찾는다.
    observe(this.origChatContainerSelector, async (element) => {
      const parent = element?.parentElement;

      if (!parent) {
        return;
      }

      if (selectElement(`#${this.type}-container`)) {
        Logger('BaseContainer create', 'container already exists.')
        return;
      }

      element.id = `tbc-${this.type}-chat-list-wrapper`
      const storageSetting = await browser.storage.local.get(["position", "containerRatio"])
      
      parent.id = `tbc-${this.type}-chat-list-container`;
      parent.prepend(this.handle.getHandle())
      parent.prepend(container)

      Handle.updateContainerRatio(this.type, storageSetting['containerRatio'], storageSetting['position'])
      BaseContainer.updatePosition(this.type, storageSetting['position']);

      createRoot(container).render(
        <App 
          type={this.type}
          videoSelector={this.videoSelector}
          extractor={this.chatExtractor}
        />
      );
    })
  }

  static updatePosition(
    type: SettingInterface['platform'],
    position: SettingInterface['position']
  ) {
    const tbcContainer = document.getElementById(
      `${type}-container`
    ) as HTMLDivElement;
    const handleConainer = document.getElementById(
      "handle-container"
    ) as HTMLDivElement;
    const originContainer = document.getElementById(
      `tbc-${type}-chat-list-wrapper`
    ) as HTMLDivElement;

    if (!tbcContainer || !handleConainer || !originContainer) return;

    if (position === "down") {
      tbcContainer.style.order = "3";
      handleConainer.style.order = "2";
      originContainer.style.order = "1";
    } else {
      tbcContainer.style.order = "1";
      handleConainer.style.order = "2";
      originContainer.style.order = "3";
    }
  }
}
