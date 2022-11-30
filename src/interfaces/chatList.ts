import { ChannelInfoInterface, ChannelInterface } from "./channel";
import { MessageInterface } from "./chat";

export type chatListType = "live" | "replay";

export interface ChannelChatList {
  chatLists: ChatLists[];
  channelInfo?: ChannelInfoInterface;
}

interface ChatLists {
  list: MessageInterface[];
  listId: string;
  chatListType?: chatListType;
}
