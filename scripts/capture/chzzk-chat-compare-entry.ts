// chzzk-chat-compare.ts가 esbuild로 묶어 치지직 페이지에 넣는 코드. 소켓을 엿들어 받은 채팅을
// 우리 렌더러로 그려 원본 옆에 세운다.
import { parseChzzkPacket, type ChzzkSocketChat } from '@/platform/chzzk-socket';
import { renderChzzkChat } from '@/render/chzzk-render';
import { TEMPLATE_SAMPLES } from '@/render/template-samples';

const chats: ChzzkSocketChat[] = [];
const Native = window.WebSocket;
window.WebSocket = class extends Native {
    constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        this.addEventListener('message', e => {
            try { chats.push(...parseChzzkPacket(JSON.parse(e.data))); } catch { /* 채팅 소켓이 아님 */ }
            if (chats.length > 500) chats.splice(0, chats.length - 500);
        });
    }
} as typeof WebSocket;

(window as unknown as Record<string, unknown>).__tbcRenderInto = (panel: HTMLElement, n: number, verifiedIconUrl?: string, samples = false) => {
    const list = samples
        ? Object.values(TEMPLATE_SAMPLES).flat().map(s => s.chat)
        : chats.slice(-n);
    panel.replaceChildren(...list.map(c => renderChzzkChat(c, { verifiedIconUrl })));
    return chats.length;
};
