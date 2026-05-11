import axios from "axios";
import { ChannelNameType } from "@/interfaces/channel";
import { ChatBadges, EmoteSet, GetClips, GetFollowedStreams, GetUser, GetUsersFollows, GetVideos, Tiers, Version } from "@/interfaces/api/twitchAPI";

export interface TwitchAPI {
    fetchUser: (paramType?: ChannelNameType, ...reqParams: string[]) => Promise<GetUser>;
    fetchFollowedStreams: (user_id: string, after?: string | null) => Promise<GetFollowedStreams>;
    fetchChannelChatBadges: (broadcaster_id: string) => Promise<Map<string, Version>>;
    fetchGlobalChatBadges: () => Promise<Map<string, Version>>;
    fetchVideos: (id: string) => Promise<GetVideos>;
    fetchClips: (clipId: string) => Promise<GetClips>;
    fetchEmoteSets: (emote_sets_id: string[]) => Promise<Map<string, EmoteSet>>;
    fetchCheermotes: (broadcaster_id: string) => Promise<Map<string, Tiers[]>>;
    fetchUsersFollows: (from_id: string, to_id: string) => Promise<GetUsersFollows>;
}

function badgeDataToMap(badges: ChatBadges): Map<string, Version> {
    const result: Map<string, Version> = new Map();
    for (const bd of badges.data) {
        for (const v of bd.versions) {
            result.set(`${bd.set_id}/${v.id}`, v);
        }
    }
    return result;
}

export function createTwitchAPI(): TwitchAPI {
    const instance = axios.create({ baseURL: 'https://badgecollector.dev' });

    return {
        fetchUser: async (paramType, ...reqParams) => {
            const params = new URLSearchParams();
            for (const p of reqParams) {
                if (p && p !== '') params.append(paramType === 'login' ? 'login' : 'id', p);
            }
            const { data } = await instance.get(`/api/users?${params}`);
            return data as GetUser;
        },
        fetchFollowedStreams: async (userId, cursor) => {
            const params = new URLSearchParams();
            params.append('user_id', userId);
            params.append('first', '10');
            if (cursor && cursor !== '') params.append('after', cursor);
            const { data } = await instance.get(`/api/streams/followed?${params}`);
            return data as GetFollowedStreams;
        },
        fetchChannelChatBadges: async (broadcasterId) => {
            const { data } = await instance.get(`/api/chat/badges?broadcaster_id=${broadcasterId}`);
            return badgeDataToMap(data as ChatBadges);
        },
        fetchGlobalChatBadges: async () => {
            const { data } = await instance.get('/api/chat/badges/global');
            return badgeDataToMap(data as ChatBadges);
        },
        fetchVideos: async (id) => {
            const params = new URLSearchParams({ id });
            const { data } = await instance.get(`/api/videos?${params}`);
            return data as GetVideos;
        },
        fetchClips: async (clipId) => {
            const params = new URLSearchParams({ id: clipId });
            const { data } = await instance.get(`/api/clips?${params}`);
            return data as GetClips;
        },
        fetchEmoteSets: async (emoteSetsId) => {
            const params = new URLSearchParams();
            for (const id of emoteSetsId) params.append('emote_set_id', id);
            const { data } = await instance.get(`/api/chat/emotes/set?${params}`);
            const emoteSets: Map<string, EmoteSet> = new Map();
            data.data.forEach((e: EmoteSet) => emoteSets.set(e.name, e));
            return emoteSets;
        },
        fetchCheermotes: async (broadcasterId) => {
            const { data } = await instance.get(`/api/bits/cheermotes?broadcaster_id=${broadcasterId}`);
            const cmMap: Map<string, Tiers[]> = new Map();
            for (const cd of data.data) cmMap.set(cd.prefix, cd.tiers);
            return cmMap;
        },
        fetchUsersFollows: async (fromId, toId) => {
            const { data } = await instance.get(`/api/users/follows?from_id=${fromId}&to_id=${toId}`);
            return data as GetUsersFollows;
        },
    };
}
