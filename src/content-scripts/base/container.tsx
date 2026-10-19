import { SettingInterface } from "@/interfaces/setting";
import { createRoot, Root } from "react-dom/client";
import { Handle } from "./handler";
import { PlatformAdapter } from "@/platform";
import App from "@/components/Extension/App";
import { selectElement } from "@/utils/utils-common";
import { Logger } from "@/utils/logger";
import { Observer } from "./observer";
import { applyPosition, applyRatio } from "./layout";
import { onTeardown } from "./lifecycle";
import { PROCESSED_CHAT_CLASS } from "@/interfaces/chat-attributes";

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
    // temporal=false — chzzk React가 reconcile로 우리 handle/parent id 떼어낼 수 있어
    // MO 유지하면서 매 mutation마다 setup 재확인 (복구 보장).
    this.observer = new Observer(origChatContainerSelector, false);
    this.root = null;
    this.container = document.createElement('div');
    this.container.id = `${this.type}-container`;
    // 확장 연결이 끊기면(업데이트) 감시를 끊고 창을 걷는다 — 새 스크립트와 겹치지 않게.
    onTeardown(disconnected => {
      this.destroy();
      this.restoreHost();
      // 수집 표시(색 띠)는 확장 CSS가 남아 있어 계속 보인다. 넘겨줄 때는 새 스크립트가 그대로 쓴다.
      if (disconnected) {
        document.querySelectorAll(`.${PROCESSED_CHAT_CLASS}`).forEach(el => el.classList.remove(PROCESSED_CHAT_CLASS));
      }
    });
  }

  destroy() {
    this.observer.disconnect();
    this.root?.unmount();
    this.root = null;
    // 자기 요소만 — 같은 id를 쓰는 새 스크립트의 창·손잡이를 건드리지 않게.
    this.container.remove();
    this.handle.getHandle().remove();
  }

  /**
   * 원본 채팅창을 처음 모습으로 — 붙인 id, 나눠 준 높이·순서를 걷는다.
   * 원래 id를 기억해 두지 않고 우리 id로 찾는다: 옛 버전이 이미 이름을 바꿔 둔 채로 넘겨받을 수 있다.
   * 호스트(치지직·트위치)의 이 두 요소는 원래 id가 없다.
   */
  restoreHost() {
    for (const id of [`tbc-${this.type}-chat-list-wrapper`, `tbc-${this.type}-chat-list-container`]) {
      document.querySelectorAll<HTMLElement>(`#${id}`).forEach(el => {
        el.removeAttribute('id');
        el.style.removeProperty('height');
        el.style.removeProperty('order');
      });
    }
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

      // chzzk React가 reconcile 시 우리 handle/parent.id를 떼어내는 경우가 있어
      // 단일 indicator(chzzk-container 존재)만으로 dup 판정하면 부분 손상 상태가
      // 복구 안 됨. 우리 setup의 핵심 3요소(container/handle/renamed parent id)
      // 전부 있어야 skip — 하나라도 빠지면 idempotent하게 재부착.
      const hasContainer = !!selectElement(`#${this.type}-container`);
      const hasHandle = !!document.getElementById('handle-container');
      const parentRenamed = parent.id === `tbc-${this.type}-chat-list-container`;
      if (hasContainer && hasHandle && parentRenamed) {
        return;
      }

      element.id = `tbc-${this.type}-chat-list-wrapper`
      const storageSetting = await browser.storage.local.get(["position", "containerRatio"])

      parent.id = `tbc-${this.type}-chat-list-container`;
      // prepend는 같은 노드 재호출 시 이동(중복 X). 이미 있으면 no-op처럼 동작.
      parent.prepend(this.handle.getHandle())
      parent.prepend(this.container)

      applyRatio(this.type, storageSetting['containerRatio'], storageSetting['position'])
      applyPosition(this.type, storageSetting['position']);

      if (!this.root) {
        this.root = createRoot(this.container);
      }
      // key를 stable로 — 매 fire마다 unique key였으면 React가 unmount/remount 반복.
      // root.render() 자체는 props 같으면 reconcile만 → 비용 작음.
      this.root.render(
        <App
          key={`app-${this.type}`}
          type={this.type}
          videoSelector={this.videoSelector}
          adapter={this.adapter}
        />
      )
    })
  }

}
