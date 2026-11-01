/**
 * 저장 실패 상태바 칸 — 🔴 평시엔 아무것도 안 보인다. 실패가 있을 때만 「저장 실패」 + 건수.
 *   누르면 무엇이 왜 실패했는지 한 줄씩(키·사유·시각) + 「지우기」.
 *
 * 🔴 ⛔ 색은 토큰으로만(구조 검사 ①) · window.alert/confirm 안 쓴다(이 레포 규칙) · 도메인 낱말 0(구조 검사 ⑤).
 *   창틀이 스스로 꽂는 칸이다 — 플러그인마다 짜면 중복이라, 호스트 앱이 상태바에 이 한 칸을 둔다.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStorageErrors, clearStorageErrors, type StorageError } from '../../plugin/storage-errors';
import { FOCUS_RING } from '../../primitives/focus';

const GAP = 6;

/** 사유를 사람 말로 */
function reasonText(reason: StorageError['reason']): string {
    switch (reason) {
        case 'quota': return '저장 공간이 찼다 — 저장되지 않았다. 새로고침하면 최근 변경이 사라진다';
        case 'blocked': return '브라우저가 저장을 막았다(프라이빗 모드일 수 있다)';
        default: return '알 수 없는 이유로 저장에 실패했다';
    }
}

/** HH:MM:SS — 언제 실패했나(시각만, 날짜는 당일이라 생략) */
function timeText(at: number): string {
    try { return new Date(at).toLocaleTimeString(); } catch { return ''; }
}

/** 열린 목록 — 단추 바로 위에 뜬다(상태바가 화면 맨 아래라 위로). 바깥 클릭·Esc 에 닫힌다. */
function ErrorList({ errors, anchor, onClose }: {
    errors: StorageError[];
    anchor: DOMRect;
    onClose: () => void;
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
            aria-label="저장 실패 목록"
            className="fixed z-[200] w-[320px] max-w-[90vw] max-h-[50vh] overflow-auto
                rounded-md border border-line bg-panel shadow-lg text-[12px] select-none"
            style={{ left: pos.left, top: pos.top }}
        >
            <div className="flex items-center justify-between gap-2 px-pad py-1.5 border-b border-line">
                <span className="font-medium text-bad">저장 실패 {errors.length}</span>
                <button
                    type="button"
                    onClick={() => { clearStorageErrors(); onClose(); }}
                    className={`shrink-0 px-1.5 py-0.5 rounded text-muted hover:text-text hover:bg-text/[0.06] ${FOCUS_RING}`}
                >
                    지우기
                </button>
            </div>
            <ul>
                {errors.map((e) => (
                    <li key={`${e.scope}\u0000${e.key}`} className="px-pad py-1.5 border-b border-line last:border-b-0">
                        <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-text" title={e.key}>{e.key}</span>
                            <span className="shrink-0 text-muted">{timeText(e.at)}</span>
                        </div>
                        <div className="text-muted">{reasonText(e.reason)}</div>
                    </li>
                ))}
            </ul>
        </div>,
        document.body,
    );
}

/** 🔴 상태바에 꽂히는 칸 자체 — 실패 0 이면 null(평시 아무것도 안 보인다). */
export function StorageErrorStatus() {
    const errors = useStorageErrors();
    const [open, setOpen] = useState(false);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const btnRef = useRef<HTMLButtonElement>(null);

    if (errors.length === 0) return null;

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                aria-label={`저장 실패 ${errors.length}건`}
                onClick={() => {
                    if (open) { setOpen(false); return; }
                    const r = btnRef.current?.getBoundingClientRect();
                    if (r) { setRect(r); setOpen(true); }
                }}
                className={`shrink-0 px-1 rounded text-bad hover:bg-bad/10 transition-colors ${FOCUS_RING}`}
            >
                🔴 저장 실패 {errors.length}
            </button>
            {open && rect && (
                <ErrorList errors={errors} anchor={rect} onClose={() => setOpen(false)} />
            )}
        </>
    );
}
