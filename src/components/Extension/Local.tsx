import { useEffect, useRef, useState } from "react";
import { useGlobalSettingContext } from "@/context/GlobalSetting";
import useFilterGroup from "@/hooks/useFilterGroup";
import React from "react";
import { findElement, generateRandomString } from "@/utils/utils-common";
import { convertToJSX } from "@/utils/converter";
import { styled } from "@mui/material/styles";
import { addStorageUpdateListener } from "@/utils/utils-browser";
import { SettingInterface } from "@/interfaces/setting";
import { PlatformAdapter } from "@/platform";
import { Logger } from "@/utils/logger";
import { Observer } from "@/content-scripts/base/observer";

const Wrapper = styled('div')({
    height: '100%',
})

interface ChatWrapperProps {
    time: number;
    children?: React.ReactNode;
}

function ChatWrapper(props: ChatWrapperProps) {
    return <>{props.children}</>
}
// 채팅 요소를 그대로 복제하는 방식
export default function Local({
    type, videoSelector, adapter,
}: {
    type: SettingInterface['platform'],
    videoSelector?: string,
    adapter: PlatformAdapter,
}) {
    const { globalSetting } = useGlobalSettingContext();
    const [chatSet, setChatSet] = useState<React.ReactElement<ChatWrapperProps>[]>([]);
    const [chatIsBottom, setChatIsBottom] = useState(true);
    const maxNumChatsRef = useRef(import.meta.env.VITE_MAXNUMCHATS_DEFAULT as unknown as number);
    const currentTimeRef = useRef<number>(0);
    const { setFilterGroup, checkFilter } = useFilterGroup(type, true);
    const containerRef = useRef<HTMLDivElement>(null);
    const getScrollArea = () => {
        if (!containerRef.current) return;

        return containerRef.current?.querySelector(
            `#tbc-clone__${type}ui`
        );
    };

    const channelId = adapter.getCurrentChannelId();

    const newChatCallback = (mutationRecord: MutationRecord[]) => {
        const records = Array.from(mutationRecord);

        records.forEach((mr) => {
            const addedNodes = mr.addedNodes;
            if (!addedNodes) return;

            addedNodes.forEach((node) => {
                const chat = adapter.extract(node);

                if (!chat || chat === null) return;

                const filterRes = checkFilter(chat, channelId);

                if (typeof filterRes !== "undefined" && filterRes) {
                    const clone = node.cloneNode(true) as HTMLElement;

                    if (clone.classList.contains('tbcv2-highlight')) {
                        return;
                    }

                    (node as HTMLElement).classList.add('tbcv2-highlight');

                    adapter.prepareChatClone(clone);
                    const KEY = clone.getAttribute('data-tbc-chat-key') ?? `${new Date().getTime()}${generateRandomString(8)}`;
                    const TIME = parseInt(clone.getAttribute('data-tbc-chat-time') ?? '0', 10);

                    setChatSet(prevChatSet => {
                        if (prevChatSet.some(e => e.key === KEY)) {
                            return prevChatSet;
                        }
                        prevChatSet.push(React.createElement(ChatWrapper, {
                            key: KEY,
                            time: TIME,
                        }, convertToJSX(clone)))

                        prevChatSet.sort((a, b) => {
                            if (!a || !b) {
                                return 0;
                            }

                            return adapter.chatOrder === 'newest-top'
                                ? b.props.time - a.props.time
                                : a.props.time - b.props.time;
                        });

                        if (prevChatSet.length >= maxNumChatsRef.current) {
                            // newest-top이면 오래된 것이 끝, newest-bottom이면 오래된 것이 시작.
                            const trimFromEnd = adapter.chatOrder === 'newest-top';
                            const overflow = prevChatSet.length - maxNumChatsRef.current;
                            if (trimFromEnd) {
                                prevChatSet.splice(prevChatSet.length - 1, overflow);
                            } else {
                                prevChatSet.splice(0, overflow);
                            }
                        }
                        return [...prevChatSet];
                    });
                }
            });
        });
    };

    useEffect(() => {
        const scrollArea = getScrollArea();

        if (!scrollArea) return;

        const scrollCallback = () => {
            setChatIsBottom(scrollArea.scrollTop >= 0);
        };

        scrollArea.addEventListener("scroll", scrollCallback, false);

        return () => {
            scrollArea.removeEventListener("scroll", scrollCallback);
        };
    }, []);

    useEffect(() => {
        const observer = new Observer(`#tbc-${type}-chat-list-wrapper`, false);

        observer.observe((elem, mr) => {
            if (!mr) return;
            newChatCallback(mr);
        })
    }, [])

    useEffect(() => {
        const scrollArea = getScrollArea();

        if (!scrollArea) return;
        if (chatIsBottom) scrollArea.scrollTop = scrollArea.scrollHeight;
    }, [chatSet]);

    useEffect(() => {
        if (typeof globalSetting.maximumNumberChats === 'undefined') return;
        
        maxNumChatsRef.current = globalSetting.maximumNumberChats;
    }, [globalSetting]);

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
                setFilterGroup(newValue);
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
                // className={type === 'chzzk' ? 'live_chatting_list_wrapper__a5XTV' : ''}
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