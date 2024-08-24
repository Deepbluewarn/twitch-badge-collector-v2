import { lightGreen, red, grey } from '@mui/material/colors';
import { createTheme } from '@mui/material/styles';
import { CustomTheme } from '../interfaces/ThemeInterface';

export function useCustomTheme(theme: boolean): CustomTheme {

    const baseTheme = createTheme({
        palette: {
            mode: theme ? 'dark' : 'light',
        },
        typography: {
            fontFamily: [
                'Pretendard Variable',
                '-apple-system',
                'BlinkMacSystemFont',
                'system-ui',
                'Roboto',
                'Helvetica Neue',
                'Segoe UI',
                'Apple SD Gothic Neo',
                'Noto Sans KR',
                'Malgun Gothic',
                'sans-serif',
            ].join(',')
        },
    });

    return {
        ...baseTheme,
        colors: theme ? {
            textColor_1: '#ececec',
            textColor_2: '#d3d3d3',
            textColorInverted: '#000000',

            bgColor_1: '#121212',
            bgColor_2: '#1e1e1e',
            bgColor_3: '#343434',
            remoteBgColor: '#18181b',

            filterIncludeTypeColor: lightGreen[500],
            filterExcludeTypeColor: red[500],
            filterSleepTypeColor: grey[400],

            highlightColor: '#ffc107',
            buttonColor: '#000000',
            buttonDisabledBgColor: '#fffafa',

            scrollbarBgColor: '#343434',
            modalBgColor: '#00000044',
            borderColor: grey[800]
        } : {
            textColor_1: '#000000',
            textColor_2: '#2e2e2e',
            textColorInverted: '#ececec',

            bgColor_1: '#ffffff',
            bgColor_2: '#f7f7f8',
            bgColor_3: '#e5e5e5',
            remoteBgColor: '#ffffff',

            filterIncludeTypeColor: lightGreen[500],
            filterExcludeTypeColor: red[500],
            filterSleepTypeColor: grey[400],

            highlightColor: '#ffc107',
            buttonColor: '#000000',
            buttonDisabledBgColor: '#fffafa',

            scrollbarBgColor: '#b3b3b3',
            modalBgColor: '#00000044',
            borderColor: grey[300],
        }
    };
}


