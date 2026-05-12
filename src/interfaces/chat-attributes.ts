/**
 * Inject 스크립트가 host page 채팅 DOM 노드에 박는 data-* 속성들의 정식 이름.
 *
 * 두 쪽이 같이 읽고 써야 동작:
 *   - 쓰는 쪽: src/content-scripts/{twitch,chzzk}/inject.ts
 *   - 읽는 쪽: src/platform/{twitch,chzzk}.ts (Adapter.extract / prepareChatClone),
 *             src/hooks/useChatStream.ts (key, time)
 *
 * 두 쪽 모두 이 상수를 참조하면 컴파일 타임에 sync가 보장됨 — attribute 이름을
 * 바꾸면 양쪽이 함께 깨지므로 silent fail이 사라짐.
 */
export const CHAT_ATTR = {
    /** 중복 제거용 안정 키 (Twitch: message.id, Chzzk: chatMessage.key) */
    KEY: 'data-tbc-chat-key',
    /** 채팅 발생 시각 (ms epoch 또는 replay 상대 시간) */
    TIME: 'data-tbc-chat-time',
    /** JSON.stringified 배지 식별자 배열 */
    BADGES: 'data-tbc-chat-badges',
    /** Twitch 전용: 채널 login (구독 배지 채널 스코프용) */
    CHANNEL: 'data-tbc-chat-channel',
    /** Twitch 전용: 채널 id (구독 배지 채널 스코프용 — VOD 케이스) */
    CHANNEL_ID: 'data-tbc-chat-channel-id',
    /** Chzzk 전용: 다시보기 채팅 여부 (truthy 문자열) */
    REPLAY_CHAT: 'data-tbc-chat-replay-chat',
} as const;

/**
 * 이미 Container로 흘려보낸 노드를 표시하는 클래스.
 * useChatStream이 add/check해서 같은 노드의 중복 처리를 방지.
 */
export const PROCESSED_CHAT_CLASS = 'tbcv2-highlight';

/**
 * inject.ts(MAIN world)가 host DOM mutation을 처리한 뒤 ISOLATED로 송신하는 메시지.
 * 같은 host mutation에 대해 MAIN과 ISOLATED MO가 독립적으로 콜백되어 race 가능 →
 * inject.ts에서 CHAT_ATTR.KEY 세팅 + prevKey 계산까지 모두 마친 후 발행. ISOLATED는
 * MO 대신 이 메시지를 듣고 DOM에서 element를 querySelector로 찾아 처리.
 */
export const TBC_CHAT_PASSED_ACTION = 'tbc-chat-passed';

export interface TbcChatPassedMessage {
    action: typeof TBC_CHAT_PASSED_ACTION;
    /** CHAT_ATTR.KEY 값 (chzzk: chatMessage.key, twitch: message.id) */
    key: string;
    /** ms epoch 또는 replay 상대 시간. twitch는 0. */
    time: number;
    /** host DOM 직전 chat sibling의 key. 같은 inject.ts 동기 컨텍스트에서 추출되어 race 없음. */
    prevKey: string | null;
    /** chat element의 outerHTML. ISOLATED가 host DOM lookup 없이 직접 파싱.
     *  chzzk가 virtual window로 element를 unmount할 수 있어 key-by-querySelector 신뢰 불가. */
    html: string;
}
