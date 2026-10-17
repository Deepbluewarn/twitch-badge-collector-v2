/**
 * PROTOTYPE — 배지 사이트(badgecollector.dev) 디자인을 MUI 테마로. 팝업·설정 페이지의 구조는 그대로 두고
 * 테마만 갈아 끼워 비교한다 (`?variant=A`). 채택되면 useCustomTheme에 제대로 옮긴다.
 *
 * 사이트 규칙: 흰 종이 + 형광펜 노랑 + 검정 잉크. 그림자·그라데이션 대신 굵은 선(2px)과 노란 면.
 * 다크: 반전하면 흰 굵은 선이 거칠다 — 따뜻한 검정 + 크림 글자, 테두리는 낮춘 크림, 노란 면 위 글자는 검정.
 */
import { createTheme, alpha } from '@mui/material/styles';
import type { CustomTheme } from '@/interfaces/ThemeInterface';
import { useCustomTheme } from '@/hooks/useCustomTheme';

const YELLOW = '#ffd60a';
const ON_YELLOW = '#111111';

export function useSiteTheme(dark: boolean): CustomTheme {
    const legacy = useCustomTheme(dark);   // colors(확장 고유 키)는 그대로 쓴다
    const t = dark
        ? { paper: '#161512', ink: '#f4f1e6', line: '#6a665a', hair: '#2c2a25', tint: '#23211c', muted: '#a19d90', soft: '#3b3413' }
        : { paper: '#ffffff', ink: '#111111', line: '#111111', hair: '#e7e5df', tint: '#f5f4ef', muted: '#6b6a66', soft: '#fff6c2' };
    const border = `2px solid ${t.line}`;

    const base = createTheme({
        palette: {
            mode: dark ? 'dark' : 'light',
            primary: { main: YELLOW, dark: '#e6bf00', light: '#ffe45c', contrastText: ON_YELLOW },
            secondary: { main: t.ink, contrastText: t.paper },
            background: { default: t.paper, paper: t.paper },   // 사이트처럼 흰 종이 그대로
            text: { primary: t.ink, secondary: t.muted, disabled: alpha(t.ink, 0.38) },
            divider: t.hair,
            success: { main: '#1fa463' },
            error: { main: '#e5484d' },
            action: { hover: t.soft, selected: alpha(YELLOW, dark ? 0.22 : 0.3), active: t.ink },
        },
        shape: { borderRadius: 8 },
        shadows: Array(25).fill('none') as CustomTheme['shadows'],
        typography: {
            // 페이지 body(style/global)와 같은 순서 — Pretendard를 못 받았을 때 MUI 글자와 직접 그린 글자가 다른 대체 글꼴로 갈리지 않게.
            fontFamily: ['Pretendard Variable', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'Roboto', 'Helvetica Neue', 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', 'sans-serif'].join(','),
            h6: { fontWeight: 900, letterSpacing: '-0.03em' },
            subtitle1: { fontWeight: 800, letterSpacing: '-0.02em' },
            subtitle2: { fontWeight: 800 },
            button: { fontWeight: 800, textTransform: 'none' },
        },
        components: {
            MuiButton: {
                defaultProps: { disableElevation: true },
                styleOverrides: {
                    root: { borderRadius: 8, fontWeight: 800 },
                    contained: {
                        border: `2px solid ${dark ? YELLOW : t.ink}`, background: YELLOW, color: ON_YELLOW,
                        '&:hover': { background: dark ? '#ffe45c' : t.ink, color: dark ? ON_YELLOW : YELLOW },
                    },
                    outlined: {
                        border, color: t.ink, '&:hover': { border, background: dark ? YELLOW : t.ink, color: dark ? ON_YELLOW : t.paper },
                    },
                    text: {
                        color: t.ink,
                        '&:hover': { background: 'transparent', textDecoration: 'underline', textDecorationColor: YELLOW, textDecorationThickness: 3, textUnderlineOffset: 3 },
                    },
                },
            },
            MuiIconButton: { styleOverrides: { root: { color: t.ink, '&:hover': { background: t.soft } } } },
            MuiToggleButtonGroup: {
                styleOverrides: {
                    // 그룹 테두리가 칸을 꽉 채우지 않게 (템플릿 페이지는 grid 칸 안에 둔다)
                    root: { border, borderRadius: 8, overflow: 'hidden', width: 'fit-content' },
                    grouped: { border: 0, borderRadius: 0, '&:not(:first-of-type)': { borderLeft: border, marginLeft: 0 } },
                },
            },
            MuiToggleButton: {
                styleOverrides: {
                    root: {
                        color: t.ink, fontWeight: 700, textTransform: 'none',
                        '&:hover': { background: t.soft },
                        '&.Mui-selected, &.Mui-selected:hover': { background: YELLOW, color: ON_YELLOW },
                    },
                },
            },
            MuiSwitch: {
                styleOverrides: {
                    root: { padding: 8 },
                    track: { borderRadius: 999, border, background: t.paper, opacity: 1, boxSizing: 'border-box' },
                    thumb: { background: dark ? t.muted : t.ink, width: 14, height: 14, margin: 3, boxShadow: 'none' },
                    switchBase: {
                        '&.Mui-checked': { color: ON_YELLOW },
                        '&.Mui-checked + .MuiSwitch-track': { background: YELLOW, opacity: 1, borderColor: dark ? YELLOW : t.line },
                        '&.Mui-checked .MuiSwitch-thumb': { background: ON_YELLOW },
                    },
                },
            },
            MuiTabs: {
                // Filter.tsx가 sx로 플랫폼 색(치지직 초록)을 넣는다 — 시안에선 노랑으로 덮는다.
                styleOverrides: { indicator: { height: 4, backgroundColor: `${YELLOW} !important` } },
            },
            MuiTab: {
                styleOverrides: { root: { textTransform: 'none', fontWeight: 800, fontSize: 15, color: t.muted, '&.Mui-selected': { color: t.ink } } },
            },
            // 외곽선이 겹치지 않게: 굵은 테두리는 가장 바깥 상자 하나만. 카드·대화상자 안의 카드는 테두리 없이 옅은 면으로
            // (배지 선택 칸도 사이트의 배지 타일처럼 보인다).
            MuiCard: {
                styleOverrides: {
                    root: {
                        border, borderRadius: 12, background: t.paper,
                        '.MuiCard-root &, .MuiDialog-paper &': { border: 0, background: t.tint },
                    },
                },
            },
            MuiPaper: { styleOverrides: { outlined: { border, '.MuiCard-root &, .MuiDialog-paper &': { border: 0 } } } },
            MuiDialog: { styleOverrides: { paper: { border, borderRadius: 14, backgroundImage: 'none' } } },
            // 그림자를 다 껐으니 떠 있는 것(팝업·메뉴)은 테두리로 띄운다.
            MuiPopover: { styleOverrides: { paper: { border, borderRadius: 10, backgroundImage: 'none' } } },
            MuiMenu: { styleOverrides: { paper: { border, borderRadius: 10, backgroundImage: 'none' } } },
            MuiOutlinedInput: {
                styleOverrides: {
                    root: {
                        '& .MuiOutlinedInput-notchedOutline': { border, borderColor: t.line },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: t.line },
                        '&.Mui-focused': { background: t.soft },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { border, borderColor: t.line },
                    },
                },
            },
            MuiInputLabel: { styleOverrides: { root: { '&.Mui-focused': { color: t.ink } } } },
            MuiChip: {
                styleOverrides: {
                    root: { fontWeight: 700, borderRadius: 999 },
                    outlined: { borderWidth: 1.5 },
                },
            },
            MuiCheckbox: { styleOverrides: { root: { color: t.line, '&.Mui-checked': { color: t.ink } } } },
            MuiAlert: { styleOverrides: { root: { border, borderRadius: 10 } } },
            MuiTooltip: { styleOverrides: { tooltip: { background: t.ink, color: t.paper, fontWeight: 700 } } },
            // x-data-grid는 themeAugmentation을 안 불러 왔으니 키만 맞춰 넣는다.
            ...({
                MuiDataGrid: {
                    styleOverrides: {
                        // 표는 카드 안에 있다 — 자기 테두리 없이 머리 아래 굵은 선 하나로만 나눈다.
                        // customDataGrid가 sx로 구분선 색을 넣어서 시안에선 !important로 덮는다.
                        root: { border: 0, borderRadius: 0, '--DataGrid-rowBorderColor': t.hair, '--DataGrid-containerBackground': t.paper },
                        columnHeaders: { borderBottom: `${border} !important` },
                        columnHeader: { borderColor: 'transparent !important' },
                        columnSeparator: { display: 'none' },
                        cell: { borderColor: `${t.hair} !important` },
                        columnHeaderTitle: { fontWeight: 800 },
                        row: { '&:hover': { background: t.soft }, '&.Mui-selected, &.Mui-selected:hover': { background: alpha(YELLOW, 0.25) } },
                        footerContainer: { borderTop: `1px solid ${t.hair}` },
                    },
                },
            } as object),
        },
    });

    return { ...base, colors: legacy.colors } as CustomTheme;
}
