import { SettingInterface, SettingReducerAction, SettingReducerActionTypes } from "@/interfaces/setting";

// 초기 상태 정의
export const initialState: SettingInterface = {
    position: "up",
    pointBoxAuto: 'on',
    darkTheme: 'system',
    chatTime: 'off',
    maximumNumberChats: (import.meta.env.VITE_MAXNUMCHATS_DEFAULT as unknown) as number,
    advancedFilter: 'off',
    platform: "chzzk",
    collectedChatMarker: 'on',
    jumpToBottomButton: 'on',
    chatPersistence: 'on',
    displayMode: 'inline',
    floatingBgColor: '',
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
            return { ...state, maximumNumberChats: action.payload || (import.meta.env.VITE_MAXNUMCHATS_DEFAULT as unknown) as number };
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
    setMultipleSettings,
};