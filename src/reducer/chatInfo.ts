import { ChannelBadges, ChatInfoObjects, ChatInfoReducerAction, Cheermotes, Emotesets, GlobalBadges } from "../interfaces/chatInfoObjects";

export function chatInfoReducer(state: ChatInfoObjects, action: ChatInfoReducerAction): ChatInfoObjects{
    const copyState = { ...state };
    
    switch (action.type) {
        case "globalBadges":
            copyState.globalBadges = action.value as GlobalBadges;
            return copyState;
        case "channelBadges":
            copyState.channelBadges = action.value as ChannelBadges;
            return copyState;
        case "emotesets":
            copyState.emotesets = action.value as Emotesets;
            return copyState;
        case "cheermotes":
            copyState.cheermotes = action.value as Cheermotes;
            return copyState;
        default:
            throw new Error('Unhandled action');
    }
}