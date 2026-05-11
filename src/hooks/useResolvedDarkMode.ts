import useMediaQuery from '@mui/material/useMediaQuery';
import { SettingInterface } from '@/interfaces/setting';

/**
 * darkTheme 설정값을 실제 boolean 다크 여부로 해석.
 * - 'dark' | (legacy 'on') → true
 * - 'light' | (legacy 'off') → false
 * - 'system' | undefined → OS prefers-color-scheme 따라감
 */
export function useResolvedDarkMode(mode: SettingInterface['darkTheme'] | string | undefined): boolean {
    const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
    if (mode === 'dark' || mode === 'on') return true;
    if (mode === 'light' || mode === 'off') return false;
    return prefersDark;
}
