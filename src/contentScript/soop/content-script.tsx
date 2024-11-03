import { ChatInfo } from "@interfaces/chat";
import { ChatExtractor, checkVerifiedBadge } from "../base/chatExtractor";
import { BaseContainer } from "../base/container";
import { Handle } from "../base/handler";
import { addHistoryStateListener } from "../base/historyStateListener";

import mainWorld from './inject?script&module'

const script = document.createElement('script')
script.src = chrome.runtime.getURL(mainWorld)
script.type = 'module'
document.head.prepend(script)
script.remove();

export class SoopChatExtractor extends ChatExtractor {
    extract(node: Node): ChatInfo | undefined {
        if (!this.prep(node)) return;

        const chat_clone = node.cloneNode(true) as Element;

        console.log(chat_clone);

        // return {
        //     badges: [...badgeArr],
        //     textContents: [...textArr, ...donationTextArr],
        //     loginName: loginName,
        //     nickName: nickName,
        // } as ChatInfo;
    }
}
function init() {
    // const pathSegment = window.location.pathname.split('/')[1];
    const subDomain = location.hostname.split('.')[0]
    
    if (subDomain === 'vod') {
        // vodContainer.create();
    } else if (subDomain === 'play') {
        liveContainer.create();
    }
}
const liveContainer = new BaseContainer(
    'soop', 
    new SoopChatExtractor('soop'), 
    new Handle('soop'), 
    '#chat_area',
);

// const vodContainer = new BaseContainer(
//     'chzzk',
//     new SoopChatExtractor('chzzk'),
//     new Handle('chzzk', '#tbc-chzzk-chat-list-container'),
//     '.vod_chatting_list__+LZHw',
//     '.pzp-pc__video video.webplayer-internal-video',
//     '#tbc-clone__chzzkui',
// )

init()

addHistoryStateListener('chzzk.naver.com', init);
