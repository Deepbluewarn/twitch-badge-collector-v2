import Setting, {
  ChatDisplayMethodOptionType,
  ToggleOptionType,
  FontSizeOptionType,
  LanguageOptionType,
  PositionOptionType,
  ReducerAction,
} from "../interfaces/setting";

export function settingReducer(state: Setting, action: ReducerAction): Setting {
  const copyState = { ...state };

  switch (action.type) {
    case "chatDisplayMethod":
      copyState.chatDisplayMethod = action.value as ChatDisplayMethodOptionType;
      return copyState;
    case "position":
      copyState.position = action.value as PositionOptionType;
      return copyState;
    case "pointBoxAuto":
      copyState.autoPointClick = action.value as ToggleOptionType;
      return copyState;
    case "miniLanguage":
      copyState.miniLanguage = action.value as LanguageOptionType;
      return copyState;
    case "miniFontSize":
      copyState.miniFontSize = action.value as FontSizeOptionType;
      return copyState;
    case "miniChatTime":
      copyState.miniChatTime = action.value as ToggleOptionType;
      return copyState;
    case "darkTheme":
      copyState.darkTheme = action.value as ToggleOptionType;
      return copyState;
    case "chatTime":
      copyState.chatTime = action.value as ToggleOptionType;
      return copyState;
    default:
      throw new Error("Unhandled action");
  }
}