import { Theme } from '@mui/material/styles';

interface CustomTheme {
  palette: {
    mode: 'dark' | 'light',
  },
  colors: {
    textColor_1: string;
    textColorInverted: string;
    textColor_2: string;

    bgColor_1: string;
    bgColor_2: string;
    bgColor_3: string;
    remoteBgColor: string;

    filterIncludeTypeColor: string;
    filterExcludeTypeColor: string;
    filterSleepTypeColor: string;

    highlightColor: string;
    buttonColor: string;
    buttonDisabledBgColor: string;

    scrollbarBgColor: string;
    modalBgColor: string;
    borderColor: string;
  },
}
declare module '@mui/material/styles' {
  interface Theme extends CustomTheme { }
  interface ThemeOptions extends CustomTheme { }
}