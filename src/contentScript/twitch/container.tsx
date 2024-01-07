/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useRef, useState } from "react";
import browser from "webextension-polyfill";
import convert from "react-from-dom";
import { styled } from "@mui/material/styles";
import createContainerHandler from "./containerHandler";
import {
  getVideoIdParam,
  ReplayPageType,
  observer,
} from "@utils/utils-common";
import ChatFromTwitchUi from "./twitchUiChat";
import { ContainerType } from "@interfaces/container";
import MessageInterface from "@interfaces/message";
import {
  Context as TBCContext,
} from 'twitch-badge-collector-cc';
import { TwitchTheme } from "@hooks/useTwitchTheme";
import useArrayFilterExtension from "@hooks/useArrayFilterExtension";

export function ChatRoom() {
  const chatRoomDefault: Element | null = document.querySelector(
    ".chat-room__content .chat-list--default"
  );
  const chatRoomOther: Element | null = document.querySelector(
    ".chat-room__content .chat-list--other"
  );

  if (!chatRoomDefault && !chatRoomOther) return null;

  return chatRoomDefault ? chatRoomDefault : chatRoomOther;
}

export function createNoticeContainer() {
  const container = document.createElement("div");
  container.style.position = 'absolute';
  container.style.zIndex = '4444';
  container.style.top = '88px';
  container.style.left = '280px';
  container.id = "tbc-notice-container";
  document.body.appendChild(container);
}

export function createCloneContainer() {
  const chatroom = ChatRoom();

  if (chatroom === null) return;

  const original_container = chatroom.getElementsByClassName(
    "scrollable-area"
  )[0] as HTMLDivElement;
  const tbcContainer = document.createElement("div");

  original_container.classList.add("tbc-origin");
  tbcContainer.id = "tbc-container";

  const containerParent = original_container.parentElement;

  if (containerParent) {
    containerParent.prepend(createContainerHandler());
    containerParent.prepend(tbcContainer);
  }
}

export function createReplayContainer(video_chat: Element) {
  const replayContainer = document.createElement("div");
  replayContainer.id = "tbc-container";

  video_chat.classList.add("tbc-origin");
  video_chat.parentElement?.classList.add("flex_column");
  video_chat.parentElement?.appendChild(createContainerHandler());
  video_chat.parentElement?.appendChild(replayContainer);
}

const TwitchChatContainerStyle = styled("div")({
  height: "100%",
});

export function LocalChatContainer() {
  const { globalSetting } = TBCContext.useGlobalSettingContext();
  const [chatList, setChatList] = useState<Node[]>([]);
  const [chatIsBottom, setChatIsBottom] = useState(true);
  const [maxNumChats] = useState(globalSetting.maximumNumberChats || (import.meta.env.VITE_MAXNUMCHATS_DEFAULT as unknown) as number);
  const { setArrayFilter, checkFilter } = useArrayFilterExtension('twitch', true);
  const containerRef = useRef<HTMLDivElement>(null);

  const container = document.getElementsByClassName("tbc-origin")[0];
  let originalContainer = null;

  if (container) {
    originalContainer = container.cloneNode(true) as HTMLElement;

    originalContainer.setAttribute("style", "");
    originalContainer.classList.remove("tbc-origin");
    originalContainer.id = "tbc-clone__twitchui";

    const message_container = originalContainer.getElementsByClassName(
      "chat-scrollable-area__message-container"
    )[0];
    message_container.textContent = ""; //remove all chat lines.
  }

  useEffect(() => {
    browser.storage.onChanged.addListener((changed, areaName) => {
      if (areaName !== "local") return;

      for (const key in changed) {
        const newValue = changed[key].newValue;

        if (key === "filter") {
          setArrayFilter(newValue);
        }
      }
    });
  }, []);

  useEffect(() => {
    const scrollArea = getScrollArea();

    if (!scrollArea) return;

    const scrollCallback = () => {
      setChatIsBottom(
        scrollArea.scrollTop + scrollArea.clientHeight >=
          scrollArea.scrollHeight - 40
      );
    };

    scrollArea.addEventListener("scroll", scrollCallback, false);

    return () => {
      scrollArea.removeEventListener("scroll", scrollCallback);
    };
  }, []);

  useEffect(() => {
    const chatObserver = observer(
      document.getElementsByClassName("tbc-origin")[0],
      {
        childList: true,
        subtree: true,
      },
      newChatCallback
    );
    
    return () => {
      if(chatObserver) chatObserver.disconnect();
    }
  }, [maxNumChats]);

  useEffect(() => {
    chatList.forEach((chat) => {
      const chatListContainer = containerRef.current?.getElementsByClassName(
        "chat-scrollable-area__message-container"
      )[0];

      if (!chatListContainer) return;
      
      if(chatListContainer.childElementCount >= (maxNumChats || (import.meta.env.VITE_MAXNUMCHATS_DEFAULT as unknown) as number)){
        const firstChild = chatListContainer.firstElementChild;

        if(firstChild === null) return;

        chatListContainer.removeChild(firstChild);
      }

      chatListContainer.appendChild(chat);
    });
    const scrollArea = getScrollArea();

    if (!scrollArea) return;
    if (chatIsBottom) scrollArea.scrollTop = scrollArea.scrollHeight;
  }, [chatList, maxNumChats]);

  const getScrollArea = () => {
    if (!containerRef.current) return;

    return containerRef.current.getElementsByClassName(
      "simplebar-scroll-content"
    )[0];
  };

  const newChatCallback = (mutationRecord: MutationRecord[]) => {
    const records = Array.from(mutationRecord);

    records.forEach((mr) => {
      const addedNodes = mr.addedNodes;
      if (!addedNodes) return;

      addedNodes.forEach((node) => {
        const chat = ChatFromTwitchUi(node);

        if (!chat || chat === null) return;

        const filterRes = checkFilter(chat);

        if (typeof filterRes !== "undefined" && filterRes) {
          const clone = node.cloneNode(true);

          (node as HTMLElement).classList.add('tbcv2-highlight');

          setChatList((n) => {
            if (n.length > maxNumChats) {
              n = n.slice(-maxNumChats);
            }
            return [...n, clone];
          });
        }
      });
    });
  };

  if (!container || !originalContainer) return null;

  const twitchClone = convert(originalContainer) as React.ReactNode;

  return (
    <TwitchChatContainerStyle ref={containerRef}>
      {twitchClone}
    </TwitchChatContainerStyle>
  );
}

const RemoteChatContainerStyle = styled("iframe")({
  width: "100%",
  height: "100%",
  marginBottom: "8px",
});

export function RemoteChatContainer(props: { type: ContainerType, twitchTheme: TwitchTheme }) {
  const [baseUrl] = useState(import.meta.env.VITE_BASE_URL || "");
  const params = new URLSearchParams();
  const replayType = ReplayPageType();
  const [videoId, setVideoId] = useState(getVideoIdParam(replayType));

  if (props.type === "replay") {
    if (replayType && videoId) {
      params.set(replayType, videoId);
    }
  }

  params.set("ext_version", browser.runtime.getManifest().version);

  const { globalSetting, dispatchGlobalSetting } = TBCContext.useGlobalSettingContext();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const frameLoaded = useRef(false);

  const src = `${baseUrl}/${props.type}?${params}`;

  const isDarkTheme = useCallback(() => {
    return props.twitchTheme === 'dark' ? 'on' : 'off'
  }, [props.twitchTheme])

  const postSetting = (type: string, value: any) => {
    if (frameRef.current && frameLoaded.current) {
      frameRef.current.contentWindow?.postMessage(
        {
          sender: "extension",
          type,
          value,
        } as MessageInterface,
        baseUrl
      );
    }
  };

  useEffect(() => {
    if (props.type !== "replay") return;

    const player: HTMLVideoElement | undefined = document
      .getElementsByClassName("video-ref")[0]
      .getElementsByTagName("video")[0];

    player.ontimeupdate = () => {
      const msg: MessageInterface = {
        sender: "extension",
        type: "PLAYER_TIME",
        value: player.currentTime,
      };
      frameRef.current?.contentWindow?.postMessage(msg, baseUrl);
    };
  }, [props.type]);

  useEffect(() => {
    browser.runtime.onMessage.addListener((message) => {
      if (message.action === "onHistoryStateUpdated") {
        if (props.type === "replay") {
          setVideoId(getVideoIdParam(ReplayPageType()));
        }
      }
    });

    window.addEventListener('message', e=> {
      if (
        e.data.sender === "wtbc" &&
        e.data.type === "REQUEST_EXTENSION_SETTING"
      ) {
        frameLoaded.current = true;
        postSetting("EXTENSION_SETTING", globalSetting);
        postSetting("TWITCH_DARKMODE", isDarkTheme());
        browser.storage.local.get("filter").then((res) => {
          postSetting("ARRAY_FILTER", res.filter);
        });
      }
    });
  }, []);

  useEffect(() => {
    browser.storage.onChanged.addListener((changed, areaName) => {
      if (areaName !== "local") return;

      for (const key in changed) {
        const newValue = changed[key].newValue;

        if (key === "filter") {
          postSetting("ARRAY_FILTER", newValue);
        }
      }
    });
  }, []);

  useEffect(() => {
    postSetting("EXTENSION_SETTING", globalSetting);
  }, [globalSetting]);

  useEffect(() => {
    postSetting("TWITCH_DARKMODE", isDarkTheme());
    dispatchGlobalSetting({type: 'darkTheme', value: isDarkTheme()});
  }, [props.twitchTheme]);

  return (
    <RemoteChatContainerStyle
      id={`wtbc-${props.type}`}
      src={src}
      ref={frameRef}
    ></RemoteChatContainerStyle>
  );
}
