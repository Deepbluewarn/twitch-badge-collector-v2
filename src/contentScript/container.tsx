import React, { useEffect, useRef, useState } from "react";
import browser from "webextension-polyfill";
import styled from "styled-components";
import convert from "react-from-dom";
import createContainerHandler from "./containerHandler";
import { getChannelFromPath, getVideoIdParam, ReplayPageType, observer } from "./utils";
import ChatFromTwitchUi from "./twitchUiChat";
import useArrayFilter from "../hooks/useArrayFilter";
import { useGlobalSettingContext } from "../context/globalSetting";
import { ContainerType } from "../interfaces/container";
import MessageInterface from "../interfaces/message";
import useMutationObserver from "../hooks/useMutationObserver";

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

export function createCloneContainer() {
  const chatroom = ChatRoom();

  if (chatroom === null) return;

  const original_container = chatroom.getElementsByClassName(
    "scrollable-area"
  )[0] as HTMLDivElement;
  const tbcContainer = document.createElement("div");

  original_container.classList.add("tbc-origin");
  tbcContainer.id = "tbc-container";

  const chatroomChild = chatroom.firstChild as Element;

  if (chatroomChild) {
    chatroomChild.prepend(createContainerHandler());
    chatroomChild.prepend(tbcContainer);
  }
}

export function createReplayContainer(video_chat: Element) {
  const replayContainer = document.createElement('div');
  replayContainer.id = 'tbc-container';

  video_chat.classList.add("tbc-origin");
  video_chat.parentElement?.classList.add('flex_column');
  video_chat.parentElement?.appendChild(createContainerHandler());
  video_chat.parentElement?.appendChild(replayContainer);
}

const TwitchChatContainerStyle = styled.div`
  height: 100%;
`;

export function LocalChatContainer() {
  const [ chatList, setChatList ] = useState<Node[]>([]);
  const { filterRef, checkFilter } = useArrayFilter();
  const containerRef = useRef<HTMLDivElement>(null);

  const container = document.getElementsByClassName("tbc-origin")[0];

  if (!container) return null;

  const originalContainer = container.cloneNode(true) as HTMLElement;

  originalContainer.setAttribute("style", "");
  originalContainer.classList.remove("tbc-origin");
  originalContainer.id = "tbc-clone__twitchui";

  const message_container = originalContainer.getElementsByClassName(
    "chat-scrollable-area__message-container"
  )[0];
  message_container.textContent = ""; //remove all chat lines.

  const [chatIsBottom, setChatIsBottom] = useState(true);

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
    observer(
      document.getElementsByClassName("stream-chat")[0],
      {
        childList: true,
        subtree: true,
        attributeFilter: ["class"],
      },
      newChatCallback
    );
  }, []);

  useEffect(() => {
    chatList.forEach((chat) => {
      const chatListContainer = containerRef.current?.getElementsByClassName(
        "chat-scrollable-area__message-container"
      )[0];

      if (!chatListContainer) return;

      chatListContainer.appendChild(chat);
    });
    const scrollArea = getScrollArea();

    if (!scrollArea) return;
    if (chatIsBottom) scrollArea.scrollTop = scrollArea.scrollHeight;
  }, [chatList]);

  const getScrollArea = () => {
    if (!containerRef.current) return;

    return containerRef.current.getElementsByClassName(
      "simplebar-scroll-content"
    )[0];
  };

  const newChatCallback = (mutationRecord: MutationRecord[]) => {
    Array.from(mutationRecord).forEach((mr) => {
      const addedNodes = mr.addedNodes;
      if (!addedNodes) return;

      addedNodes.forEach((node) => {
        const chat = ChatFromTwitchUi(node);

        if (!chat || chat === null) return;

        const filterRes = checkFilter(chat);

        if (typeof filterRes !== "undefined" && filterRes) {
          setChatList((n) => [...n, node.cloneNode(true)]);
        }
      });
    });
  };

  const twitchClone = convert(originalContainer) as React.ReactNode;

  return (
    <TwitchChatContainerStyle ref={containerRef}>
      {twitchClone}
    </TwitchChatContainerStyle>
  );
}

const RemoteChatContainerStyle = styled.iframe`
  width: 100%;
  height: 100%;
  margin-bottom: 8px;
`;

export function RemoteChatContainer(props: { type: ContainerType }) {
  const base_url = "https://wtbclight.bluewarn.dev/";
  const params = new URLSearchParams();
  const replayType = ReplayPageType();
  const [ videoId, setVideoId ] = useState(getVideoIdParam(replayType));

  const twitchHTMLTagRef = useRef<HTMLElement>(document.documentElement);
  const getDarkTheme = () => {
    return twitchHTMLTagRef.current.classList.contains('tw-root--theme-dark');
  }
  const [ darkTheme, setDarkTheme ] = useState(getDarkTheme());

  const themeCallback = (mutationRecord: MutationRecord[]) => {
    setDarkTheme(getDarkTheme());
  }

  useMutationObserver(twitchHTMLTagRef, themeCallback);

  if (props.type === 'replay') {
    if (replayType && videoId) {
      params.set(replayType, videoId);
    }
  } else {
    params.set("channel", getChannelFromPath());
  }

  params.set("ext_version", browser.runtime.getManifest().version);

  const { globalSetting, dispatchGlobalSetting } = useGlobalSettingContext();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const frameLoaded = useRef(false);

  const src = `${base_url}${props.type}?${params}`;

  const postSetting = (type: string, value: any) => {
    if (frameRef.current && frameLoaded.current) {
      frameRef.current.contentWindow?.postMessage({
        sender: 'tbc', type, value
      } as MessageInterface, base_url);
    }
  };

  const onFrameLoaded = () => {
    postSetting('EXTENSION_SETTING', globalSetting);
    postSetting('TWITCH_DARKMODE', darkTheme);
  }

  useEffect(() => {
    if(props.type !== 'replay') return;
    
    const player: HTMLVideoElement | undefined = document.getElementsByClassName('video-ref')[0].getElementsByTagName('video')[0];

    player.ontimeupdate = e => {
      const msg: MessageInterface = {
        sender: 'tbc',
        type: 'PLAYER_TIME',
        value: player.currentTime
      }
      frameRef.current?.contentWindow?.postMessage(msg, base_url);
    };
  }, [props.type]);

  useEffect(() => {
    browser.runtime.onMessage.addListener((message, sender) => {
      if (message.action === "onHistoryStateUpdated") {
        if(props.type === 'replay') {
          setVideoId(getVideoIdParam(ReplayPageType()));
        }
      }
    });

    window.onmessage = (e) => {
      if (e.data.sender === 'wtbc' && e.data.type === 'REQUEST_EXTENSION_SETTING') {
        frameLoaded.current = true;
        postSetting('EXTENSION_SETTING', globalSetting);
        postSetting('TWITCH_DARKMODE', darkTheme);
      }
    }
  }, []);

  useEffect(() => {
    postSetting('EXTENSION_SETTING', globalSetting);
  }, [globalSetting]);

  useEffect(() => {
    postSetting('TWITCH_DARKMODE', darkTheme);
  }, [darkTheme]);

  return (
    <RemoteChatContainerStyle
      id={`wtbc-${props.type}`}
      src={src}
      frameBorder="0"
      onLoad={onFrameLoaded}
      ref={frameRef}
    ></RemoteChatContainerStyle>
  );
}