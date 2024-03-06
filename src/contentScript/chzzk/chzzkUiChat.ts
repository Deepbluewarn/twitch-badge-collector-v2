import { ChatInterface } from 'twitch-badge-collector-cc';

export default function ChatFromChzzkUi(node: Node) {
  const nodeElement = <HTMLElement>node;

  if (!nodeElement || nodeElement.nodeType !== 1) return;
  if (!nodeElement.closest("#tbc-chzzk-chat-list-wrapper")) return;

  const room_clone_parent = <HTMLDivElement>(
    nodeElement.closest("#tbc-chzzk-chat-list-wrapper")?.parentNode
  );

  if (!room_clone_parent) return;

  const chat_clone = <Element>nodeElement.cloneNode(true);

  const display_name = chat_clone.getElementsByClassName(
    "name_text__yQG50"
  )[0];

  if (!display_name) return;

  let loginName: string = "";
  let nickName: string = "";

  if (display_name) {
    loginName = <string>display_name.textContent;
    nickName = <string>display_name.textContent;
  }

  const badges = <HTMLCollectionOf<HTMLSpanElement>>(
    chat_clone.getElementsByClassName("badge_container__a64XB")
  );

  const textContents = <HTMLCollectionOf<HTMLSpanElement>>(
    chat_clone.getElementsByClassName("live_chatting_message_text__DyleH")
  );

  const donationTextContents = <HTMLCollectionOf<HTMLSpanElement>>(
    chat_clone.getElementsByClassName("live_chatting_donation_message_text__XbDKP")
  );

  const badgeArr = Array.from(badges).map((badge) => badge.getElementsByTagName("img")[0].src);
  const textArr = Array.from(textContents).map((text) => text.textContent);
  const donationTextArr = Array.from(donationTextContents).map((text) => text.textContent);

  const verifiedBadge = checkVerifiedBadge(chat_clone);

  if (verifiedBadge) {
    badgeArr.push('https://ssl.pstatic.net/static/nng/glive/resource/p/static/media/icon_official.a53d1555f8f4796d7862.png');
  }


  return <ChatInterface.ChatInfo>{
    badges: [...badgeArr],
    textContents: [...textArr, ...donationTextArr],
    loginName: loginName,
    nickName: nickName,
  };
}

function checkVerifiedBadge(chat_clone: Element): boolean {
  const verifiedBadge = <HTMLElement>(
    chat_clone.getElementsByClassName("name_icon__zdbVH")[0]
  );

  if(verifiedBadge === undefined) return false;

  const text = verifiedBadge.getElementsByClassName('blind')[0].textContent;

  return text === '인증 마크';
}
