import { SettingInterface, useAlert, Context as TBCContext } from "twitch-badge-collector-cc";
import browser from "webextension-polyfill";
import { observer } from "@utils/utils-common";
import createContainerHandler, { updateContainerRatio } from "./containerHandler";
import { useEffect } from "react";
import useExtensionGlobalSetting from "@hooks/useGlobalSettingExtension";
import { createRoot } from "react-dom/client";
import { LocalChatContainer } from "./container";
import * as Sentry from "@sentry/browser";
import Logger from "@utils/logger";

Sentry.init({
  dsn: "https://af1b53df8897a90d7c27e8f9347954af@o1197585.ingest.sentry.io/4506447984852992",
  integrations: [
    new Sentry.Replay({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
  release: browser.runtime.getManifest().version,
  // Session Replay
  replaysSessionSampleRate: 0.1, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
  replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
});

let streamPageObserver: MutationObserver | undefined;
let position: SettingInterface.PositionOptionsType;
let containerRatio = 30;
let chattingContainerFound = false;
let observerStatus = false;

position
containerRatio
observerStatus

const initPage = () => {

  const chattingContainer: Element | undefined =
    document.getElementsByClassName("live_chatting_container__SvtrD")[0];

  if (chattingContainer && !chattingContainerFound) {
    const chzzkContainer = document.createElement('div');
    const original_container = chattingContainer.getElementsByClassName(
      "live_chatting_list_wrapper__a5XTV"
    )[0] as HTMLDivElement;

    if (!original_container) return;

    original_container.id = 'tbc-chzzk-chat-list-wrapper';
    chzzkContainer.id = 'chzzk-container';

    const containerParent = original_container.parentElement;

    if (containerParent) {
      // containerParent.prepend(createContainerHandler());

      containerParent.id = 'tbc-chzzk-chat-list-container';
      containerParent.prepend(createContainerHandler());
      containerParent.prepend(chzzkContainer);
      chattingContainerFound = true;

      updateContainerRatio(containerRatio, position);
      updatePosition(position);
      createRoot(chzzkContainer).render(<App />);

      streamPageObserver?.disconnect();
    }
  }
}

function App() {
  const { globalSetting, dispatchGlobalSetting } = useExtensionGlobalSetting(true);
  const { alerts, setAlerts, addAlert } = useAlert();
  const chat = <LocalChatContainer />

  useEffect(() => {
    browser.storage.onChanged.addListener((changed, areaName) => {
      if (areaName !== "local") return;

      for (const key in changed) {
        const newValue = changed[key].newValue;

        if (key === "position") {
          position = newValue;
          updatePosition(position);
        } else if (key === "containerRatio") {
          containerRatio = newValue;
        }
      }
    });
  }, []);

  return (
    <TBCContext.GlobalSettingContext.Provider
      value={{ globalSetting, dispatchGlobalSetting }}
    >
      <TBCContext.AlertContext.Provider value={{ alerts, setAlerts, addAlert }}>
        {chat}
      </TBCContext.AlertContext.Provider>
    </TBCContext.GlobalSettingContext.Provider>
  );
}

function updatePosition(position: SettingInterface.PositionOptionsType) {
  const tbcContainer = document.getElementById(
    "chzzk-container"
  ) as HTMLDivElement;
  const handleConainer = document.getElementById(
    "handle-container"
  ) as HTMLDivElement;
  const originContainer = document.getElementById(
    "tbc-chzzk-chat-list-wrapper"
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

async function observerCallback() {
  initPage();
}

function observePage() {
  const config = {
    childList: true,
    subtree: true,
  };

  if (streamPageObserver) {
    streamPageObserver.observe(document.body, config);
  } else {
    streamPageObserver = observer(document.body, config, observerCallback);
  }

  observerStatus = true;
}

const updateLocalSettingValues = () => {
  browser.storage.local
    .get(["position", "containerRatio"])
    .then((res) => {
      position = res.position;
      containerRatio = res.containerRatio;

      observePage();
    });
};

updateLocalSettingValues();

let currentPath = window.location.pathname;

browser.runtime.onMessage.addListener((message) => {
  Logger("Chzzk ContentScript onHistoryStateUpdated message.url", message.url);
  
  if (message.action === "onHistoryStateUpdated") {
    if (window.location.hostname !== "chzzk.naver.com") {
      Logger("Chzzk ContentScript onHistoryStateUpdated", "Hostname 이 일치하지 않습니다.");
      return;
    }
    if (currentPath === window.location.pathname) {
      Logger("Chzzk ContentScript onHistoryStateUpdated", "Path 가 일치합니다.");
      return;
    }

    currentPath = window.location.pathname;

    chattingContainerFound = false;

    updateLocalSettingValues();
    Logger("Chzzk ContentScript onHistoryStateUpdated", "ContentScript 를 재시작합니다.");
  }
});
