import axios from "axios";
import React from "react";
import { ChannelNameType } from "../interfaces/channel";
import { ChatBadges, EmoteSet, GetClips, GetFollowedStreams, GetUser, GetVideos, Tiers, UDChannelChatBadges, UDGlobalChatBadges, Version } from "../interfaces/twitchAPI";

const instance = axios.create({
    baseURL: 'https://badgecollector.dev'
})
export default function useTwitchAPI() {

    const fetchUser = React.useCallback(async (paramType?: ChannelNameType, ...reqParams: string[]) => {
        let params = new URLSearchParams();

        reqParams.forEach(param => {
            if (param && param !== '') {
                params.append(paramType === 'login' ? 'login' : 'id', param);
            }
        });

        const { data } = await instance.get(`/api/users?${params}`)
        return data as GetUser;
    }, []);

    const fetchFollowedStreams = React.useCallback(async (userId: string, cursor?: string | null) => {
        const params = new URLSearchParams();
    
        params.append('user_id', userId);
        params.append('first', '10');
        if (cursor && cursor !== '') params.append('after', cursor);
    
        const { data } = await instance.get(`/api/streams/followed?${params}`)
        return data as GetFollowedStreams;
    }, []);

    const fetchChannelChatBadges = React.useCallback(async (broadcaster_id: string) => {
        const url = `/api/chat/badges?broadcaster_id=${broadcaster_id}`;

        const { data } = await instance.get(url)
        return badgeDataToMap(data as ChatBadges);
    }, []);

    const fetchGlobalChatBadges = React.useCallback(async () => {
        const { data } = await instance.get('/api/chat/badges/global');
        return badgeDataToMap(data as ChatBadges);
    }, []);

    const fetchVideos = React.useCallback(async (id: string) => {
        const params = new URLSearchParams();
        params.append('id', id);

        const {data} = await instance.get(`/api/videos?${params}`);

        return data as GetVideos;
    }, []);

    const fetchClips = React.useCallback(async (clipId: string) => {
        const params = new URLSearchParams();
        params.append('id', clipId);

        const {data} = await instance.get(`/api/clips?${params}`);

        return data as GetClips;
    }, []);

    const fetchUDChannelChatBadges = React.useCallback(async (broadcaster_id: string) => {
        const params = new URLSearchParams();
        const url = `/udapi/badges/channels/${broadcaster_id}/display?${params}`;


        const {data} = await instance.get(url);

        return data as UDChannelChatBadges;
    }, []);

    const fetchUDGlobalChatBadges = React.useCallback(async () => {

        const params = new URLSearchParams();
        const url = `/udapi/badges/global/display?${params}`;

        const {data} = await instance.get(url);

        return data as UDGlobalChatBadges;
    }, []);

    const fetchEmoteSets = React.useCallback(async (emote_sets_id: string[]) => {

        const url = '/api/chat/emotes/set?';
        const emote_sets: Map<string, EmoteSet> = new Map();
        const params = new URLSearchParams();

        for(let i = 0; i < emote_sets_id.length; i++){
            params.append('emote_set_id', emote_sets_id[i]);
        }

        const { data } = await instance.get(url + params);
    
        data.data.forEach((e: EmoteSet) => {
            emote_sets.set(e.name, e);
        });

        return emote_sets;
    }, []);

    const fetchCheermotes = React.useCallback(async (broadcaster_id: string) => {
        const url = `/api/bits/cheermotes?broadcaster_id=${broadcaster_id}`;

        const { data } = await instance.get(url);

        let cmMap: Map<string, Tiers[]> = new Map();
    
        for (let c = 0; c < data.data.length; c++) {
            let cd = data.data[c];
            cmMap.set(cd.prefix, cd.tiers);
        }

        return cmMap;
    }, []);

    const badgeDataToMap = React.useCallback((badges: ChatBadges) => {
        const badge_data = badges.data;
        let badges_map: Map<string, Version> = new Map();
    
        for (let b = 0; b < badge_data.length; b++) {
            let bd = badge_data[b];
            for (let v = 0; v < bd.versions.length; v++) {
                const badge_raw = `${bd.set_id}/${bd.versions[v].id}`;
                badges_map.set(badge_raw, bd.versions[v]);
            }
        }
        return badges_map;
    }, []);

    return {
        fetchUser,
        fetchFollowedStreams, 
        fetchChannelChatBadges, 
        fetchGlobalChatBadges, 
        fetchVideos, 
        fetchClips,
        fetchUDGlobalChatBadges,
        fetchUDChannelChatBadges,
        fetchEmoteSets,
        fetchCheermotes
    };
}

export interface TwitchAPIHooks {
    fetchUser: (paramType?: ChannelNameType, ...reqParams: string[]) => Promise<GetUser>,
    fetchFollowedStreams: (user_id: string, after?: string | null) => Promise<GetFollowedStreams>,
    fetchChannelChatBadges: (broadcaster_id: string) => Promise<Map<string, Version>>,
    fetchGlobalChatBadges: () => Promise<Map<string, Version>>,
    fetchVideos: (id: string) => Promise<GetVideos>,
    fetchClips: (clipId: string) => Promise<GetClips>,
    fetchUDGlobalChatBadges: () => Promise<UDGlobalChatBadges>,
    fetchUDChannelChatBadges: (broadcaster_id: string) => Promise<UDChannelChatBadges>,
    fetchEmoteSets: (emote_sets_id: string[]) => Promise<Map<string, EmoteSet>>,
    fetchCheermotes: (broadcaster_id: string) => Promise<Map<string, Tiers[]>>,
}