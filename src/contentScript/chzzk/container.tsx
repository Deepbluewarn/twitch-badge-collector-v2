import React, { useEffect, useRef, useState } from "react";
import browser from "webextension-polyfill";
import convert from "react-from-dom";
import { styled } from "@mui/material/styles";
import {
  observer,
} from "../../utils";
import ChatFromChzzkUi from "./chzzkUiChat";
import {
  Context as TBCContext,
} from 'twitch-badge-collector-cc';
import useArrayFilterExtension from "../../hooks/useArrayFilterExtension";

const TwitchChatContainerStyle = styled("div")({
    height: "100%",
});

export function LocalChatContainer() {
    const { globalSetting } = TBCContext.useGlobalSettingContext();
    const [chatList, setChatList] = useState<Node[]>([]);
    const [chatIsBottom, setChatIsBottom] = useState(true);
    const [maxNumChats] = useState(globalSetting.maximumNumberChats || (import.meta.env.VITE_MAXNUMCHATS_DEFAULT as unknown) as number);
    const { setArrayFilter, checkFilter } = useArrayFilterExtension(true);
    const containerRef = useRef<HTMLDivElement>(null);

    const container = document.getElementsByClassName("live_chatting_list_wrapper__a5XTV")[0];
    let originalContainer = null;

    if (container) {
        originalContainer = container.cloneNode(true) as HTMLElement;

        originalContainer.setAttribute("style", "");
        originalContainer.id = "tbc-clone__chzzkui";

        originalContainer.style.marginTop = '0';
        originalContainer.style.paddingTop = '0';
        originalContainer.style.height = "100%";

        originalContainer.textContent = ""; //remove all chat lines.
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
            document.getElementById("tbc-chzzk-chat-list-wrapper")!,
            {
                childList: true,
                subtree: true,
            },
            newChatCallback
        );

        return () => {
            if (chatObserver) chatObserver.disconnect();
        }
    }, [maxNumChats]);

    useEffect(() => {
        const chatListContainer = containerRef.current?.querySelector(
            "#tbc-clone__chzzkui"
        );
        chatList.forEach((chat) => {
            if (!chatListContainer) return;

            if (chatListContainer.childElementCount >= (maxNumChats || (import.meta.env.VITE_MAXNUMCHATS_DEFAULT as unknown) as number)) {
                const firstChild = chatListContainer.firstElementChild;

                if (firstChild === null) return;

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

        return containerRef.current?.querySelector(
            "#tbc-clone__chzzkui"
        );
    };

    const newChatCallback = (mutationRecord: MutationRecord[]) => {
        const records = Array.from(mutationRecord);

        records.forEach((mr) => {
            const addedNodes = mr.addedNodes;
            if (!addedNodes) return;

            addedNodes.forEach((node) => {
                const chat = ChatFromChzzkUi(node);

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