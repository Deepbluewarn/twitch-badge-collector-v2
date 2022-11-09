export interface GetUser {
    data: User[]
}
export interface User {
    "id": string,
    "login": string,
    "display_name": string,
    "type": string,
    "broadcaster_type": string,
    "description": string,
    "profile_image_url": string,
    "offline_image_url": string,
    "view_count": number,
    "email": string,
    "created_at": string
}
export interface GetFollowedStreams {
    data: [
        {
            "id": string,
            "user_id": string,
            "user_login": string,
            "user_name": string,
            "game_id": string,
            "game_name": string,
            "type": string,
            "title": string,
            "viewer_count": number,
            "started_at": string,
            "language": string,
            "thumbnail_url": string,
            "tag_ids": string[]
        }
    ],
    pagination: {
        cursor: string
    }
}
export interface ChatBadges {
    data: ChatBadge[]
}
export interface ChatBadge {
    "set_id": string,
    "versions": Version[]
}
export interface Version {
    "id": string,
    "image_url_1x": string,
    "image_url_2x": string,
    "image_url_4x": string,
}
export interface GetVideos {
    "data": [
        {
            "id": string
            "stream_id": string | null,
            "user_id": string,
            "user_login": string
            "user_name": string
            "title": string,
            "description": string,
            "created_at": string,
            "published_at": string,
            "url": string,
            "thumbnail_url": string,
            "viewable": string,
            "view_count": number,
            "language": string,
            "type": string,
            "duration": string,
            "muted_segments": [
                {
                    "duration": number,
                    "offset": number
                }
            ]
        }
    ],
    pagination: {
        cursor: string
    }
}
export interface GetClips {
    "data": [
        {
            "id": string,
            "url": string,
            "embed_url": string,
            "broadcaster_id": string,
            "broadcaster_name": string,
            "creator_id": string,
            "creator_name": string,
            "video_id": string,
            "game_id": string,
            "language": string,
            "title": string,
            "view_count": number,
            "created_at": string,
            "thumbnail_url": string,
            "duration": number,
            "vod_offset": number
          }
    ]
}
export interface GetEmoteSets {
    "data": EmoteSet[],
    "template": string
}
export interface EmoteSet {
    "id": string,
    "name": string,
    "images": {
        "url_1x": string,
        "url_2x": string,
        "url_4x": string,
    },
    "emote_type": string,
    "emote_set_id": string,
    "owner_id": string,
    "format": string[],
    "scale": string[]
    "theme_mode": string[],
}
export interface GetCheermotes {
    data: Cheermote[]
}
export interface Cheermote {
    "prefix": string,
    "tiers": Tiers[],
    "type": string,
    "order": number,
    "last_updated": string,
    "is_charitable": boolean
}
export interface Tiers {
    "min_bits": 1,
    "id": string,
    "color": string,
    "images": {
        "dark": {
            "animated": {
                "1": string,
                "1.5": string,
                "2": string,
                "3": string,
                "4": string,
            },
            "static": {
                "1": string,
                "1.5": string,
                "2": string,
                "3": string,
                "4": string,
            }
        },
        "light": {
            "animated": {
                "1": string,
                "1.5": string,
                "2": string,
                "3": string,
                "4": string
            },
            "static": {
                "1": string,
                "1.5": string,
                "2": string,
                "3": string,
                "4": string
            }
        }
    },
    "can_cheer": boolean,
    "show_in_bits_card": boolean
}

export interface UDGlobalChatBadges {
    badge_sets: {
        [key:string]: {
            versions: UDVersion
        }
    }
}
export interface UDChannelChatBadges {
    badge_sets: {
        bits: {
            versions: UDVersion
        },
        subscriber: {
            versions: UDVersion
        }
    }
}
export interface UDVersion{
    [key: number]: {
        click_action: string,
        click_url: string,
        description: string,
        image_url_1x: string,
        image_url_2x: string,
        image_url_4x: string,
        last_updated: null
        title: string,
    }
}