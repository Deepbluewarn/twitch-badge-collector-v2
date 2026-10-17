import { useEffect, useState } from 'react';
import { SettingInterface } from '@/interfaces/setting';

const QUERY = '(prefers-color-scheme: dark)';

function usePrefersDark(): boolean {
    const [dark, setDark] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(QUERY).matches);
    useEffect(() => {
        if (typeof matchMedia === 'undefined') return;
        const mq = matchMedia(QUERY);
        const onChange = () => setDark(mq.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);
    return dark;
}

/**
 * darkTheme 설정값을 실제 boolean 다크 여부로 해석.
 * - 'dark' | (legacy 'on') → true
 * - 'light' | (legacy 'off') → false
 * - 'system' | undefined → OS prefers-color-scheme 따라감
 */
export function useResolvedDarkMode(mode: SettingInterface['darkTheme'] | string | undefined): boolean {
    const prefersDark = usePrefersDark();
    if (mode === 'dark' || mode === 'on') return true;
    if (mode === 'light' || mode === 'off') return false;
    return prefersDark;
}
