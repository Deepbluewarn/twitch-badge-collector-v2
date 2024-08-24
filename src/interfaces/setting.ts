export interface SettingInterface {
    position: 'up' | 'down';
    pointBoxAuto: 'on' | 'off';
    darkTheme: 'on' | 'off';
    chatTime: 'on' | 'off';
    maximumNumberChats: number;
    advancedFilter: 'on' | 'off';
    platform: 'twitch' | 'chzzk';
}

export interface SettingReducerActionTypes {
    SET_POSITION: "SET_POSITION";
    SET_POINT_BOX_AUTO: "SET_POINT_BOX_AUTO";
    SET_DARK_THEME: "SET_DARK_THEME";
    SET_CHAT_TIME: "SET_CHAT_TIME";
    SET_MAXIMUM_NUMBER_CHATS: "SET_MAXIMUM_NUMBER_CHATS";
    SET_ADVANCED_FILTER: "SET_ADVANCED_FILTER";
    SET_PLATFORM: "SET_PLATFORM";
    SET_MULTIPLE: "SET_MULTIPLE";
}

export interface SettingReducerAction {
    type: SettingReducerActionTypes[keyof SettingReducerActionTypes];
    payload?: any;
}

export type SettingRecord = Record<keyof SettingInterface, SettingInterface[keyof SettingInterface]>;