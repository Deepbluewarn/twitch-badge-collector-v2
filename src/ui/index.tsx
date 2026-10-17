/**
 * 확장 UI 부품 — MUI 대신. docs/design-system.md "컴포넌트".
 * 팝업·설정 페이지 전용 (콘텐츠 스크립트는 호스트 테마를 따르므로 쓰지 않는다).
 * 페이지 진입점에서 './base.css'를 불러오고 useDocumentTheme으로 <html data-theme>을 맞춘다.
 */
import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import s from './ui.module.css';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ── 아이콘 ───────────────────────────
/** Material Icons Round 글꼴의 아이콘 이름 (https://fonts.google.com/icons). */
export function Icon({ name, size, className, style }: { name: string; size?: number; className?: string; style?: React.CSSProperties }) {
    return <span className={cx('material-icons-round', s.icon, className)} aria-hidden="true" style={{ ...(size ? { fontSize: size } : {}), ...style }}>{name}</span>;
}

// ── 버튼 ───────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger';
type ButtonOwn = { variant?: ButtonVariant; size?: 'md' | 'sm'; icon?: string; block?: boolean };

export function Button({ variant = 'secondary', size = 'md', icon, block, className, children, type = 'button', ...rest }:
    ButtonOwn & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button type={type} className={cx(s.btn, variant !== 'secondary' && s[variant], size === 'sm' && s.sm, block && s.block, className)} {...rest}>
            {icon && <Icon name={icon} />}
            {children}
        </button>
    );
}

/** 링크처럼 이동하는 버튼 (a 요소). */
export function LinkButton({ variant = 'secondary', size = 'md', icon, block, className, children, ...rest }:
    ButtonOwn & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    return (
        <a className={cx(s.btn, variant !== 'secondary' && s[variant], size === 'sm' && s.sm, block && s.block, className)} {...rest}>
            {icon && <Icon name={icon} />}
            {children}
        </a>
    );
}

/** 파일 고르기처럼 label로 감싸야 하는 버튼. */
export function LabelButton({ variant = 'secondary', size = 'md', icon, className, children, ...rest }:
    ButtonOwn & React.LabelHTMLAttributes<HTMLLabelElement>) {
    return (
        <label className={cx(s.btn, variant !== 'secondary' && s[variant], size === 'sm' && s.sm, className)} {...rest}>
            {icon && <Icon name={icon} />}
            {children}
        </label>
    );
}

export function IconButton({ icon, label, size = 'md', className, type = 'button', ...rest }:
    { icon: string; label: string; size?: 'md' | 'sm' } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button type={type} className={cx(s.iconBtn, size === 'sm' && s.sm, className)} aria-label={label} {...rest}>
            <Icon name={icon} />
        </button>
    );
}

// ── 토글 묶음 ───────────────────────────
export interface SegmentedOption<T extends string> { value: T; label: React.ReactNode; icon?: string; title?: string }

export function Segmented<T extends string>({ value, options, onChange, size = 'md', label, className }: {
    value: T | null;
    options: SegmentedOption<T>[];
    onChange: (v: T) => void;
    size?: 'md' | 'sm';
    label?: string;
    className?: string;
}) {
    return (
        <div className={cx(s.seg, size === 'sm' && s.sm, className)} role="group" aria-label={label}>
            {options.map(o => (
                <button key={o.value} type="button" aria-pressed={value === o.value} title={o.title} onClick={() => onChange(o.value)}>
                    {o.icon && <Icon name={o.icon} />}
                    {o.label}
                </button>
            ))}
        </div>
    );
}

// ── 스위치 ───────────────────────────
export function Switch({ checked, onChange, label, disabled, className }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    /** 있으면 스위치 옆에 글자로 보인다. 없으면 aria-label로만. */
    label?: React.ReactNode;
    disabled?: boolean;
    className?: string;
}) {
    const btn = (
        <button type="button" role="switch" aria-checked={checked} disabled={disabled}
            aria-label={typeof label === 'string' ? label : undefined}
            className={cx(s.switch, !label && className)} onClick={() => onChange(!checked)} />
    );
    if (!label) return btn;
    return <label className={cx(s.switchLabel, className)}>{btn}<span>{label}</span></label>;
}

// ── 입력 ───────────────────────────
export function Field({ label, children, className, htmlFor, style }: { label: React.ReactNode; children: React.ReactNode; className?: string; htmlFor?: string; style?: React.CSSProperties }) {
    return (
        <div className={cx(s.field, className)} style={style}>
            <label className={s.fieldLabel} htmlFor={htmlFor}>{label}</label>
            {children}
        </div>
    );
}

export const TextInput = React.forwardRef<HTMLInputElement, { size?: 'md' | 'sm'; lead?: string; trail?: React.ReactNode } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>>(
    function TextInput({ size = 'md', lead, trail, className, ...rest }, ref) {
        const input = <input ref={ref} className={cx(s.input, size === 'sm' && s.sm, className)} {...rest} />;
        if (!lead && !trail) return input;
        return (
            <div className={s.inputWrap}>
                {lead && <Icon name={lead} className={s.lead} />}
                {input}
                {trail && <span className={s.trail}>{trail}</span>}
            </div>
        );
    },
);

export function TextArea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return <textarea className={cx(s.textarea, className)} {...rest} />;
}

export function Select<T extends string>({ value, options, onChange, size = 'md', className, ...rest }: {
    value: T;
    options: { value: T; label: string; disabled?: boolean }[];
    onChange: (v: T) => void;
    size?: 'md' | 'sm';
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange' | 'size'>) {
    return (
        <select className={cx(s.select, size === 'sm' && s.sm, className)} value={value} onChange={e => onChange(e.target.value as T)} {...rest}>
            {options.map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
        </select>
    );
}

// ── 카드 · 탭 ───────────────────────────
export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cx(s.card, className)} {...rest} />;
}

export function Tabs<T extends string>({ value, items, onChange, className }: {
    value: T;
    items: { value: T; label: React.ReactNode }[];
    onChange: (v: T) => void;
    className?: string;
}) {
    return (
        <div className={cx(s.tabs, className)} role="tablist">
            {items.map(i => (
                <button key={i.value} type="button" role="tab" aria-selected={value === i.value} onClick={() => onChange(i.value)}>{i.label}</button>
            ))}
        </div>
    );
}

// ── 대화상자 ───────────────────────────
/** 열린 대화상자들 (겹쳐 열리면 맨 위 것만 Esc를 받는다). */
const openDialogs: symbol[] = [];

/** 바깥(어두운 막)을 누르거나 Esc로 닫힌다. 열릴 때 한 번 안의 첫 입력에 초점. */
export function Dialog({ open, onClose, title, actions, headerExtra, width = 'sm', children, bodyClassName }: {
    open: boolean;
    onClose: () => void;
    title: React.ReactNode;
    actions?: React.ReactNode;
    /** 제목 줄 오른쪽 (닫기 버튼 앞) */
    headerExtra?: React.ReactNode;
    width?: 'xs' | 'sm' | 'md' | 'lg';
    children: React.ReactNode;
    bodyClassName?: string;
}) {
    const titleId = useId();
    const box = useRef<HTMLDivElement>(null);
    // onClose가 렌더마다 새 함수여도 리스너를 다시 붙이거나 초점을 다시 옮기지 않게 ref로 든다.
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    useEffect(() => {
        if (!open) return;
        const me = Symbol('dialog');
        openDialogs.push(me);
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || openDialogs[openDialogs.length - 1] !== me) return;
            e.stopPropagation();
            closeRef.current();
        };
        document.addEventListener('keydown', onKey);
        box.current?.querySelector<HTMLElement>('[autofocus], input, textarea, select')?.focus();
        return () => {
            document.removeEventListener('keydown', onKey);
            openDialogs.splice(openDialogs.indexOf(me), 1);
        };
    }, [open]);
    if (!open) return null;
    return createPortal(
        <div className={s.backdrop} onMouseDown={e => { if (e.target === e.currentTarget) closeRef.current(); }}>
            <div ref={box} className={cx(s.dialog, s[width])} role="dialog" aria-modal="true" aria-labelledby={titleId}>
                <div className={s.dialogHead}>
                    <h2 id={titleId} className={s.dialogTitle}>{title}</h2>
                    {headerExtra}
                </div>
                <div className={cx(s.dialogBody, bodyClassName)}>{children}</div>
                {actions && <div className={s.dialogActions}>{actions}</div>}
            </div>
        </div>,
        document.body,
    );
}

// ── 알림 · 태그 ───────────────────────────
type Tone = 'info' | 'success' | 'error' | 'warning';
const TONE_ICON: Record<Tone, string> = { info: 'info', success: 'check_circle', error: 'error', warning: 'warning' };

export function Notice({ tone = 'info', action, flat, children, className, role }: {
    tone?: Tone;
    action?: React.ReactNode;
    /** 페이지 맨 위 띠처럼 테두리 없이 */
    flat?: boolean;
    children: React.ReactNode;
    className?: string;
    role?: string;
}) {
    return (
        <div className={cx(s.notice, s[tone], flat && s.flat, className)} role={role ?? (tone === 'error' ? 'alert' : 'status')}>
            <Icon name={TONE_ICON[tone]} className={s.noticeIcon} />
            <div className={s.noticeBody}>{children}</div>
            {action}
        </div>
    );
}

export type TagTone = 'ok' | 'bad' | 'off' | 'neutral' | 'yellow';

export function Tag({ tone = 'neutral', round, className, children, onClick, title }: {
    tone?: TagTone; round?: boolean; className?: string; children: React.ReactNode; onClick?: () => void; title?: string;
}) {
    const cls = cx(s.tag, s[tone], round && s.round, className);
    return onClick
        ? <button type="button" className={cls} onClick={onClick} title={title}>{children}</button>
        : <span className={cls} title={title}>{children}</span>;
}

export function Spinner({ label }: { label?: string }) {
    return <span className={s.spinner} role="progressbar" aria-label={label} />;
}

export function Divider() {
    return <hr className={s.divider} />;
}

/** 가로·세로 줄 세우기 — 간격·정렬만 다룬다. */
export function Stack({ dir = 'col', gap = 8, align, justify, wrap, className, style, children, ...rest }: {
    dir?: 'row' | 'col';
    gap?: number;
    align?: React.CSSProperties['alignItems'];
    justify?: React.CSSProperties['justifyContent'];
    wrap?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={className} style={{ display: 'flex', flexDirection: dir === 'row' ? 'row' : 'column', gap, alignItems: align, justifyContent: justify, flexWrap: wrap ? 'wrap' : undefined, minWidth: 0, ...style }} {...rest}>
            {children}
        </div>
    );
}
