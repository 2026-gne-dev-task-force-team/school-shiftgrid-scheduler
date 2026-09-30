/** 화면 공용 조각 — 버튼·표식·ⓘ·모달·인라인 확인·오류 상자·입력 */
import { useState, useRef, useEffect, type ReactNode, type InputHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';
import { Popover } from '../help/Popover';
import { Figure } from '../help/figures/Figure';
import { Demo } from '../help/demos/Demo';
import { useHelp } from '../help/HelpContext';
import { glossaryById } from '../help/terms';
import type { RichHelp } from '../help/rich';

// ── 버튼 (동사로 쓴다) ────────────────────────────────────────
type BtnVariant = 'primary' | 'ghost' | 'danger' | 'soft';
export function Button({
    children, onClick, variant = 'ghost', icon, disabled, title, type = 'button', className = '', 'data-tour': dataTour,
}: {
    children?: ReactNode; onClick?: () => void; variant?: BtnVariant; icon?: IconName;
    disabled?: boolean; title?: string; type?: 'button' | 'submit'; className?: string;
    /** 코치마크가 찾는 표식 — 명시로 받아 <button> 에 실어야 한다(안 받으면 조용히 버려진다) */
    'data-tour'?: string;
}) {
    const base = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[44px] md:min-h-0 rounded-md text-[13px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
    const styles: Record<BtnVariant, string> = {
        primary: 'bg-accent hover:bg-accenth text-white',
        ghost: 'bg-panel2 hover:bg-line text-text border border-line',
        danger: 'bg-transparent hover:bg-bad/15 text-bad border border-bad/40',
        soft: 'bg-transparent hover:bg-line text-muted',
    };
    return (
        <button type={type} onClick={onClick} disabled={disabled} title={title} data-tour={dataTour}
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

// ── ⓘ 도움말 (네 칸 카드 · 뷰포트 인식 팝오버) ────────────────
/** 「무엇」 라벨 + 값 한 줄 */
function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="mt-1.5">
            <span className="text-[11px] text-muted mr-1">{label}</span>
            <span className="text-[12.5px] text-text leading-snug">{value}</span>
        </div>
    );
}

/** help(RichHelp) 가 있으면 그리는 네 칸 카드 — 제목·그림·무엇·왜·사용 예·고치는 곳·움직임·용어 */
function InfoRichCard({ help }: { help: RichHelp }) {
    const h = useHelp();
    const [showDemo, setShowDemo] = useState(true);
    const ex = help.example == null ? [] : Array.isArray(help.example) ? help.example : [help.example];
    return (
        <div className="p-3 text-left">
            {help.title && <div className="text-[13px] font-semibold text-text mb-1">{help.title}</div>}
            {help.figure && <Figure id={help.figure} className="my-2 rounded-md border border-line bg-panel2 p-1.5" />}
            <InfoRow label="무엇" value={help.what} />
            {help.why && <InfoRow label="왜" value={help.why} />}
            {ex.length > 0 && (
                <div className="mt-1.5">
                    <div className="text-[11px] text-muted mb-0.5">사용 예</div>
                    <div className="rounded-md bg-panel2 border border-line px-2 py-1.5 space-y-0.5">
                        {ex.map((e, i) => (
                            <div key={i} className="text-[12px] text-text leading-snug">{ex.length > 1 ? `- ${e}` : e}</div>
                        ))}
                    </div>
                </div>
            )}
            {help.fix && <InfoRow label="고치는 곳" value={help.fix} />}
            {help.demo && (
                <div className="mt-2">
                    <button type="button" onClick={() => setShowDemo((v) => !v)}
                        className="text-[12px] text-accenth hover:underline">
                        {showDemo ? '▼ 움직이는 사용법 접기' : '▶ 움직이는 사용법 보기'}
                    </button>
                    {showDemo && <Demo id={help.demo} autoplay className="mt-1.5" />}
                </div>
            )}
            <div className="mt-2.5 pt-2 border-t border-line flex items-center gap-1.5 flex-wrap">
                {help.terms?.map((t) => (
                    <button key={t} type="button" onClick={() => h.openDrawer('glossary', t)}
                        className="text-[11px] rounded-full bg-panel2 border border-line px-2 py-0.5 text-muted hover:text-text">
                        {glossaryById(t)?.word ?? t}
                    </button>
                ))}
                <button type="button" onClick={() => h.openDrawer('screen')}
                    className="ml-auto text-[11.5px] text-accenth hover:underline">도움말 서랍 →</button>
            </div>
        </div>
    );
}

/** 옛 세 줄(호환) — lines 만 왔을 때 */
function InfoLinesCard({ lines }: { lines: string[] }) {
    const labels = ['무엇', '왜 보나', '고치는 곳'];
    return (
        <div className="p-2.5 text-left space-y-1">
            {lines.map((l, i) => (
                <div key={i} className="text-[12px] text-text leading-snug">
                    <span className="text-muted mr-1">{labels[i] ?? ''}·</span>{l}
                </div>
            ))}
        </div>
    );
}

export function Info({ lines, help, size = 16 }: { lines?: string[]; help?: RichHelp; size?: number }) {
    const [open, setOpen] = useState(false);
    const btnRef = useRef<HTMLButtonElement>(null);
    return (
        <>
            <button ref={btnRef} type="button" onClick={() => setOpen((v) => !v)}
                aria-expanded={open} aria-label="설명" title="설명 보기"
                style={{ width: size, height: size }}
                className="shrink-0 rounded-full border border-line text-muted text-[10px] leading-none grid place-items-center hover:text-text hover:border-muted">ⓘ</button>
            <Popover anchorRef={btnRef} open={open} onClose={() => setOpen(false)} width={340}>
                {help ? <InfoRichCard help={help} /> : lines ? <InfoLinesCard lines={lines} /> : null}
            </Popover>
        </>
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
export function Modal({ title, children, onClose, wide, noMobileFooter }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; noMobileFooter?: boolean }) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4 no-print" onMouseDown={onClose}>
            <div className={`bg-panel border border-line rounded-t-2xl md:rounded-lg shadow-2xl w-full ${wide ? 'md:w-[720px]' : 'md:w-[460px]'} max-w-full max-h-[94vh] md:max-h-[88vh] overflow-auto flex flex-col`}
                onMouseDown={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-line sticky top-0 bg-panel shrink-0">
                    <h3 className="text-[14px] font-semibold">{title}</h3>
                    <button onClick={onClose} className="text-muted hover:text-text" aria-label="닫기"><Icon name="x" size={16} /></button>
                </div>
                <div className="p-4">{children}</div>
                {!noMobileFooter && (
                    <div className="md:hidden sticky bottom-0 bg-panel border-t border-line p-3 shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                        <button onClick={onClose} className="w-full py-2.5 rounded-md bg-panel2 border border-line text-text text-[13px] font-medium">닫기</button>
                    </div>
                )}
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
            className={`bg-panel2 border border-line rounded-md px-2 min-h-[44px] md:min-h-0 md:py-1 text-[15px] md:text-[13px] text-text placeholder:text-muted/60 outline-none focus:border-accent ${props.className ?? ''}`} />
    );
}
export function Select({ children, value, onChange, className = '' }: { children: ReactNode; value: string; onChange: (v: string) => void; className?: string }) {
    return (
        <select value={value} onChange={(e) => onChange(e.target.value)}
            className={`bg-panel2 border border-line rounded-md px-2 min-h-[44px] md:min-h-0 md:py-1 text-[15px] md:text-[13px] text-text outline-none focus:border-accent ${className}`}>
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
// ── 빈 화면 안내 (전제가 빠졌을 때: 아이콘 + 두 문장 + 이동 버튼) ──
export function EmptyGuide({ icon = 'info', lines, actionLabel, onAction, actionIcon }: {
    icon?: IconName; lines: string[]; actionLabel?: string; onAction?: () => void; actionIcon?: IconName;
}) {
    return (
        <div className="max-w-md mx-auto my-8 text-center px-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-panel2 border border-line grid place-items-center text-muted mb-3">
                <Icon name={icon} size={26} />
            </div>
            <div className="text-[13.5px] text-muted space-y-1 mb-4 leading-relaxed">
                {lines.map((l, i) => <p key={i}>{l}</p>)}
            </div>
            {actionLabel && onAction && (
                <Button variant="primary" icon={actionIcon} onClick={onAction}>{actionLabel}</Button>
            )}
        </div>
    );
}

export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'ok' | 'bad' | 'warn' | 'accent' }) {
    const cls: Record<string, string> = {
        muted: 'bg-line text-muted', ok: 'bg-ok/15 text-ok', bad: 'bg-bad/15 text-bad',
        warn: 'bg-warn/15 text-warn', accent: 'bg-accent/20 text-accenth',
    };
    return <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${cls[tone]}`}>{children}</span>;
}
