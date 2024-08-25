import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import browser from "webextension-polyfill";
import {
  createCloneContainer,
  LocalChatContainer,
  createReplayContainer,
} from "./container";
import { ReplayPageType, observer } from "@utils/utils-common";
import { updateContainerRatio } from "./containerHandler";
import useTwitchTheme from "@hooks/useTwitchTheme";
import { ThemeProvider } from '@mui/material/styles';
import useExtensionGlobalSetting from "@hooks/useGlobalSettingExtension";
import { SettingInterface } from "@interfaces/setting";
import { GlobalSettingContext } from "../../context/GlobalSetting";
import { CustomTheme } from "@interfaces/ThemeInterface";
import { useCustomTheme } from "@hooks/useCustomTheme";
import { AlertContext } from "../../context/Alert";
import useAlert from "@hooks/useAlert";

let streamPageObserver: MutationObserver | undefined;
let position: SettingInterface['position'];
let containerRatio = 30;
let pointBoxAuto = true;

let streamChatFound = false;
let pointBoxFound = false;
let twitchDarkTheme = false;
let observerStatus = false;

function initPage() {
  const body = document.body;
  twitchDarkTheme = body.classList.contains("dark-theme");

  const streamChat: Element | undefined =
    document.getElementsByClassName("stream-chat")[0];

  const pointBox = document.getElementsByClassName(
    "community-points-summary"
  )[0];

  if (pointBox && !pointBoxFound) {
    pointBoxFound = true;
    observePointBox(pointBox);
  }

  const replay = ReplayPageType();

  let container = document.getElementById('tbc-container');

  if (container) return false;

  if (replay) {
    const video_chat: Element = document.getElementsByClassName(
      "video-chat__message-list-wrapper"
    )[0];
    const video_ref = document.getElementsByClassName('video-ref')[0];

    if (!video_ref) return;

    const video_player: HTMLVideoElement | undefined = video_ref.getElementsByTagName("video")[0];

    if (video_chat && video_player) {
      createReplayContainer(video_chat);

      container = document.getElementById("tbc-container");

      if (!container) return;

      updateContainerRatio(containerRatio, position, replay);
      updatePosition(position);

      createRoot(container).render(<App />);
    }
  } else if (streamChat && !streamChatFound) {
    streamChatFound = true;

    createCloneContainer();
    container = document.getElementById("tbc-container");

    if (!container) return;

    updateContainerRatio(containerRatio, position, replay);
    updatePosition(position);

    createRoot(container).render(<App />);
  }
}

async function observerCallback() {
  initPage();
}

function pointBoxObserverCallback(mutationRecord: MutationRecord[]) {
  if (!pointBoxAuto) return;

  const point_summary_className = "community-points-summary";

  for (const mr of Array.from(mutationRecord)) {
    const addedNodes = mr.addedNodes;
    if (!addedNodes) return;

    for (const node of addedNodes) {
      const nodeElement = node as HTMLElement;
      if (!nodeElement || nodeElement.nodeType !== 1) return;

      const point_summary = (nodeElement.getElementsByClassName(
        point_summary_className
      )[0] ||
        nodeElement.closest("." + point_summary_className)) as HTMLDivElement;

      if (point_summary) {
        const point_button =
          point_summary.children[1].getElementsByTagName("button")[0];

        if (point_button) {
          point_button.click();
        }
      }
    }
  }
}

function App() {
  const { globalSetting, dispatchGlobalSetting } = useExtensionGlobalSetting();
  const { alerts, setAlerts, addAlert } = useAlert();
  const { theme: twitchTheme } = useTwitchTheme();

  useEffect(() => {
    browser.storage.onChanged.addListener((changed, areaName) => {
      if (areaName !== "local") return;

      for (const key in changed) {
        const newValue = changed[key].newValue;

        if (key === "position") {
          position = newValue;
          updatePosition(position);
          dispatchGlobalSetting({ type: 'SET_POSITION', payload: newValue });
        } else if (key === "pointBoxAuto") {
          pointBoxAuto = newValue;
        } else if (key === "containerRatio") {
          containerRatio = newValue;
        }
      }
    });
  }, []);

  const customTheme = useCustomTheme(twitchTheme === 'dark');

  return (
    <ThemeProvider<CustomTheme> theme={customTheme}>
      <GlobalSettingContext.Provider
        value={{ globalSetting, dispatchGlobalSetting }}
      >
        <AlertContext.Provider value={{ alerts, setAlerts, addAlert }}>
          <LocalChatContainer />
        </AlertContext.Provider>
      </GlobalSettingContext.Provider>
    </ThemeProvider>
  );
}

function updatePosition(position: SettingInterface['position']) {
  const tbcContainer = document.getElementById(
    "tbc-container"
  ) as HTMLDivElement;
  const handleConainer = document.getElementById(
    "handle-container"
  ) as HTMLDivElement;
  const originContainer = document.getElementsByClassName(
    "tbc-origin"
  )[0] as HTMLDivElement;

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
function observePointBox(target: Element) {
  observer(
    target,
    {
      childList: true,
      subtree: true,
      attributeFilter: ["class"],
    },
    pointBoxObserverCallback
  );
}

const updateLocalSettingValues = () => {
  browser.storage.local
    .get(["position", "pointBoxAuto", "containerRatio"])
    .then((res) => {
      position = res.position;
      pointBoxAuto = res.pointBoxAuto;
      containerRatio = res.containerRatio;

      observePage();
    });
};

updateLocalSettingValues();

let currentPath = "";

browser.runtime.onMessage.addListener((message) => {
  if (message.action === "onHistoryStateUpdated") {
    if (window.location.hostname !== "www.twitch.tv") return;
    if (currentPath === window.location.pathname) return;

    currentPath = window.location.pathname;

    streamChatFound = false;
    pointBoxFound = false;

    updateLocalSettingValues();
  }
});
