export const chatDisplayMethodOptions = ["local", "remote"];
export const positionOptions = ["up", "down"];
export const fontSizeOptions = ["small", "default", "big", "bigger"];
export const languageOptions = ["ko", "en"];
export const themeOptions = ["dark", "light", "auto"];
export const toggleOptions = ["on", "off"];

export type ChatDisplayMethodOptionType =
  typeof chatDisplayMethodOptions[number];
export type PositionOptionType = typeof positionOptions[number];
export type FontSizeOptionType = typeof fontSizeOptions[number];
export type LanguageOptionType = typeof languageOptions[number];
export type ThemeOptionType = typeof themeOptions[number];
export type ToggleOptionType = typeof toggleOptions[number];

export type SettingOptions =
  | ChatDisplayMethodOptionType
  | PositionOptionType
  | FontSizeOptionType
  | LanguageOptionType
  | ThemeOptionType
  | ToggleOptionType
  | number;

export type SettingCategory =
  | "chatDisplayMethod"
  | "position"
  | "ratio"
  | "pointBoxAuto"
  | "miniTheme"
  | "miniLanguage"
  | "miniFontSize"
  | "miniChatTime";

export interface ReducerAction {
  type: SettingCategory;
  value: SettingOptions;
}

export default interface Setting {
  [index: string]: string | number;
  chatDisplayMethod: ChatDisplayMethodOptionType;
  position: PositionOptionType;
  pointBoxAuto: ToggleOptionType;
  miniChatTime: ToggleOptionType;
  miniTheme: ThemeOptionType;
  miniLanguage: LanguageOptionType;
  miniFontSize: FontSizeOptionType;
}
