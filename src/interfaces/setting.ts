export const chatDisplayMethodOptions = ["local", "remote"];
export const positionOptions = ["up", "down"];
export const fontSizeOptions = ["small", "default", "big", "bigger"];
export const languageOptions = ["ko", "en"];
export const toggleOptions = ["on", "off"];

export type ChatDisplayMethodOptionType =
  typeof chatDisplayMethodOptions[number];
export type PositionOptionType = typeof positionOptions[number];
export type FontSizeOptionType = typeof fontSizeOptions[number];
export type LanguageOptionType = typeof languageOptions[number];
export type ToggleOptionType = typeof toggleOptions[number];

export type SettingOptions =
  | ChatDisplayMethodOptionType
  | PositionOptionType
  | FontSizeOptionType
  | LanguageOptionType
  | ToggleOptionType
  | number;

export type SettingCategory =
  | "chatDisplayMethod"
  | "position"
  | "ratio"
  | "darkTheme"
  | "pointBoxAuto"
  | "chatTime"
  | "miniLanguage"
  | "miniFontSize"
  | "miniChatTime";

export interface ReducerAction {
  type: SettingCategory;
  value: SettingOptions;
}

export default interface Setting {
  [index: string]: SettingOptions;
  chatDisplayMethod: ChatDisplayMethodOptionType;
  darkTheme: ToggleOptionType;
  position: PositionOptionType;
  pointBoxAuto: ToggleOptionType;
  chatTime: ToggleOptionType;
  miniChatTime: ToggleOptionType;
  miniLanguage: LanguageOptionType;
  miniFontSize: FontSizeOptionType;
}
