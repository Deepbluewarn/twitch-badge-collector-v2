import { SettingInterface, SettingReducerAction, SettingReducerActionTypes } from "@interfaces/setting";

// 초기 상태 정의
export const initialState: SettingInterface = {
    position: "up",
    pointBoxAuto: 'on',
    darkTheme: 'off',
    chatTime: 'off',
    maximumNumberChats: (import.meta.env.VITE_MAXNUMCHATS_DEFAULT as unknown) as number,
    advancedFilter: 'off',
    platform: "twitch",
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
    SET_MULTIPLE: "SET_MULTIPLE"
};

// 리듀서 함수 정의
function settingsReducer(state = initialState, action: SettingReducerAction) {
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
            return { ...state, platform: action.payload || "twitch" };
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
    setMultipleSettings,
};