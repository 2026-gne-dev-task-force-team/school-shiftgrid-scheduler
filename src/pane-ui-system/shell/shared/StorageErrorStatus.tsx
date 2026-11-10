/**
 * 저장 상태바 칸 — 🔴 평시엔 아무것도 안 보인다. 우선순위 하나만 비춘다:
 *   실패 ≥1  → 「🔴 저장 실패 N」 (누르면 무엇이 왜 실패했는지 한 줄씩 + 「지우기」)
 *   실패 0 · unavailable → 「🔴 저장 안 됨」 (이 브라우저가 저장을 막았다)
 *   실패 0 · best-effort → 「임시 저장」 (흐린 글씨 — 저장은 되고, 브라우저가 공간이 모자라면 지울 수 있다. 경고색 ⛔: 처음 쓰는 사람이 불안해했다 · QA 1바퀴)
 *   persisted · unknown  → null (평시)
 *
 * 🔴 실패와 내구성은 다른 것이다 — 실패는 「저장이 안 됐다」(지울 수 있다), 내구성은 「언젠가 지워질 수
 *    있다」(상태라 지울 수 없다). 그래서 「지우기」 단추는 실패 목록에만 둔다.
 * 🔴 ⛔ 색은 토큰으로만(구조 검사 ①) · window.alert/confirm 안 쓴다 · 도메인 낱말 0(구조 검사 ⑤).
 *   창틀이 스스로 꽂는 칸이다 — 플러그인마다 짜면 중복이라, 호스트 앱이 상태바에 이 한 칸을 둔다.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
    useStorageErrors, clearStorageErrors, useDurability, storageReasonText,
    type StorageError,
} from '../../plugin/storage-errors';
import { storageStatusKind } from './storage-status';
import { FOCUS_RING } from '../../primitives/focus';
import { Button } from '../../primitives/Button';

const GAP = 6;

/** 내구성 경고를 사람 말로 — 「지울 수 있다」(실패가 아니라 상태) */
function durabilityText(kind: 'unavailable' | 'best-effort'): string {
    return kind === 'unavailable'
        ? '이 브라우저가 저장을 막았다 — 지금 작업은 창을 닫으면 사라진다'
        : '브라우저가 저장 공간을 영구로 잡아 두지 않았습니다. 자료는 저장되지만 브라우저가 공간이 모자라면 지울 수 있습니다. 내보내기로 백업하세요. (사파리는 7일 안 열면 지웁니다 — 홈 화면에 추가하면 면제됩니다)';
}

/** HH:MM:SS — 언제 실패했나(시각만, 날짜는 당일이라 생략) */
function timeText(at: number): string {
    try { return new Date(at).toLocaleTimeString(); } catch { return ''; }
}

/** 열린 쪽지 — 단추 바로 위에 뜬다(상태바가 화면 맨 아래라 위로). 바깥 클릭·Esc 에 닫힌다. */
function Popover({ anchor, label, width, onClose, children }: {
    anchor: DOMRect;
    label: string;
    width: number;
    onClose: () => void;
    children: ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ left: anchor.left, top: anchor.top });

    // 단추 위에 띄우고 화면 밖으로 넘치면 안으로 민다
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        let left = anchor.right - r.width;              // 오른쪽 끝을 단추에 맞춘다(상태바 우측 항목)
        let top = anchor.top - r.height - GAP;          // 단추 위
        if (left < GAP) left = GAP;
        if (top < GAP) top = anchor.bottom + GAP;       // 위가 모자라면 아래로
        if (left + r.width > window.innerWidth - GAP) left = window.innerWidth - r.width - GAP;
        setPos({ left, top });
    }, [anchor]);

    useEffect(() => {
        const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('pointerdown', onDown, true);
        window.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('pointerdown', onDown, true);
            window.removeEventListener('keydown', onKey, true);
        };
    }, [onClose]);

    return createPortal(
        <div
            ref={ref}
            role="dialog"
            aria-label={label}
            className="fixed z-[200] max-w-[90vw] max-h-[50vh] overflow-auto
                rounded-md border border-line bg-panel shadow-lg text-small select-none"
            style={{ left: pos.left, top: pos.top, width }}
        >
            {children}
        </div>,
        document.body,
    );
}

/** 실패 목록 본문 — 머리(건수 + 지우기) + 한 줄씩(키·사유·시각). */
function ErrorListBody({ errors, onClose }: { errors: StorageError[]; onClose: () => void }) {
    return (
        <>
            <div className="flex items-center justify-between gap-2 px-pad py-1.5 border-b border-line">
                <span className="font-medium text-bad">저장 실패 {errors.length}</span>
                <Button size="sm" variant="ghost" onClick={() => { clearStorageErrors(); onClose(); }}>지우기</Button>
            </div>
            <ul>
                {errors.map((e) => (
                    <li key={`${e.scope}\u0000${e.key}`} className="px-pad py-1.5 border-b border-line last:border-b-0">
                        <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-text" title={e.key}>{e.key}</span>
                            <span className="shrink-0 text-muted">{timeText(e.at)}</span>
                        </div>
                        <div className="text-muted">{storageReasonText(e.reason)}</div>
                    </li>
                ))}
            </ul>
        </>
    );
}

/** 내구성 경고 본문 — 설명 한 줄만(지우기 없음 — 상태라 지울 수 없다). */
function DurabilityBody({ kind }: { kind: 'unavailable' | 'best-effort' }) {
    return (
        <div className="px-pad py-1.5">
            <div className={`font-medium ${kind === 'best-effort' ? 'text-muted' : 'text-bad'}`}>
                {kind === 'unavailable' ? '저장 안 됨' : '임시 저장'}
            </div>
            <div className="mt-0.5 text-muted">{durabilityText(kind)}</div>
        </div>
    );
}

/** 🔴 상태바에 꽂히는 칸 자체 — 우선순위에 따라 하나만, 아무것도 없으면 null(평시). */
export function StorageErrorStatus() {
    const errors = useStorageErrors();
    const durability = useDurability();
    const [open, setOpen] = useState(false);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const btnRef = useRef<HTMLButtonElement>(null);

    const kind = storageStatusKind(errors.length, durability);
    if (!kind) return null;

    const label = kind === 'fail' ? `🔴 저장 실패 ${errors.length}`
        : kind === 'unavailable' ? '🔴 저장 안 됨'
            : '임시 저장';
    const aria = kind === 'fail' ? `저장 실패 ${errors.length}건`
        : kind === 'unavailable' ? '저장 안 됨'
            : '임시 저장';
    // 색은 토큰으로만 — best-effort 는 경고색이 아니라 흐린 글씨(실제 쓰기 실패가 아니다), 그 밖은 bad.
    const tone = kind === 'best-effort' ? 'text-muted hover:bg-line/40' : 'text-bad hover:bg-bad/10';

    return (
        <>
            {/* oxlint-disable-next-line react/forbid-elements -- 상태 막대 칸 — 막대 안 글자 크기 */}
            <button
                ref={btnRef}
                type="button"
                aria-label={aria}
                title={kind === 'best-effort' ? durabilityText('best-effort') : undefined}
                onClick={() => {
                    if (open) { setOpen(false); return; }
                    const r = btnRef.current?.getBoundingClientRect();
                    if (r) { setRect(r); setOpen(true); }
                }}
                className={`shrink-0 px-1 rounded transition-colors ${tone} ${FOCUS_RING}`}
            >
                {label}
            </button>
            {open && rect && (
                <Popover
                    anchor={rect}
                    width={kind === 'fail' ? 320 : 260}
                    label={aria}
                    onClose={() => setOpen(false)}
                >
                    {kind === 'fail'
                        ? <ErrorListBody errors={errors} onClose={() => setOpen(false)} />
                        : <DurabilityBody kind={kind} />}
                </Popover>
            )}
        </>
    );
}
