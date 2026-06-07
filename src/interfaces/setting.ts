export interface SettingInterface {
    position: 'up' | 'down';
    pointBoxAuto: 'on' | 'off';
    darkTheme: 'system' | 'light' | 'dark';
    chatTime: 'on' | 'off';
    maximumNumberChats: number;
    advancedFilter: 'on' | 'off';
    platform: 'twitch' | 'chzzk';
    /** 호스트 채팅창에서 수집된 채팅 좌측에 마커 표시할지. default 'on'. */
    collectedChatMarker: 'on' | 'off';
}

export interface SettingReducerActionTypes {
    SET_POSITION: "SET_POSITION";
    SET_POINT_BOX_AUTO: "SET_POINT_BOX_AUTO";
    SET_DARK_THEME: "SET_DARK_THEME";
    SET_CHAT_TIME: "SET_CHAT_TIME";
    SET_MAXIMUM_NUMBER_CHATS: "SET_MAXIMUM_NUMBER_CHATS";
    SET_ADVANCED_FILTER: "SET_ADVANCED_FILTER";
    SET_PLATFORM: "SET_PLATFORM";
    SET_COLLECTED_CHAT_MARKER: "SET_COLLECTED_CHAT_MARKER";
    SET_MULTIPLE: "SET_MULTIPLE";
}

export interface SettingReducerAction {
    type: SettingReducerActionTypes[keyof SettingReducerActionTypes];
    payload?: any;
}

export type SettingRecord = Record<keyof SettingInterface, SettingInterface[keyof SettingInterface]>;