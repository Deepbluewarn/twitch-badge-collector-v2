import { useQuery } from "@tanstack/react-query";
import { t } from "i18next";
import React from "react";
import { useTwitchAPIContext } from "../context/TwitchAPIContext";
import { ChannelInfoInterface, ChannelInterface } from "../interfaces/channel";
import { 
    Version,
} from "../interfaces/api/twitchAPI";
import { useAlertContext } from "../context/Alert";
import { chatInfoReducer } from "../reducer/chatInfo";

export default function useChannelInfo() {
    const twitchAPI = useTwitchAPIContext();
    const { addAlert } = useAlertContext();
    const [ channelInfoObject, dispatchChannelInfo ] = React.useReducer(chatInfoReducer, {
        globalBadges: new Map<string, Version>(),
        channelBadges: new Map<string, Version>(),
        emotesets: new Map<string, any>(),
        cheermotes: new Map<string, any>(),
    });
    const [ channelInfo, setChannelInfo ] = React.useState<ChannelInfoInterface>();
    const [ channel, setChannel ] = React.useState<ChannelInterface>();
    const [ userId, setUserId ] = React.useState('');
    const [ isChannelInfoObjSuccess, setIsChannelInfoObjSuccess ] = React.useState(false);


    const {data: GlobalBadges, isSuccess: isGlobalBadgesSuccess} = useQuery({
        queryKey: ['GlobalBadges'],
        queryFn: () => twitchAPI.fetchGlobalChatBadges(),
    })

    const {data: ChannelChatBadges, isSuccess: isChannelChatBadgesSuccess} = useQuery({
        queryKey: ['ChannelChatBadges', userId],
        queryFn: () => twitchAPI.fetchChannelChatBadges(userId),
        enabled: userId !== ''
    })

    const {data: Cheermotes, isSuccess: isCheermotesSuccess} = useQuery({
        queryKey: ['Cheermotes', userId],
        queryFn: () => twitchAPI.fetchCheermotes(userId),
        enabled: userId !== ''
    })

    const {data: User} = useQuery({
        queryKey: ['User', channel],
        queryFn: () => twitchAPI.fetchUser(channel!.type, channel!.value),
        enabled: typeof channel !== 'undefined' && channel.value !== ''
    })

    React.useEffect(() => {
        if(!GlobalBadges) return;

        dispatchChannelInfo({type: 'globalBadges', value: GlobalBadges});
    }, [GlobalBadges]);
    
    React.useEffect(() => {
        if(!ChannelChatBadges) return;

        dispatchChannelInfo({type: 'channelBadges', value: ChannelChatBadges});
    }, [ChannelChatBadges]);

    React.useEffect(() => {
        if(!Cheermotes) return;

        dispatchChannelInfo({type: 'cheermotes', value: Cheermotes});
    }, [Cheermotes]);

    React.useEffect(() => {
        setIsChannelInfoObjSuccess(
            isGlobalBadgesSuccess &&
            isChannelChatBadgesSuccess &&
            isCheermotesSuccess
        );
    }, [
        isGlobalBadgesSuccess, 
        isChannelChatBadgesSuccess, 
        isCheermotesSuccess,
    ]
    );

    React.useEffect(() => {
        if (typeof User === 'undefined') return;

        const data = User.data[0];

        if(typeof data === 'undefined') {
            addAlert({serverity: 'warning', message: t('alert.channel_not_found')});
            return;
        }

        const id = data.id;

        setChannelInfo({
            profileImgUrl: data.profile_image_url,
            displayName: data.display_name,
            loginName: data.login
        });
        setUserId(id);
    }, [User]);

    return { channelInfoObject, dispatchChannelInfo, channelInfo, isChannelInfoObjSuccess, channel, setChannel, User };
}