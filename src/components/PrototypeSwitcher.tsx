/** PROTOTYPE — 시안 바꾸기 막대 (?variant=). dev 빌드에서만 쓴다. */
import React, { useEffect, useState } from 'react';

export const IS_PROTO = import.meta.env.MODE !== 'production' || import.meta.env.WXT_PROTO === '1';

export function useVariant(keys: readonly string[]): [string | null, (v: string) => void] {
    const read = () => new URLSearchParams(location.search).get('variant');
    const [v, setV] = useState(read);
    const set = (next: string) => {
        const u = new URL(location.href);
        u.searchParams.set('variant', next);
        history.replaceState(null, '', u);
        setV(next);
    };
    return [IS_PROTO && v && keys.includes(v) ? v : null, set];
}

export function PrototypeSwitcher({ variants, current, onChange }: { variants: Record<string, string>; current: string; onChange: (v: string) => void }) {
    const keys = Object.keys(variants);
    const go = (d: number) => onChange(keys[(keys.indexOf(current) + d + keys.length) % keys.length]);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (t.closest('input, textarea, select, [contenteditable]')) return;
            if (e.key === 'ArrowLeft') go(-1);
            if (e.key === 'ArrowRight') go(1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });
    const btn: React.CSSProperties = { border: 0, background: 'none', color: 'inherit', font: 'inherit', fontSize: 18, cursor: 'pointer', padding: '0 6px' };
    return (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', borderRadius: 999, background: '#e11d48', color: '#fff', font: '800 14px system-ui', boxShadow: '0 6px 24px rgba(0,0,0,.35)' }}>
            <button type="button" style={btn} onClick={() => go(-1)} aria-label="이전 시안">←</button>
            <span>PROTOTYPE {current} ({variants[current]})</span>
            <button type="button" style={btn} onClick={() => go(1)} aria-label="다음 시안">→</button>
        </div>
    );
}
