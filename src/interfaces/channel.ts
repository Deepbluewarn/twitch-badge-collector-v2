export const BadgeChannelArr = ["global", "channel"];
export type BadgeChannelType = typeof BadgeChannelArr[number];
export type ChannelNameType = 'id' | 'login';

export interface ChannelInterface {
    type: ChannelNameType,
    value: string
}
export interface ChannelInfoInterface {
    profileImgUrl: string;
    displayName: string;
    loginName: string;
    category?: string;
}