/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState } from "react";
import browser from "webextension-polyfill";
import convert from "react-from-dom";
import { styled } from "@mui/material/styles";
import createContainerHandler from "./containerHandler";
import {
  observer,
} from "@utils/utils-common";
import ChatFromTwitchUi from "./twitchUiChat";
import useArrayFilterExtension from "@hooks/useArrayFilterExtension";
import { useGlobalSettingContext } from "../../context/GlobalSetting";

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
  const { globalSetting } = useGlobalSettingContext();
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
