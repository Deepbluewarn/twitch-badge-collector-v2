import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import browser from "webextension-polyfill";
import {
  createCloneContainer,
  RemoteChatContainer,
  LocalChatContainer,
  createReplayContainer,
  createNoticeContainer,
} from "./contentScript/container";
import { ReplayPageType, observer } from "./contentScript/utils";
import { updateContainerRatio } from "./contentScript/containerHandler";
import {
  useGlobalSetting,
  SettingInterface,
  Context as TBCContext,
  useAlert,
  useCustomTheme
} from 'twitch-badge-collector-cc';
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { createTheme, styled, ThemeProvider } from '@mui/material/styles';
import Stack from "@mui/material/Stack";
import globalStyles from "./style/global";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import { borderRadius } from "@mui/system";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";

let streamPageObserver: MutationObserver | undefined;
let position: SettingInterface.PositionOptionsType;
let containerRatio = 30;
let pointBoxAuto = true;

let streamChatFound = false;
let replayChatFound = false;
let pointBoxFound = false;
let twitchDarkTheme = false;
let observerStatus = false;
let noticeEntryInserted = false;

const injectMockFetch = () => {
  var s = document.createElement("script");
  s.src = browser.runtime.getURL("js/overrideFetch.js");
  s.onload = function () {
    s.remove();
  };
  (document.head || document.documentElement).appendChild(s);
};

injectMockFetch();

async function observerCallback(mutationRecord: MutationRecord[]) {
  const body = document.body;
  twitchDarkTheme = body.classList.contains("dark-theme");

  const streamChat: Element | undefined =
    document.getElementsByClassName("stream-chat")[0];

  const pointBox = document.getElementsByClassName(
    "community-points-summary"
  )[0];

  const replay = ReplayPageType();

  if (replay) {
    const video_chat: Element = document.getElementsByClassName(
      "video-chat__message-list-wrapper"
    )[0];
    const video_ref = document.getElementsByClassName('video-ref')[0];

    if(!video_ref) return;

    const video_player: HTMLVideoElement | undefined = video_ref.getElementsByTagName("video")[0];

    if (video_chat && video_player) {
      let tbcContainer = document.getElementById("tbc-container");
      if (tbcContainer) return false;

      createReplayContainer(video_chat);

      tbcContainer = document.getElementById("tbc-container");

      if (!tbcContainer) return;

      updateContainerRatio(containerRatio, position, replay);
      updatePosition(position);

      createRoot(tbcContainer).render(<App />);
    }
  } else if (streamChat && !streamChatFound) {
    streamChatFound = true;

    let tbcContainer = document.getElementById("tbc-container");

    if (tbcContainer) return false;

    createCloneContainer();
    tbcContainer = document.getElementById("tbc-container");

    if (!tbcContainer) return;

    updateContainerRatio(containerRatio, position, replay);
    updatePosition(position);

    createRoot(tbcContainer).render(<App />);
  } else if (pointBox && !pointBoxFound) {
    pointBoxFound = true;
    observePointBox(pointBox);
  }
  
  // if(!noticeEntryInserted) {
  //   noticeEntryInserted = true;

  //   createNoticeContainer();
  //   const noticeContainer = document.getElementById('tbc-notice-container');

  //   if (!noticeContainer) return false;

  //   createRoot(noticeContainer).render(<NoticeEntry />);
  // }
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
  let chat = null;

  if (isReplay.current) {
    chat = <RemoteChatContainer type="replay" />;
  } else {
    if (displayMethod === "local") {
      chat = <LocalChatContainer />;
    } else if (displayMethod === "remote") {
      chat = <RemoteChatContainer type="mini" />;
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

const CustomAnchor = styled('a')({
  width: '28rem'
});
const Icon = styled('img')({
  width: '2rem',
  height: '2rem'
});

const NoticePaper = styled(Paper)(({theme}) => ({
  padding: '16px',
  backgroundColor: theme.palette.background.default,
  border: `1px solid ${theme.palette.divider}`
}))

const CustomButton = styled(Button)(({theme}) => ({
  fontSize: '1.2rem',
  width: '100%'
}))

function NoticeEntry() {
  const [showNotice, setShowNotice] = useState(false);
  const onButtonClick = (closePermanently: boolean) => {
    browser.storage.local.set({noticeClosePermanently: closePermanently});
    setShowNotice(false);
  }

  useEffect(() => {
    browser.storage.local.get('noticeClosePermanently').then(res => {
      const ncp = res.noticeClosePermanently;

      if(typeof ncp === 'undefined') {
        setShowNotice(true);
      }

      setShowNotice(!res.noticeClosePermanently);
    })
  }, [])

  return showNotice ? (
    <ThemeProvider theme={useCustomTheme('on')}>
      <NoticePaper>
        {globalStyles}
        <Stack spacing={2} sx={{ width: '28rem' }}>
          <Stack direction='row' spacing={1} alignItems="center">
            <Icon src={browser.runtime.getURL('icon.png')} alt="" />
            <Typography variant="h5">{browser.i18n.getMessage('popup_title')}</Typography>
          </Stack>

          <Typography variant="h6">{browser.i18n.getMessage('donationMessage')}</Typography>

          <Stack justifyContent='center' spacing={1}>
            <Link 
              underline="none"
              target='_blank'
              href={process.env.RATE_EXT_LINK}
            >
              <CustomButton variant="contained">
                {browser.i18n.getMessage('review')}
              </CustomButton>
            </Link>
            <Divider />
            <CustomAnchor href={process.env.DONATE_LINK} target='_blank'>
              <Box
                component='img'
                sx={{ width: 'inherit', borderRadius: '8px' }}
                src={`https://cdn.jsdelivr.net/npm/twitch-badge-collector-cc@0.0.70/dist/donation/toonation_b14.gif`}
              />
            </CustomAnchor>
          </Stack>
          
          <Stack direction='row' spacing={1} justifyContent='flex-end'>
            <CustomButton onClick={() => {onButtonClick(true)}}>{browser.i18n.getMessage('closePermanently')}</CustomButton>
            <CustomButton onClick={() => {onButtonClick(false)}}>{browser.i18n.getMessage('close')}</CustomButton>
          </Stack>
        </Stack>
      </NoticePaper>
    </ThemeProvider>
  ) : null;
}

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
