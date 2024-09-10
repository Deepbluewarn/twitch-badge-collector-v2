import { Theme } from '@mui/material/styles';
export type Modify<T, R> = Omit<T, keyof R> & R;

export type CustomTheme = Modify<
  Theme,
  {
    colors: {
        textColor_1: string,
        textColor_2: string,
        textColorInverted: string,

        bgColor_1: string,
        bgColor_2: string,
        bgColor_3: string,
        remoteBgColor: string,

        filterIncludeTypeColor: string,
        filterExcludeTypeColor: string,
        filterSleepTypeColor: string,

        highlightColor: string,
        buttonColor: string,
        buttonDisabledBgColor: string,

        scrollbarBgColor: string,
        modalBgColor: string,
        borderColor: string
    },
  }
>;