import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/ui';
import s from './SettingsUI.module.css';

/**
 * 설정 페이지 네 화면이 함께 쓰는 틀 (Chrome 설정형, 2026-10-25 시안 B로 확정 — prototype/settings-ui).
 * 화면 = 묶음 제목(h2) + 가는 테두리 카드, 카드 안은 "이름표 왼쪽 / 컨트롤 오른쪽" 줄.
 * 버튼은 모두 작은 크기, 주 버튼은 화면마다 하나 (docs/design-system.md).
 */

/** 이름 옆 플랫폼 전용 표시 — 한 플랫폼에서만 동작하는 설정·메뉴 */
export function PlatformChip({ platform }: { platform: 'chzzk' | 'twitch' }) {
    const { t } = useTranslation();
    return <span className={s.chip} data-platform={platform}><i />{t(`platform.${platform}`)}</span>;
}

/** 묶음 제목. actions가 있으면 오른쪽에 붙는다. */
export function SectionTitle({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
    if (!actions) return <h2 className={s.h2}>{children}</h2>;
    return (
        <div className={s.h2row}>
            <h2 className={s.h2}>{children}</h2>
            <div className={s.actions}>{actions}</div>
        </div>
    );
}

export function SettingsCard({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
    return <div className={`${s.card} ${className ?? ''}`} style={style}>{children}</div>;
}

/** 이름표(+기존 힌트, 플랫폼 칩) 왼쪽, 컨트롤 오른쪽 */
export function SettingRow({ label, hint, platform, children, className }: {
    label?: React.ReactNode; hint?: React.ReactNode; platform?: 'chzzk' | 'twitch'; children?: React.ReactNode; className?: string;
}) {
    return (
        <div className={`${s.row} ${className ?? ''}`}>
            {label !== undefined && <RowLabel label={label} hint={hint} platform={platform} />}
            {children}
        </div>
    );
}

export function RowLabel({ label, hint, platform }: { label: React.ReactNode; hint?: React.ReactNode; platform?: 'chzzk' | 'twitch' }) {
    return (
        <div className={s.label}>
            <div>{label}{platform && <PlatformChip platform={platform} />}</div>
            {hint && <small>{hint}</small>}
        </div>
    );
}

/** 누르면 하위 페이지로 가는 줄 */
export function LinkRow({ children, onClick, danger, trailing = 'chevron_right' }: {
    children: React.ReactNode; onClick: () => void; danger?: boolean; trailing?: string;
}) {
    return (
        <button type="button" className={`${s.linkRow} ${danger ? s.danger : ''}`} onClick={onClick}>
            {children}
            <span className="material-icons-round" aria-hidden="true">{trailing}</span>
        </button>
    );
}

/** 하위 페이지 머리 — 뒤로 + 제목 + 오른쪽 동작 */
export function SubHeader({ title, backLabel, onBack, children }: {
    title: React.ReactNode; backLabel: string; onBack: () => void; children?: React.ReactNode;
}) {
    return (
        <div className={s.sub}>
            <IconButton icon="arrow_back" size="sm" label={backLabel} onClick={onBack} />
            <h2>{title}</h2>
            {children}
        </div>
    );
}

/** 카드 아래 작은 글 — 면책·범위처럼 꼭 알려야 하는 것만 */
export function Note({ children }: { children: React.ReactNode }) {
    return <p className={s.note}>{children}</p>;
}

export const settingsClass = s;
