import React, { Fragment, useEffect, useRef, useState } from "react";
import browser from "webextension-polyfill";
import { convertToJSX } from "@utils/converter";
import { styled } from "@mui/material/styles";
import {
    generateRandomString,
    observer,
} from "@utils/utils-common";
import ChatFromChzzkUi from "./chzzkUiChat";
import useArrayFilterExtension from "@hooks/useArrayFilterExtension";
import { useGlobalSettingContext } from "../../context/GlobalSetting";
import '../../../src/translate/i18n';

// 자동 스크롤이 정상적으로 동작하기 위해 필요한 wrapper 요소
const TwitchChatContainerStyle = styled("div")({
    height: "100%",
});

export function LocalChatContainer() {
    const { globalSetting } = useGlobalSettingContext();
    const [chatSet, setChatSet] = useState<React.ReactNode[]>([]);
    const [chatIsBottom, setChatIsBottom] = useState(true);
    const [maxNumChats, setMaxNumChats] = useState(import.meta.env.VITE_MAXNUMCHATS_DEFAULT as unknown as number);
    const { setArrayFilter, checkFilter } = useArrayFilterExtension('chzzk', true);
    const containerRef = useRef<HTMLDivElement>(null);

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
        const scrollArea = getScrollArea();

        if (!scrollArea) return;
        if (chatIsBottom) scrollArea.scrollTop = scrollArea.scrollHeight;
    }, [chatSet, maxNumChats]);

    useEffect(() => {
        if(typeof globalSetting.maximumNumberChats === 'undefined') return;

        setMaxNumChats(globalSetting.maximumNumberChats);
    }, [globalSetting.maximumNumberChats]);

    useEffect(() => {
        browser.storage.local.onChanged.addListener(changes => {
            if (!containerRef.current) return;

            if (changes['chatTime']) {
                switch (changes['chatTime'].newValue) {
                    case 'on':
                        containerRef.current.classList.remove('tbcv2_chatTime_off');
                        containerRef.current.classList.add('tbcv2_chatTime_on');
                        break;
                    case 'off':
                        containerRef.current.classList.remove('tbcv2_chatTime_on');
                        containerRef.current.classList.add('tbcv2_chatTime_off');
                        break;
                }
            }
        })
    }, [])

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

                    const username_elem = (clone as HTMLElement).getElementsByClassName(
                        'live_chatting_username_container__m1-i5 live_chatting_username_is_message__jvTvP')[0] as HTMLElement;

                    if (username_elem) {
                        const chatTime = document.createElement("div");
                        chatTime.classList.add("tbcv2-chat-time");
                        chatTime.textContent = new Date().toLocaleTimeString(
                            navigator.language, { hour: '2-digit', minute: '2-digit', hour12: false }
                        );
                        username_elem.classList.add('tbcv2-chat-username');
                        username_elem.style.display = 'inline-flex';
                        username_elem.prepend(chatTime);
                    }

                    setChatSet(prevChatSet => {
                        // Set으로 변환해서 중복 제거
                        const tempChatSet = new Set(prevChatSet);

                        if (tempChatSet.size >= maxNumChats) {
                            const iterator = prevChatSet.values()
                            const oldestElement = iterator.next().value
                            tempChatSet.delete(oldestElement);
                        }
                        tempChatSet.add(React.createElement(Fragment, {
                            key: `${new Date().getTime()}${generateRandomString(8)}`
                        }, convertToJSX(clone as HTMLElement)));
                        return [...tempChatSet];
                    });
                }
            });
        });
    };

    return (
        <TwitchChatContainerStyle ref={containerRef} className={globalSetting.chatTime === 'on' ? 'tbcv2_chatTime_on' : 'tbcv2_chatTime_off'}>
            <div
                className="live_chatting_list_wrapper__a5XTV"
                id="tbc-clone__chzzkui"
                style={{
                    marginTop: 0,
                    paddingTop: 0,
                    height: '100%'
                }}
            >
                {chatSet}
            </div>
        </TwitchChatContainerStyle>
    );
}