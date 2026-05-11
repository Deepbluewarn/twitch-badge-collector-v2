import { lightGreen, red, grey } from '@mui/material/colors';
import { createTheme } from '@mui/material/styles';
import { CustomTheme } from '../interfaces/ThemeInterface';

export function useCustomTheme(theme: boolean): CustomTheme {

    const baseTheme = createTheme({
        palette: theme ? {
            // dark — 무채색 grey 대신 살짝 cool tint(blue 쪽). paper(elevated surface)는 default보다
            // 명확히 한 단계 밝게 — 모달/카드의 위계 가시성 확보.
            mode: 'dark',
            background: { default: '#0f1014', paper: '#1d1f26' },
            primary: { main: '#7c8aef', light: '#a5afff', dark: '#5b6acb', contrastText: '#0a0a10' },
            secondary: { main: '#b07ce6' },
            text: { primary: '#e6e8ee', secondary: '#9296a3', disabled: '#6a6e7a' },
            divider: 'rgba(255, 255, 255, 0.09)',
            action: {
                hover: 'rgba(255, 255, 255, 0.06)',
                selected: 'rgba(124, 138, 239, 0.16)',
                active: 'rgba(255, 255, 255, 0.7)',
            },
        } : {
            // light — 약간 cool grey base, paper는 순백.
            // 텍스트/primary 색을 충분히 진하게 — 이전엔 contrast 부족해서 흐릿했음.
            mode: 'light',
            background: { default: '#fafbfd', paper: '#ffffff' },
            primary: { main: '#3f4ba8', light: '#5b6acb', dark: '#2c357a', contrastText: '#ffffff' },
            secondary: { main: '#6b3eb1' },
            text: { primary: '#0f1014', secondary: '#3d4250', disabled: '#7a8090' },
            divider: 'rgba(15, 16, 20, 0.14)',
            action: {
                hover: 'rgba(15, 16, 20, 0.06)',
                selected: 'rgba(63, 75, 168, 0.12)',
                active: 'rgba(15, 16, 20, 0.7)',
            },
        },
        // 모서리 부드럽게 — 기본 4 → 8. Card/Button/Chip/Input 등 전반에 통일 적용.
        shape: {
            borderRadius: 8,
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


