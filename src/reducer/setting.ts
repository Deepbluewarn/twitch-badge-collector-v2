import { SettingInterface, SettingReducerAction, SettingReducerActionTypes } from "@/interfaces/setting";

/**
 * 모아보기 창 채팅 최대 개수 기본값. 예전엔 .env(VITE_MAXNUMCHATS_DEFAULT)에서 읽었는데, .env는 git에 없어
 * 스토어용 빌드(GitHub Actions)에선 undefined였다. 그러면 저장소에 기본값이 안 들어가 설정 칸이 비고,
 * 모아보기 창이 채팅을 하나도 버리지 않고 끝없이 쌓았다.
 */
export const DEFAULT_MAX_CHATS = 100;

/**
 * 그 시절 스토어 빌드(v2.18.x ~ v2.25.1) 사용자의 값. 사실상 무제한으로 쓰다가 갑자기 100개로 잘리면 놀라므로,
 * 채팅 유지 저장 한도(채널당 1MB, 약 1000개)와 맞춘 넉넉한 값을 넣는다.
 */
export const LEGACY_MAX_CHATS = 1000;

/**
 * 최대 개수가 비어 있을 때 채울 값. 다른 설정이 이미 저장돼 있으면 그 시절 스토어 빌드 사용자라
 * LEGACY_MAX_CHATS(다른 기본값은 코드에 적혀 있어 정상으로 들어갔다), 아무것도 없으면 새 설치라 DEFAULT_MAX_CHATS.
 */
export function missingMaxChats(stored: Record<string, unknown>): number {
    const existing = Object.entries(stored).some(([k, v]) => k !== 'maximumNumberChats' && v !== undefined && v !== null);
    return existing ? LEGACY_MAX_CHATS : DEFAULT_MAX_CHATS;
}

/** 저장값을 쓸 수 있는 개수로. 비어 있으면 그 시절 스토어 빌드 사용자 몫, 숫자가 아니거나 1보다 작으면 기본값. */
export function maxChatsOf(v: unknown): number {
    if (v === undefined || v === null) return LEGACY_MAX_CHATS;
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 1 ? n : DEFAULT_MAX_CHATS;
}

// 초기 상태 정의
export const initialState: SettingInterface = {
    position: "up",
    pointBoxAuto: 'on',
    darkTheme: 'system',
    chatTime: 'off',
    maximumNumberChats: DEFAULT_MAX_CHATS,
    advancedFilter: 'off',
    platform: "chzzk",
    collectedChatMarker: 'on',
    jumpToBottomButton: 'on',
    chatPersistence: 'on',
    displayMode: 'inline',
    floatingBgColor: '',
    chzzkChatSide: 'right',
    chzzkProfileCopyId: 'on',
    chzzkCustomTemplate: 'off',
    anonymousStats: 'on',
}

// 액션 타입 정의
const actionTypes: SettingReducerActionTypes = {
    SET_POSITION: "SET_POSITION",
    SET_POINT_BOX_AUTO: "SET_POINT_BOX_AUTO",
    SET_DARK_THEME: "SET_DARK_THEME",
    SET_CHAT_TIME: "SET_CHAT_TIME",
    SET_MAXIMUM_NUMBER_CHATS: "SET_MAXIMUM_NUMBER_CHATS",
    SET_ADVANCED_FILTER: "SET_ADVANCED_FILTER",
    SET_PLATFORM: "SET_PLATFORM",
    SET_COLLECTED_CHAT_MARKER: "SET_COLLECTED_CHAT_MARKER",
    SET_JUMP_TO_BOTTOM_BUTTON: "SET_JUMP_TO_BOTTOM_BUTTON",
    SET_CHAT_PERSISTENCE: "SET_CHAT_PERSISTENCE",
    SET_DISPLAY_MODE: "SET_DISPLAY_MODE",
    SET_FLOATING_BG_COLOR: "SET_FLOATING_BG_COLOR",
    SET_CHZZK_CHAT_SIDE: "SET_CHZZK_CHAT_SIDE",
    SET_CHZZK_PROFILE_COPY_ID: "SET_CHZZK_PROFILE_COPY_ID",
    SET_CHZZK_CUSTOM_TEMPLATE: "SET_CHZZK_CUSTOM_TEMPLATE",
    SET_ANONYMOUS_STATS: "SET_ANONYMOUS_STATS",
    SET_MULTIPLE: "SET_MULTIPLE"
};

// 리듀서 함수 정의
function settingsReducer(state: SettingInterface = initialState, action: SettingReducerAction): SettingInterface {
    switch (action.type) {
        case actionTypes.SET_POSITION:
            return { ...state, position: action.payload || "up" };
        case actionTypes.SET_POINT_BOX_AUTO:
            return { ...state, pointBoxAuto: action.payload || true };
        case actionTypes.SET_DARK_THEME:
            return { ...state, darkTheme: action.payload || false };
        case actionTypes.SET_CHAT_TIME:
            return { ...state, chatTime: action.payload || false };
        case actionTypes.SET_MAXIMUM_NUMBER_CHATS:
            return { ...state, maximumNumberChats: maxChatsOf(action.payload) };
        case actionTypes.SET_ADVANCED_FILTER:
            return { ...state, advancedFilter: action.payload || false };
        case actionTypes.SET_PLATFORM:
            return { ...state, platform: action.payload || "chzzk" };
        case actionTypes.SET_COLLECTED_CHAT_MARKER:
            return { ...state, collectedChatMarker: action.payload || 'on' };
        case actionTypes.SET_JUMP_TO_BOTTOM_BUTTON:
            return { ...state, jumpToBottomButton: action.payload || 'on' };
        case actionTypes.SET_CHAT_PERSISTENCE:
            return { ...state, chatPersistence: action.payload || 'on' };
        case actionTypes.SET_DISPLAY_MODE:
            return { ...state, displayMode: action.payload || 'inline' };
        case actionTypes.SET_FLOATING_BG_COLOR:
            return { ...state, floatingBgColor: action.payload ?? '' };
        case actionTypes.SET_CHZZK_CHAT_SIDE:
            // 'left'만 명시적으로 받는다. 오타/undefined는 치지직 기본 배치로.
            return { ...state, chzzkChatSide: action.payload === 'left' ? 'left' : 'right' };
        case actionTypes.SET_CHZZK_PROFILE_COPY_ID:
            // 'off'만 명시적으로 받는다. 끈 사람만 버튼을 안 붙인다.
            return { ...state, chzzkProfileCopyId: action.payload === 'off' ? 'off' : 'on' };
        case actionTypes.SET_CHZZK_CUSTOM_TEMPLATE:
            // 'on'만 명시적으로 받는다. 오타/undefined는 원본 우선(off)으로.
            return { ...state, chzzkCustomTemplate: action.payload === 'on' ? 'on' : 'off' };
        case actionTypes.SET_ANONYMOUS_STATS:
            // 'off'만 명시적으로 받는다. 끈 사람만 안 보낸다.
            return { ...state, anonymousStats: action.payload === 'off' ? 'off' : 'on' };
        case actionTypes.SET_MULTIPLE: // 새로운 액션 타입 처리
            return { ...state, ...action.payload };
        default:
            return state;
    }
}

// 액션 생성자 함수
const setPosition = (position: SettingInterface['position']) => ({ type: actionTypes.SET_POSITION, payload: position });
const setPointBoxAuto = (pointBoxAuto: SettingInterface['pointBoxAuto']) => ({ type: actionTypes.SET_POINT_BOX_AUTO, payload: pointBoxAuto });
const setDarkTheme = (darkTheme: SettingInterface['darkTheme']) => ({ type: actionTypes.SET_DARK_THEME, payload: darkTheme });
const setChatTime = (chatTime: SettingInterface['chatTime']) => ({ type: actionTypes.SET_CHAT_TIME, payload: chatTime });
const setMaximumNumberChats = (maximumNumberChats: SettingInterface['maximumNumberChats']) => ({ type: actionTypes.SET_MAXIMUM_NUMBER_CHATS, payload: maximumNumberChats });
const setAdvancedFilter = (advancedFilter: SettingInterface['advancedFilter']) => ({ type: actionTypes.SET_ADVANCED_FILTER, payload: advancedFilter });
const setPlatform = (platform: SettingInterface['platform']) => ({ type: actionTypes.SET_PLATFORM, payload: platform });
const setCollectedChatMarker = (collectedChatMarker: SettingInterface['collectedChatMarker']) => ({ type: actionTypes.SET_COLLECTED_CHAT_MARKER, payload: collectedChatMarker });
const setJumpToBottomButton = (jumpToBottomButton: SettingInterface['jumpToBottomButton']) => ({ type: actionTypes.SET_JUMP_TO_BOTTOM_BUTTON, payload: jumpToBottomButton });
const setChatPersistence = (chatPersistence: SettingInterface['chatPersistence']) => ({ type: actionTypes.SET_CHAT_PERSISTENCE, payload: chatPersistence });
const setDisplayMode = (displayMode: SettingInterface['displayMode']) => ({ type: actionTypes.SET_DISPLAY_MODE, payload: displayMode });
const setFloatingBgColor = (floatingBgColor: SettingInterface['floatingBgColor']) => ({ type: actionTypes.SET_FLOATING_BG_COLOR, payload: floatingBgColor });
const setChzzkChatSide = (chzzkChatSide: SettingInterface['chzzkChatSide']) => ({ type: actionTypes.SET_CHZZK_CHAT_SIDE, payload: chzzkChatSide });
const setChzzkProfileCopyId = (v: SettingInterface['chzzkProfileCopyId']) => ({ type: actionTypes.SET_CHZZK_PROFILE_COPY_ID, payload: v });
const setChzzkCustomTemplate = (v: SettingInterface['chzzkCustomTemplate']) => ({ type: actionTypes.SET_CHZZK_CUSTOM_TEMPLATE, payload: v });
const setAnonymousStats = (v: SettingInterface['anonymousStats']) => ({ type: actionTypes.SET_ANONYMOUS_STATS, payload: v });
const setMultipleSettings = (settings: SettingInterface) => ({ type: actionTypes.SET_MULTIPLE, payload: settings });

export {
    settingsReducer,
    setPosition,
    setPointBoxAuto,
    setDarkTheme,
    setChatTime,
    setMaximumNumberChats,
    setAdvancedFilter,
    setPlatform,
    setCollectedChatMarker,
    setJumpToBottomButton,
    setChatPersistence,
    setDisplayMode,
    setFloatingBgColor,
    setChzzkChatSide,
    setChzzkProfileCopyId,
    setChzzkCustomTemplate,
    setAnonymousStats,
    setMultipleSettings,
};