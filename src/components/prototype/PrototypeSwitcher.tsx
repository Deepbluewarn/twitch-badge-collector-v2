/**
 * PROTOTYPE — 테마 시안 전환. 개발 빌드(`npm run dev`)에서만 쓴다. 결정 후 제거.
 *
 * '0' = 지금 테마, 'A' = 배지 사이트 테마. 화면 구조는 그대로고 MUI 테마만 바뀐다.
 * 선택은 localStorage에 기억해 팝업과 설정 페이지가 같이 따른다. `?variant=` · `?theme=light|dark`로 덮어쓸 수 있다
 * (팝업 미리보기 페이지가 iframe마다 다르게 띄울 때 쓴다).
 */
import React, { useEffect, useState } from 'react';
import { useCustomTheme } from '@/hooks/useCustomTheme';
import { useSiteTheme } from './siteTheme';
import type { CustomTheme } from '@/interfaces/ThemeInterface';

export const PROTOTYPE_ENABLED = import.meta.env.MODE === 'development';

/** 지금 고른 시안('0' | 'A') — 테마 말고도 화면 일부(필터 목록)가 시안을 따를 때. */
export const ProtoVariantContext = React.createContext<string>('0');

// '0' = 지금 화면 그대로. A~D = 배지 사이트 테마 + 필터 표 시안 (테마는 같고 표 모양만 다르다).
const KEYS = ['0', 'A', 'B', 'C', 'D', 'F'] as const;
const NAMES: Record<string, string> = { '0': '지금', A: '표 · 문장 목록', B: '표 · 타일', C: '표 · 조건별 묶음', D: '표 · 촘촘한 한 줄', F: 'D + 사이트 내용물' };
const STORAGE_KEY = 'tbc-proto-theme-variant';

function readVariant(): string {
    const fromUrl = new URLSearchParams(location.search).get('variant');
    if (fromUrl && (KEYS as readonly string[]).includes(fromUrl)) return fromUrl;
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved && (KEYS as readonly string[]).includes(saved) ? saved : 'A';
    } catch { return 'A'; }
}

/** 지금 테마 또는 시안 테마. 훅 순서를 지키려고 둘 다 만든다. */
export function useThemeVariant(isDark: boolean): { theme: CustomTheme; variant: string; setVariant: (v: string) => void } {
    const [variant, setVariantState] = useState(readVariant);
    const forced = new URLSearchParams(location.search).get('theme');
    const dark = forced === 'dark' ? true : forced === 'light' ? false : isDark;
    const legacy = useCustomTheme(dark);
    const site = useSiteTheme(dark);
    const setVariant = (v: string) => {
        setVariantState(v);
        try { localStorage.setItem(STORAGE_KEY, v); } catch { /* 없어도 된다 */ }
    };
    // 다른 탭(팝업·설정)에서 바꾸면 따라간다.
    useEffect(() => {
        const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY && !new URLSearchParams(location.search).get('variant')) setVariantState(readVariant()); };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);
    return { theme: PROTOTYPE_ENABLED && variant !== '0' ? site : legacy, variant, setVariant };
}

export function PrototypeSwitcher({ current, onChange }: { current: string; onChange: (v: string) => void }) {
    const step = (d: number) => onChange(KEYS[(KEYS.indexOf(current as typeof KEYS[number]) + d + KEYS.length) % KEYS.length]);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const el = document.activeElement as HTMLElement | null;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
            if (e.key === 'ArrowLeft') step(-1);
            if (e.key === 'ArrowRight') step(1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });
    const btn: React.CSSProperties = { width: 26, height: 26, borderRadius: '50%', border: 0, background: 'rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', font: 'inherit' };
    return (
        <div role="toolbar" aria-label="prototype variants" style={{
            position: 'fixed', left: '50%', bottom: 10, transform: 'translateX(-50%)', zIndex: 2147483647,
            display: 'flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 999, background: '#ff2d87', color: '#fff',
            font: '700 12px/1 system-ui, sans-serif', boxShadow: '0 4px 16px rgba(0,0,0,0.35)', whiteSpace: 'nowrap',
        }}>
            <button style={btn} onClick={() => step(-1)} aria-label="previous">←</button>
            <span style={{ padding: '0 8px' }}>{current} · {NAMES[current]}</span>
            <button style={btn} onClick={() => step(1)} aria-label="next">→</button>
        </div>
    );
}

/**
 * 팝업 미리보기 — 진짜 popup.html을 iframe으로 (팝업은 포커스를 잃으면 닫혀서). 지금/시안 × 밝게/어둡게.
 * iframe 안에서 클릭해 "일반 설정"으로 들어가 볼 수 있다.
 */
export function PopupPreviewPage() {
    const cell = (variant: string, theme: 'light' | 'dark') => (
        <div key={variant + theme}>
            <div style={{ fontWeight: 800, margin: '0 0 6px', fontSize: 14 }}>{variant === '0' ? '지금 테마' : '배지 사이트 테마'} · {theme === 'light' ? '밝게' : '어둡게'}</div>
            <iframe
                title={`${variant}-${theme}`}
                src={browser.runtime.getURL(`/popup.html?variant=${variant}&theme=${theme}` as any)}
                style={{ width: 352, height: 600, border: '1px solid #8886', borderRadius: 8, background: theme === 'dark' ? '#111' : '#fff' }}
            />
        </div>
    );
    return (
        <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
            <h2 style={{ margin: '0 0 16px' }}>팝업 미리보기 (프로토타입)</h2>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {cell('0', 'light')}{cell('A', 'light')}{cell('0', 'dark')}{cell('A', 'dark')}
            </div>
        </div>
    );
}
