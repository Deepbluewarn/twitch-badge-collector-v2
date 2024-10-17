import browser from "webextension-polyfill";
import { ChatInfo } from "@interfaces/chat";
import { ChatExtractor, checkVerifiedBadge } from "../base/chatExtractor";
import { BaseContainer } from "../base/container";
import { Handle } from "../base/handler";
import { addHistoryStateListener } from "../base/historyStateListener";

class ChzzkChatExtractor extends ChatExtractor {
    extract(node: Node): ChatInfo | undefined {
        if (!this.prep(node)) return;

        const chat_clone = node.cloneNode(true) as Element;

        const display_name = chat_clone.getElementsByClassName(
            "name_text__yQG50"
        )[0];

        if (!display_name) return;

        let loginName: string = "";
        let nickName: string = "";

        if (display_name) {
            loginName = display_name.textContent!;
            nickName = display_name.textContent!;
        }

        const badges = (
            chat_clone.getElementsByClassName("badge_container__a64XB")
        );

        const textContents = (
            chat_clone.getElementsByClassName("live_chatting_message_text__DyleH")
        );

        const donationTextContents = (
            chat_clone.getElementsByClassName("live_chatting_donation_message_text__XbDKP")
        );

        const badgeArr = Array.from(badges).map((badge) => badge.getElementsByTagName("img")[0].src);
        const textArr = Array.from(textContents).map((text) => text.textContent);
        const donationTextArr = Array.from(donationTextContents).map((text) => text.textContent);

        const verifiedBadge = checkVerifiedBadge(chat_clone);

        if (verifiedBadge) {
            badgeArr.push("https://ssl.pstatic.net/static/nng/glive/resource/p/static/media/icon_official.a53d1555f8f4796d7862.png");
        }

        return {
            badges: [...badgeArr],
            textContents: [...textArr, ...donationTextArr],
            loginName: loginName,
            nickName: nickName,
        } as ChatInfo;
    }
}
function init() {
    const pathSegment = window.location.pathname.split('/')[1];
    
    if (pathSegment === 'video') {
        vodContainer.create();
    } else if (pathSegment === 'live') {
        liveContainer.create();
    }
}
const liveContainer = new BaseContainer(
    'chzzk', 
    new ChzzkChatExtractor('chzzk'), 
    new Handle('chzzk', '#tbc-chzzk-chat-list-container'), 
    '.live_chatting_list_wrapper__a5XTV',
);

const vodContainer = new BaseContainer(
    'chzzk',
    new ChzzkChatExtractor('chzzk'),
    new Handle('chzzk', '#tbc-chzzk-chat-list-container'),
    '.vod_chatting_list__+LZHw',
    '.pzp-pc__video video.webplayer-internal-video',
    '#tbc-clone__chzzkui',
)

init()

addHistoryStateListener('chzzk.naver.com', init);
