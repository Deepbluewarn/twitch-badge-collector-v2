import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import browser from "webextension-polyfill";
import styled from "@emotion/styled";
import {
  createCloneContainer,
  RemoteChatContainer,
  LocalChatContainer,
  createReplayContainer,
} from "./contentScript/container";
import { ReplayPageType, observer } from "./contentScript/utils";
import { updateContainerRatio } from "./contentScript/containerHandler";
import {
  useGlobalSetting,
  SettingInterface,
  Context as TBCContext,
  useAlert,
  CustomTheme,
  useCustomTheme
} from 'twitch-badge-collector-cc';
import useTwitchTheme from "./hooks/useTwitchTheme";
import { ThemeProvider } from '@mui/material/styles';
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import { getRandomBooleanWithProbability, isFirefoxAddon } from "./utils";

let streamPageObserver: MutationObserver | undefined;
let position: SettingInterface.PositionOptionsType;
let containerRatio = 30;
let pointBoxAuto = true;

let streamChatFound = false;
let replayChatFound = false;
let pointBoxFound = false;
let twitchDarkTheme = false;
let observerStatus = false;

const injectMockFetch = () => {
  var s = document.createElement("script");
  s.src = browser.runtime.getURL("js/overrideFetch.js");
  s.onload = function () {
    s.remove();
  };
  (document.head || document.documentElement).appendChild(s);
};

injectMockFetch();

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

async function observerCallback(mutationRecord: MutationRecord[]) {
  initPage();
}

function pointBoxObserverCallback(mutationRecord: MutationRecord[]) {
  if (!pointBoxAuto) return;

  const point_summary_className = "community-points-summary";

  for (let mr of Array.from(mutationRecord)) {
    let addedNodes = mr.addedNodes;
    if (!addedNodes) return;

    for (let node of addedNodes) {
      let nodeElement = node as HTMLElement;
      if (!nodeElement || nodeElement.nodeType !== 1) return;

      let point_summary = (nodeElement.getElementsByClassName(
        point_summary_className
      )[0] ||
        nodeElement.closest("." + point_summary_className)) as HTMLDivElement;

      if (point_summary) {
        let point_button =
          point_summary.children[1].getElementsByTagName("button")[0];

        if (point_button) {
          point_button.click();
        }
      }
    }
  }
}

function App() {
  const { globalSetting, dispatchGlobalSetting } = useGlobalSetting('Extension', true);
  const { alerts, setAlerts, addAlert } = useAlert();
  const displayMethod = globalSetting.chatDisplayMethod;
  const isReplay = useRef(ReplayPageType());
  const { theme: twitchTheme } = useTwitchTheme();
  let chat = null;

  if (isReplay.current) {
    chat = <RemoteChatContainer type="replay" twitchTheme={twitchTheme} />;
  } else {
    if (displayMethod === "local") {
      chat = <LocalChatContainer />;
    } else if (displayMethod === "remote") {
      chat = <RemoteChatContainer type="mini" twitchTheme={twitchTheme} />;
    }
  }

  useEffect(() => {
    browser.storage.onChanged.addListener((changed, areaName) => {
      if (areaName !== "local") return;

      for (let key in changed) {
        let newValue = changed[key].newValue;

        if (key === "position") {
          position = newValue;
          updatePosition(position);
          dispatchGlobalSetting({ type: "position", value: newValue });
        } else if (key === "chatDisplayMethod") {
          dispatchGlobalSetting({ type: "chatDisplayMethod", value: newValue });
        } else if (key === "pointBoxAuto") {
          pointBoxAuto = newValue;
        } else if (key === "miniLanguage") {
          dispatchGlobalSetting({ type: "miniLanguage", value: newValue });
        } else if (key === "miniFontSize") {
          dispatchGlobalSetting({ type: "miniFontSize", value: newValue });
        } else if (key === "miniChatTime") {
          dispatchGlobalSetting({ type: "miniChatTime", value: newValue });
        } else if (key === "containerRatio") {
          containerRatio = newValue;
        }
      }
    });
  }, []);

  const customTheme = useCustomTheme(twitchTheme === 'dark' ? 'on' : 'off');

  return (
    <ThemeProvider<CustomTheme> theme={customTheme}>
      <TBCContext.GlobalSettingContext.Provider
        value={{ globalSetting, dispatchGlobalSetting }}
      >
        <TBCContext.AlertContext.Provider value={{ alerts, setAlerts, addAlert }}>
          <PeriodicSupportPopup />
          {chat}
        </TBCContext.AlertContext.Provider>
      </TBCContext.GlobalSettingContext.Provider>
    </ThemeProvider>
  );
}

function PeriodicSupportPopup() {
  const [displayPopup, setDisplayPopup] = useState(false);
  const popupProbability = useRef(getRandomBooleanWithProbability(0.25));
  const [rateLink, setRateLink] = useState('');

  const daysElapsedSince = useCallback((time: number): number => {
    let daysElapsed: number = (new Date().getTime() - time) / (1000 * 60 * 60 * 24);
    return daysElapsed;
  }, []);

  const onCloseButtonClicked = useCallback(() => {
    browser.storage.local.set({lastPopupTime: new Date().getTime()});
    setDisplayPopup(false);
  }, []);

  useEffect(() => {
    browser.storage.local.get('lastPopupTime').then(res => {
      const lastPopupTime = res.lastPopupTime;
      setDisplayPopup(!lastPopupTime || daysElapsedSince(Number(lastPopupTime)) >= 60);
    });
  }, []);

  useEffect(() => {
    isFirefoxAddon().then(isf => {
      setRateLink((isf ? process.env.FIREFOX_RATE_EXT_LINK : process.env.CHROMIUM_RATE_EXT_LINK) || '');
    });
  }, [])

  return popupProbability.current && displayPopup ? (
    <PaperPopup variant="outlined">
      <Stack sx={{ height: '100%' }} gap={1} justifyContent='space-between'>
        <Typography sx={{ fontWeight: 'bold' }} variant="h5">{browser.runtime.getManifest().name}</Typography>
        <Typography variant="h6">{browser.i18n.getMessage("supportMessage")}</Typography>
        <Stack direction='row' gap={1}>
          <Link href={process.env.DONATE_LINK || ''} rel="noopener" target='_blank'>
            <Button variant='contained'>
              <Typography variant="h6">
              {browser.i18n.getMessage('donation')}
              </Typography>
            </Button>
          </Link>
          <Link href={rateLink} target='_blank' rel="noopener">
            <Button variant='contained'>
              <Typography variant="h6">
                {browser.i18n.getMessage('review_2')}
              </Typography>
            </Button>
          </Link>
          <Button sx={{ marginLeft: 'auto' }}><Typography variant="h6" onClick={onCloseButtonClicked}>{browser.i18n.getMessage('close')}</Typography></Button>
        </Stack>
      </Stack>
    </PaperPopup>
  ) : null
}

const PaperPopup = styled(Paper)({
  position: 'absolute',
  width: '84%',
  height: '180px',
  padding: '16px',
  zIndex: '44444444',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)'
});

function updatePosition(position: SettingInterface.PositionOptionsType) {
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

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.action === "onHistoryStateUpdated") {
    if (window.location.hostname !== "www.twitch.tv") return;
    if (currentPath === window.location.pathname) return;

    currentPath = window.location.pathname;

    streamChatFound = false;
    replayChatFound = false;
    pointBoxFound = false;

    updateLocalSettingValues();
  }
});
