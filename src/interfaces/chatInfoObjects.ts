import { Version } from "./twitchAPI";

export type ChatInfoType =
  | "globalBadges"
  | "channelBadges"
  | "emotesets"
  | "cheermotes";
export type GlobalBadges = Map<string, Version>;
export type ChannelBadges = Map<string, Version>;
export type Emotesets = Map<string, any>;
export type Cheermotes = Map<string, any>;

export interface ChatInfoReducerAction {
  type: ChatInfoType;
  value: GlobalBadges | ChannelBadges | Emotesets | Cheermotes;
}

export interface ChatInfoObjects {
  globalBadges: GlobalBadges;
  channelBadges: ChannelBadges;
  emotesets: Emotesets;
  cheermotes: Cheermotes;
}
