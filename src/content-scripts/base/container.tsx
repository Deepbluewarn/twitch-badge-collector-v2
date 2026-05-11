import { SettingInterface } from "@/interfaces/setting";
import { createRoot, Root } from "react-dom/client";
import { Handle } from "./handler";
import { PlatformAdapter } from "@/platform";
import App from "@/components/Extension/App";
import { selectElement } from "@/utils/utils-common";
import { Logger } from "@/utils/logger";
import { Observer } from "./observer";
import { applyPosition, applyRatio } from "./layout";

export class BaseContainer {
  theme: 'dark' | 'light';
  pointBox: boolean = false;
  adapter: PlatformAdapter;
  type: SettingInterface["platform"];
  position: SettingInterface['position'];
  handle: Handle;
  origChatContainerSelector: string;
  videoSelector?: string;
  cloneChatWrapperSelector?: string;
  currentPath: string;

  observer: Observer;
  root: Root | null;
  container: HTMLDivElement;

  constructor(
    adapter: PlatformAdapter,
    handle: Handle,
    origChatContainerSelector: string,

    // 다시보기, VOD 채팅 삭제를 위한 선택자
    videoSelector?: string,
    cloneChatWrapperSelector?: string,
  ) {
    this.theme = 'dark';
    this.adapter = adapter;
    this.type = adapter.type;
    this.handle = handle;
    this.origChatContainerSelector = origChatContainerSelector;
    this.videoSelector = videoSelector;
    this.cloneChatWrapperSelector = cloneChatWrapperSelector;
    this.position = 'up';
    this.currentPath = window.location.pathname;
    this.observer = new Observer(origChatContainerSelector);
    this.root = null;
    this.container = document.createElement('div');
    this.container.id = `${this.type}-container`;
  }

  // DOM API로 "#tbc_container" 요소를 생성하고 반환하는 메소드
  async create() {
    Logger('BaseContainer create', '실행')

    // 채팅 목록의 최근접 부모 요소(원본 채팅창)를 찾는다.

    this.observer.observe(async (element, mr) => {
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
      parent.prepend(this.container)

      applyRatio(this.type, storageSetting['containerRatio'], storageSetting['position'])
      applyPosition(this.type, storageSetting['position']);

      if (!this.root) {
        this.root = createRoot(this.container);
      }
      const uniqueKey = `app-${Date.now()}`;
      this.root.render(
        <App
          key={uniqueKey}
          type={this.type}
          videoSelector={this.videoSelector}
          adapter={this.adapter}
        />
      )
    })
  }

}
