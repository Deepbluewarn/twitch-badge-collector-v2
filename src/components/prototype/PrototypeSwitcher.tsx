/**
 * PROTOTYPE — 디자인 시안 전환 바. 개발 빌드(`npm run dev`)에서만 쓴다.
 *
 * 시안은 `?variant=` 로 고르고, 마지막 선택을 localStorage에 기억한다 — 툴바에서 여는 팝업은
 * 주소를 바꿀 수 없어서 기억해 둔 값으로 연다. '0'은 지금 배포 중인 화면.
 */
import React, { useContext, useEffect, useState } from 'react';
import { useGlobalSettingContext } from '@/context/GlobalSetting';
import { useResolvedDarkMode } from '@/hooks/useResolvedDarkMode';
import './proto.css';

export const PROTOTYPE_ENABLED = import.meta.env.MODE === 'development';

const storageKey = (page: string) => `tbc-proto-variant:${page}`;

export function useVariant(page: string, keys: string[]): [string, (v: string) => void] {
    const read = () => {
        const fromUrl = new URLSearchParams(location.search).get('variant');
        if (fromUrl && keys.includes(fromUrl)) return fromUrl;
        try {
            const saved = localStorage.getItem(storageKey(page));
            if (saved && keys.includes(saved)) return saved;
        } catch { /* 없어도 된다 */ }
        return keys[1] ?? keys[0];
    };
    const [variant, setVariant] = useState(read);
    const set = (v: string) => {
        setVariant(v);
        try { localStorage.setItem(storageKey(page), v); } catch { /* 없어도 된다 */ }
        const url = new URL(location.href);
        url.searchParams.set('variant', v);
        history.replaceState(null, '', url);
    };
    return [variant, set];
}

export function PrototypeSwitcher({ keys, names, current, onChange }: {
    keys: string[];
    names: Record<string, string>;
    current: string;
    onChange: (v: string) => void;
}) {
    const step = (d: number) => {
        const i = keys.indexOf(current);
        onChange(keys[(i + d + keys.length) % keys.length]);
    };
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
    return (
        <div className="pt-switcher" role="toolbar" aria-label="prototype variants">
            <button onClick={() => step(-1)} aria-label="previous">←</button>
            <span>{current} · {names[current]}</span>
            <button onClick={() => step(1)} aria-label="next">→</button>
        </div>
    );
}

/** 미리보기 페이지에서 테마를 강제로 고를 때. null이면 테마 설정(시스템/라이트/다크)을 따른다. */
export const ProtoDarkOverride = React.createContext<boolean | null>(null);

/** 시안 루트에 붙일 class — 'pt' 또는 'pt dark'. */
export function useProtoThemeClass(): string {
    const override = useContext(ProtoDarkOverride);
    const { globalSetting } = useGlobalSettingContext();
    const resolved = useResolvedDarkMode(globalSetting.darkTheme);
    return (override ?? resolved) ? 'pt dark' : 'pt';
}
