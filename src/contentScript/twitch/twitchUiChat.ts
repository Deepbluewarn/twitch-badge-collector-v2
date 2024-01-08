import { ChatInterface } from 'twitch-badge-collector-cc';

export default function ChatFromTwitchUi(node: Node) {
  const nodeElement = <HTMLElement>node;

  if (!nodeElement || nodeElement.nodeType !== 1) return;
  if (!nodeElement.closest(".chat-scrollable-area__message-container")) return;

  const room_clone_parent = <HTMLDivElement>(
    nodeElement.closest(".scrollable-area.tbc-origin")?.parentNode
  );

  if (!room_clone_parent) return;

  const chat_clone = <Element>nodeElement.cloneNode(true);

  const display_name = chat_clone.getElementsByClassName(
    "chat-author__display-name"
  )[0];
  const chatter_name = chat_clone.getElementsByClassName("intl-login")[0];

  if (!display_name && !chatter_name) return;

  let loginName: string = "";
  let nickName: string = "";
  let subLoginName: string = "";
  let subNickname: string = "";

  if (display_name) {
    loginName = <string>display_name.getAttribute("data-a-user")?.toLowerCase();
    nickName = <string>display_name.textContent?.toLowerCase();
  }
  if (chatter_name) {
    subLoginName = <string>chatter_name.textContent;
    subLoginName = subLoginName.substring(1, subLoginName.length - 1);
    subNickname = <string>chatter_name.parentNode?.childNodes[0].textContent;
  }

  loginName = loginName ? loginName : subLoginName;
  nickName = nickName ? nickName : subNickname;

  const textContents = <HTMLCollectionOf<HTMLSpanElement>>(
    chat_clone.getElementsByClassName("text-fragment")
  );
  const badges = <HTMLCollectionOf<HTMLImageElement>>(
    chat_clone.getElementsByClassName("chat-badge")
  );

  Array.from(textContents).map((text) => text.textContent);

  return <ChatInterface.ChatInfo>{
    textContents: Array.from(textContents).map((text) => text.textContent),
    badges: Array.from(badges).map(
      (badge) => new URL(badge.src).pathname.split("/")[3]
    ),
    loginName: loginName,
    nickName: nickName,
  };
}
