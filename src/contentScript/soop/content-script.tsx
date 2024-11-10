import { ChatInfo } from "@interfaces/chat";
import { ChatExtractor } from "../base/chatExtractor";
import { BaseContainer } from "../base/container";
import { Handle } from "../base/handler";
import { addHistoryStateListener } from "../base/historyStateListener";

export class SoopChatExtractor extends ChatExtractor {
    extract(node: Node): ChatInfo | undefined {
        if (!this.prep(node)) return;

        const chat_clone = node.cloneNode(true) as Element;

        const badgeArr = Array.from(chat_clone.querySelectorAll('[class*=grade-badge-]')).map(e => {
            const c = Array.from(e.classList).filter(c => c.includes('grade-badge-'))[0];
            return c.replace('grade-badge-', '');
        })

        const text = chat_clone.getElementsByClassName('msg')[0]?.textContent;
        const name = chat_clone.getElementsByClassName('author')[0]?.textContent;

        return {
            badges: badgeArr,
            textContents: [text ?? ''],
            loginName: name,
            nickName: name,
        } as ChatInfo;
    }
}
function init() {
    const subDomain = location.hostname.split('.')[0]
    
    if (subDomain === 'vod') {
        vodContainer.create();
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

const vodContainer = new BaseContainer(
    'soop',
    new SoopChatExtractor('soop'), 
    new Handle('soop'), 
    '.chatting-viewer',
    '#videoLayer .af_video',
    '#tbc-clone__soopui',
)

init()

addHistoryStateListener('chzzk.naver.com', init);
