/** 원본 채팅 → 필터 시험 (우클릭 메뉴). content-scripts/base/chat-pick.ts · background · FilterGroupList가 같이 쓴다. */
export const CHAT_PICK_TAKE = 'tbc-chat-pick-take';
export const CHAT_PICK_HAS = 'tbc-chat-pick-has';
export const CHAT_PICK_MENU_ID = 'tbc-filter-test';
/** background가 넣고 설정 페이지가 꺼내 가는 storage.local 키 */
export const CHAT_PICK_PENDING_KEY = 'pendingFilterTest';

export interface ChatPick {
    platform: 'twitch' | 'chzzk';
    nickname: string;
    message: string;
    badges: { url: string; name: string }[];
    channelId?: string;
}
