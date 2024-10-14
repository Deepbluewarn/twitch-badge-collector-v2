import { Fragment, useEffect, useRef, useState } from "react";
import { useGlobalSettingContext } from "../../context/GlobalSetting";
import useArrayFilterExtension from "@hooks/useArrayFilterExtension";
import React from "react";
import { findElement, generateRandomString, observe } from "@utils/utils-common";
import { convertToJSX } from "@utils/converter";
import { styled } from "@mui/material/styles";
import { addStorageUpdateListener } from "@utils/utils-browser";
import { SettingInterface } from "@interfaces/setting";
import { ChatExtractor } from "../../contentScript/base/chatExtractor";
import { Logger } from "@utils/logger";

const Wrapper = styled('div')({
    height: '100%',
})
// 채팅 요소를 그대로 복제하는 방식
export default function Local({
    type, videoSelector, extractor, 
}: {
    type: SettingInterface['platform'], 
    videoSelector?: string,
    extractor: ChatExtractor,
}) {
    const { globalSetting } = useGlobalSettingContext();
    const [chatSet, setChatSet] = useState<React.ReactNode[]>([]);
    const [chatIsBottom, setChatIsBottom] = useState(true);
    const [maxNumChats, setMaxNumChats] = useState(import.meta.env.VITE_MAXNUMCHATS_DEFAULT as unknown as number);
    const currentTimeRef = useRef<number>(0);
    const { setArrayFilter, checkFilter } = useArrayFilterExtension(type, true);
    const containerRef = useRef<HTMLDivElement>(null);
    const getScrollArea = () => {
        if (!containerRef.current) return;

        return containerRef.current?.querySelector(
            `#tbc-clone__${type}ui`
        );
    };
    const newChatCallback = (mutationRecord: MutationRecord[]) => {
        const records = Array.from(mutationRecord);

        records.forEach((mr) => {
            const addedNodes = mr.addedNodes;
            if (!addedNodes) return;

            addedNodes.forEach((node) => {
                const chat = extractor.extract(node);

                if (!chat || chat === null) return;

                const filterRes = checkFilter(chat);

                if (typeof filterRes !== "undefined" && filterRes) {
                    const clone = node.cloneNode(true);

                    (node as HTMLElement).classList.add('tbcv2-highlight');
                    (clone as HTMLElement).classList.remove('tbcv2-highlight')

                    if (type === 'chzzk') {
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

    useEffect(() => {
        const scrollArea = getScrollArea();

        if (!scrollArea) return;

        const scrollCallback = () => {
            const res = scrollArea.scrollTop + scrollArea.clientHeight >=
            scrollArea.scrollHeight - 40;
            setChatIsBottom(
                res
            );
        };

        scrollArea.addEventListener("scroll", scrollCallback, false);

        return () => {
            scrollArea.removeEventListener("scroll", scrollCallback);
        };
    }, []);

    useEffect(() => {
        observe(`#tbc-${type}-chat-list-wrapper`, async (elem, mr) => {
            if (!mr) return;
            newChatCallback(mr);
        }, false);
    }, [])

    useEffect(() => {
        const scrollArea = getScrollArea();

        if (!scrollArea) return;
        if (chatIsBottom) scrollArea.scrollTop = scrollArea.scrollHeight;
    }, [chatSet, maxNumChats]);

    useEffect(() => {
        if (typeof globalSetting.maximumNumberChats === 'undefined') return;

        setMaxNumChats(globalSetting.maximumNumberChats);
    }, [globalSetting.maximumNumberChats]);

    useEffect(() => {
        addStorageUpdateListener((key, newValue) => {
            if (key === 'chatTime' && containerRef.current) {
                switch (newValue) {
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

            if (key === "filter") {
                setArrayFilter(newValue);
            }
        })
    }, [])

    useEffect(() => {
        if (!videoSelector) return;

        findElement(videoSelector, (elem) => {
            if (!elem) return;

            elem.addEventListener('seeked', e=> {
                const time = (e.target as HTMLMediaElement).currentTime;

                if (currentTimeRef.current - time > 0) {
                    setChatSet([]);
                    Logger('Local', 'All clone chats removed')
                }
                currentTimeRef.current = time;
            })
        })
    }, [])

    return (
        <Wrapper ref={containerRef} className={globalSetting.chatTime === 'on' ? 'tbcv2_chatTime_on' : 'tbcv2_chatTime_off'}>
            <div
                id={`tbc-clone__${type}ui`}
                style={{
                    marginTop: 0,
                    paddingTop: 0,
                    height: '100%'
                }}
            >
                {chatSet}
            </div>
        </Wrapper>
    )
}