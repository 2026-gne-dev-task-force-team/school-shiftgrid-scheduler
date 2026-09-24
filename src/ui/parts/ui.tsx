/** 화면 공용 조각 — 버튼·표식·ⓘ·모달·인라인 확인·오류 상자·입력 */
import { useState, useRef, useEffect, type ReactNode, type InputHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';

// ── 버튼 (동사로 쓴다) ────────────────────────────────────────
type BtnVariant = 'primary' | 'ghost' | 'danger' | 'soft';
export function Button({
    children, onClick, variant = 'ghost', icon, disabled, title, type = 'button', className = '',
}: {
    children?: ReactNode; onClick?: () => void; variant?: BtnVariant; icon?: IconName;
    disabled?: boolean; title?: string; type?: 'button' | 'submit'; className?: string;
}) {
    const base = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
    const styles: Record<BtnVariant, string> = {
        primary: 'bg-accent hover:bg-accenth text-white',
        ghost: 'bg-panel2 hover:bg-line text-text border border-line',
        danger: 'bg-transparent hover:bg-bad/15 text-bad border border-bad/40',
        soft: 'bg-transparent hover:bg-line text-muted',
    };
    return (
        <button type={type} onClick={onClick} disabled={disabled} title={title}
            className={`${base} ${styles[variant]} ${className}`}>
            {icon && <Icon name={icon} size={15} />}
            {children}
        </button>
    );
}

// ── 표식 (뜻 고정: ✅🔴⚠️❔) ──────────────────────────────────
export type MarkKind = 'ok' | 'bad' | 'warn' | 'unknown';
const MARK: Record<MarkKind, { ch: string; cls: string }> = {
    ok: { ch: '✅', cls: 'text-ok' },
    bad: { ch: '🔴', cls: 'text-bad' },
    warn: { ch: '⚠️', cls: 'text-warn' },
    unknown: { ch: '❔', cls: 'text-muted' },
};
export function Mark({ kind, className = '' }: { kind: MarkKind; className?: string }) {
    return <span className={`${MARK[kind].cls} ${className}`} aria-hidden="true">{MARK[kind].ch}</span>;
}

// ── ⓘ 세 문장 (뭔가 / 왜 보나 / 고치는 곳) ────────────────────
export function Info({ lines }: { lines: [string, string, string] | string[] }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        if (!open) return;
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        window.addEventListener('mousedown', h);
        return () => window.removeEventListener('mousedown', h);
    }, [open]);
    return (
        <span ref={ref} className="relative inline-flex">
            <button type="button" onClick={() => setOpen((v) => !v)}
                className="w-4 h-4 rounded-full border border-line text-muted text-[10px] leading-none grid place-items-center hover:text-text hover:border-muted"
                title="설명 보기" aria-label="설명">ⓘ</button>
            {open && (
                <span className="absolute z-50 left-0 top-5 w-64 p-2.5 rounded-md bg-panel2 border border-line shadow-xl text-[12px] text-text space-y-1">
                    {lines.map((l, i) => (
                        <span key={i} className="block leading-snug">
                            <span className="text-muted mr-1">{['무엇', '왜 보나', '고치는 곳'][i] ?? ''}·</span>{l}
                        </span>
                    ))}
                </span>
            )}
        </span>
    );
}

// ── 오류 상자 (세 줄: 무엇이 · 왜 · 다음에) ───────────────────
export function ErrorBox({ title, lines, onClose }: { title: string; lines: string[]; onClose?: () => void }) {
    const labels = ['무엇이', '왜', '다음에'];
    return (
        <div className="rounded-md border border-bad/50 bg-bad/10 p-3 text-[13px]">
            <div className="flex items-start gap-2">
                <Mark kind="bad" />
                <div className="flex-1">
                    <div className="font-semibold text-text">{title}</div>
                    <ul className="mt-1 space-y-0.5">
                        {lines.map((l, i) => (
                            <li key={i} className="text-muted"><span className="text-bad/80 mr-1">{labels[i] ?? '·'}·</span>{l}</li>
                        ))}
                    </ul>
                </div>
                {onClose && (
                    <button onClick={onClose} className="text-muted hover:text-text" aria-label="닫기"><Icon name="x" size={14} /></button>
                )}
            </div>
        </div>
    );
}

// ── 모달 ──────────────────────────────────────────────────────
export function Modal({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-[100] bg-black/50 grid place-items-center p-4 no-print" onMouseDown={onClose}>
            <div className={`bg-panel border border-line rounded-lg shadow-2xl ${wide ? 'w-[720px]' : 'w-[460px]'} max-w-full max-h-[88vh] overflow-auto`}
                onMouseDown={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-line sticky top-0 bg-panel">
                    <h3 className="text-[14px] font-semibold">{title}</h3>
                    <button onClick={onClose} className="text-muted hover:text-text" aria-label="닫기"><Icon name="x" size={16} /></button>
                </div>
                <div className="p-4">{children}</div>
            </div>
        </div>
    );
}

// ── 인라인 확인 (「정말 지울까요? [지우기] [그만]」) ──────────
export function ConfirmButton({
    onConfirm, label = '지우기', question = '정말 지울까요?', icon = 'trash', variant = 'danger', iconOnly,
}: { onConfirm: () => void; label?: string; question?: string; icon?: IconName; variant?: BtnVariant; iconOnly?: boolean }) {
    const [armed, setArmed] = useState(false);
    const q = question || '정말 지울까요?';
    if (!armed) {
        if (iconOnly) return (
            <button onClick={() => setArmed(true)} title="지우기" aria-label="지우기"
                className="text-muted hover:text-bad p-1 rounded"><Icon name={icon} size={15} /></button>
        );
        return <Button variant={variant} icon={icon} onClick={() => setArmed(true)}>{label}</Button>;
    }
    return (
        <span className="inline-flex items-center gap-1.5 text-[12px]">
            <span className="text-muted">{q}</span>
            <Button variant="danger" onClick={() => { onConfirm(); setArmed(false); }}>지우기</Button>
            <Button variant="soft" onClick={() => setArmed(false)}>그만</Button>
        </span>
    );
}

// ── 입력 ──────────────────────────────────────────────────────
export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input {...props}
            className={`bg-panel2 border border-line rounded-md px-2 py-1 text-[13px] text-text placeholder:text-muted/60 outline-none focus:border-accent ${props.className ?? ''}`} />
    );
}
export function Select({ children, value, onChange, className = '' }: { children: ReactNode; value: string; onChange: (v: string) => void; className?: string }) {
    return (
        <select value={value} onChange={(e) => onChange(e.target.value)}
            className={`bg-panel2 border border-line rounded-md px-2 py-1 text-[13px] text-text outline-none focus:border-accent ${className}`}>
            {children}
        </select>
    );
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
    return (
        <label className="block">
            <span className="block text-[12px] text-muted mb-1">{label}{hint && <span className="ml-1 text-muted/60">— {hint}</span>}</span>
            {children}
        </label>
    );
}

// ── 카드·표 껍데기 ────────────────────────────────────────────
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <div className={`bg-panel border border-line rounded-lg ${className}`}>{children}</div>;
}
export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'ok' | 'bad' | 'warn' | 'accent' }) {
    const cls: Record<string, string> = {
        muted: 'bg-line text-muted', ok: 'bg-ok/15 text-ok', bad: 'bg-bad/15 text-bad',
        warn: 'bg-warn/15 text-warn', accent: 'bg-accent/20 text-accenth',
    };
    return <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${cls[tone]}`}>{children}</span>;
}
