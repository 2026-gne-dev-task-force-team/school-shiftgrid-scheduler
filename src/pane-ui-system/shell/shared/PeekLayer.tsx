/**
 * 피크(미리보기) 겹침 — 🔴 ⭐ **그 탭 안에서** 뜬다(전역 창 아님, 쥔님 2026-11-01).
 *   EditorArea 가 제 칸 위에 absolute 로 얹는다. wide=true(칸이 넓다) → 오른쪽에서, wide=false → 아래에서.
 *
 * 🔴 다듬기(항목 D, 쥔님 2026-11-01):
 *   - *"좀 더 둥글게"* → 안쪽 모서리를 둥글린다(rounded-l-xl · rounded-t-xl).
 *   - *"바깥 터치하면 무조건 닫히는데 팝업 같은 건 아니라서"* → ⛔ 바깥 클릭으로 안 닫는다. 닫기는 ✕·Esc 뿐.
 *   - *"크기 조절 가능해야 하고"* → 안쪽 가장자리를 끌어 크기 조절(넓을 땐 좌우, 좁을 땐 위아래). 기기별로 기억.
 *   - *"문서 뷰라서 좀 더 넓어야 해 기본값이"* → 기본 폭 640(문서급). 칸이 좁으면 칸에 맞춰 줄인다.
 *   🔴 색·치수는 토큰 클래스로만(구조 검사 ①).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { IconButton } from '../../primitives/IconButton';
import { storageKey } from '../../storage';

const DEFAULT_W = 640;   // 문서급 기본 폭(쥔님: 480→640 이상)
const MIN_W = 320;
const MIN_H = 200;
const EDGE_GAP = 48;     // 칸 가장자리와 최소 간격(피크가 칸을 꽉 덮지 않게)

const WKEY = 'peek.width';
const HKEY = 'peek.height';

function loadNum(key: string, fallback: number): number {
    try {
        if (typeof localStorage === 'undefined') return fallback;
        const s = localStorage.getItem(storageKey(key));
        const n = s == null ? NaN : Number(s);
        return Number.isFinite(n) && n > 0 ? n : fallback;
    } catch { return fallback; }
}
function saveNum(key: string, n: number): void {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey(key), String(Math.round(n))); } catch { /* 조용히 */ }
}

export function PeekLayer({ wide, onClose, children }: { wide: boolean; onClose: () => void; children: ReactNode }) {
    const layerRef = useRef<HTMLDivElement>(null);
    // 기기별로 기억한 크기 — 폭(오른쪽 피크)·높이(아래 피크). 없으면 문서급 기본
    const [w, setW] = useState(() => loadNum(WKEY, DEFAULT_W));
    const [h, setH] = useState(() => loadNum(HKEY, 0));   // 0 = 아직 없음 → 마운트 때 62% 로
    const [dragging, setDragging] = useState(false);

    // Esc 로 닫는다(✕ 와 함께 유일한 닫기 길 — 바깥 클릭은 안 닫는다)
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    // 아래 피크 기본 높이 — 칸 높이의 62%(기억값이 없을 때 한 번)
    useEffect(() => {
        if (h > 0 || wide) return;
        const r = layerRef.current?.getBoundingClientRect();
        if (r && r.height > 0) setH(Math.round(r.height * 0.62));
    }, [h, wide]);

    // 🔴 안쪽 가장자리 끌어 크기 조절 — 넓으면 왼 가장자리(좌우), 좁으면 위 가장자리(위아래). pointerup 에 기억.
    const onResizeDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 무시 */ }
        setDragging(true);
        const layer = layerRef.current?.getBoundingClientRect();
        if (!layer) return;
        const move = (ev: PointerEvent) => {
            if (wide) {
                const next = Math.max(MIN_W, Math.min(layer.width - EDGE_GAP, layer.right - ev.clientX));
                setW(next);
            } else {
                const next = Math.max(MIN_H, Math.min(layer.height - EDGE_GAP, layer.bottom - ev.clientY));
                setH(next);
            }
        };
        const up = () => {
            setDragging(false);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            setW((cur) => { saveNum(WKEY, cur); return cur; });
            setH((cur) => { if (cur > 0) saveNum(HKEY, cur); return cur; });
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }, [wide]);

    const panelStyle = wide
        ? { width: `min(${w}px, calc(100% - ${EDGE_GAP}px))` }
        : { height: h > 0 ? `min(${h}px, calc(100% - ${EDGE_GAP}px))` : '62%' };

    return (
        <div ref={layerRef} className="absolute inset-0 z-30 pointer-events-none">
            {/* ⛔ 바깥 클릭으로 안 닫는다(쥔님) — 옅은 가림막은 두되 클릭을 삼키기만 한다(아래 뷰와 안 섞이게) */}
            <div className="absolute inset-0 bg-text/10 pointer-events-auto peek-scrim" aria-hidden="true" />
            <div
                className={wide
                    ? 'absolute top-0 right-0 bottom-0 bg-panel border-l border-line rounded-l-xl shadow-xl flex flex-col pointer-events-auto peek-from-right overflow-hidden'
                    : 'absolute left-0 right-0 bottom-0 bg-panel border-t border-line rounded-t-xl shadow-xl flex flex-col pointer-events-auto peek-from-bottom overflow-hidden'}
                style={panelStyle}
                role="dialog"
                aria-label="미리보기"
            >
                {/* 🔴 크기 조절 손잡이 — 안쪽 가장자리. 평소 1px 선, 올리면 파랑, 끄는 동안 짙은 파랑(resize-handle 토큰) */}
                <div
                    role="separator"
                    aria-label="미리보기 크기 조절"
                    aria-orientation={wide ? 'vertical' : 'horizontal'}
                    onPointerDown={onResizeDown}
                    className={`resize-handle absolute z-10 touch-none ${wide
                        ? 'top-0 bottom-0 left-0 w-3 -ml-1.5 cursor-col-resize'
                        : 'left-0 right-0 top-0 h-3 -mt-1.5 cursor-row-resize'}`}
                >
                    <div className={`resize-bar absolute ${dragging ? 'is-dragging' : ''} ${wide
                        ? 'top-0 bottom-0 left-1/2 -translate-x-1/2 w-px'
                        : 'left-0 right-0 top-1/2 -translate-y-1/2 h-px'}`} />
                </div>

                <div className="shrink-0 flex items-center justify-between h-header px-pad border-b border-line select-none">
                    <span className="text-[12px] font-semibold text-muted">미리보기{wide ? ' · 오른쪽' : ' · 아래'}</span>
                    <IconButton icon="x" label="미리보기 닫기 (Esc)" onClick={onClose} />
                </div>
                <div className="flex-1 min-h-0 overflow-auto p-4 select-text">{children}</div>
            </div>
        </div>
    );
}
