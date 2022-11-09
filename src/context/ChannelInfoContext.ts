import React, { SetStateAction, useContext } from "react";
import { ChannelInfoInterface, ChannelInterface } from "../interfaces/channel";
import { ChatInfoObjects, ChatInfoReducerAction } from "../interfaces/chatInfoObjects";

export const ChannelInfoContext = React.createContext<{
    channelInfoObject: ChatInfoObjects, 
    dispatchChannelInfo: React.Dispatch<ChatInfoReducerAction>,
    channelInfo?: ChannelInfoInterface,
    isChannelInfoObjSuccess?: boolean,
    channel: ChannelInterface | undefined,
    setChannel: React.Dispatch<SetStateAction<ChannelInterface | undefined>>
} | undefined>(undefined);

export function useChannelInfoContext() {
    const context = useContext(ChannelInfoContext);
    
    if (typeof context === 'undefined') {
        throw new Error("ChannelInfoContext must be within ChannelInfoProvider");
    }

    return context;
}