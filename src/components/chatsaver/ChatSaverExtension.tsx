/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { ChannelInterface, BroadcastChannelInterface, useChannelInfo, Context, ChatSaver } from "twitch-badge-collector-cc";
import browser from 'webextension-polyfill';

/**
 * ChatSaver Wrapper for Extension
 * @param props 
 */
export default function ChatSaverExtension() {
    const { channelInfoObject, dispatchChannelInfo, channel, setChannel, User } =
        useChannelInfo();
    const [channelChatListMap, setChannelChatListMap] = useState<
        Map<string, BroadcastChannelInterface.ChannelChatList>
    >(new Map());
    const [channelInfoList, setChannelInfoList] = useState<
        Map<string, ChannelInterface.ChannelInfoInterface>
    >(new Map());
    const [selectedChannel, setSelectedChannel] = useState<string>("");

    const sendMessageToFrame = (from: string, type: string, value?: any) => {
        browser.tabs.query({}).then((tabs) => {
            for (const tab of tabs) {
                if (!tab.id) return;
                browser.webNavigation
                    .getAllFrames({ tabId: tab.id })
                    .then((details) => {
                        if (details === null) return;

                        for (const u of details) {
                            const url = new URL(u.url);

                            if (url.hostname === import.meta.env.VITE_BASE_HOSTNAME) {
                                if (!tab.id) return;

                                browser.tabs.sendMessage(
                                    tab.id,
                                    {
                                        from,
                                        type,
                                        value,
                                    },
                                    {
                                        frameId: u.frameId,
                                    }
                                );
                            }
                        }
                    });
            }
        });
    };

    const requestChannelList = () => {
        // ChatSaver 채널 목록 요청 1
        sendMessageToFrame("extension_setting", "CHATSAVER_REQUEST_CHANNEL_INFO");
    };

    useEffect(() => {
        requestChannelList();
    }, []);

    useEffect(() => {
        browser.runtime.onMessage.addListener((message) => {
            if (
                message.from === "remoteContentScript" &&
                message.type === "CHATSAVER_RESPONSE_CHANNEL_INFO"
            ) {
                // ChatSaver 채널 목록 도착
                setChannelInfoList((list) => {
                    const cloneList = new Map(list);
                    const channelInfo = message.value;

                    if (!channelInfo) return list;

                    cloneList.set(channelInfo!.loginName, channelInfo);

                    return cloneList;
                });
            } else if (
                message.from === "remoteContentScript" &&
                message.type === "CHATSAVER_RESPONSE_CHAT_LIST"
            ) {
                const dataValue = message.value;

                if (dataValue.channel && dataValue.chatList) {
                    const channelInfo = dataValue.channelInfo;

                    if (typeof channelInfo === "undefined") return;

                    const channelLogin = channelInfo.loginName;
                    const channelChatList = dataValue.chatList;
                    const chatListType = dataValue.chatListType;
                    const chatListId = dataValue.chatListId;

                    setChannelChatListMap((channels) => {
                        const copyChannels = new Map(channels);

                        if (!chatListId) return channels;

                        if (copyChannels.has(channelLogin)) {
                            const list = copyChannels.get(channelLogin);

                            if (!list) return channels;

                            const hasChatId = list.chatLists.some((chat) => {
                                return chat.listId === chatListId;
                            });

                            if (!hasChatId) {
                                list.chatLists.push({
                                    list: channelChatList,
                                    listId: chatListId,
                                    chatListType,
                                });
                            }
                            copyChannels.set(channelLogin, list);
                        } else {
                            copyChannels.set(channelLogin, {
                                chatLists: [
                                    {
                                        list: channelChatList,
                                        listId: chatListId,
                                        chatListType,
                                    },
                                ],
                                channelInfo,
                            });
                        }
                        return copyChannels;
                    });
                }
            }
        });

    }, []);

    useEffect(() => {
        sendMessageToFrame("extension_setting", "CHATSAVER_REQUEST_CHAT_LIST", {
            type: "login",
            value: selectedChannel,
        });

        setChannel({ type: "login", value: selectedChannel });
    }, [selectedChannel]);


    return (
        <Context.ChannelInfoContext.Provider
            value={{ channelInfoObject, dispatchChannelInfo, channel, setChannel, User }}
        >
            <ChatSaver
                channelChatListMap={channelChatListMap}
                setChannelChatListMap={setChannelChatListMap}
                channelInfoList={channelInfoList}
                setChannelInfoList={setChannelInfoList}
                selectedChannel={selectedChannel}
                setSelectedChannel={setSelectedChannel}
                requestChannelList={requestChannelList}
            />
        </Context.ChannelInfoContext.Provider>
    )
}