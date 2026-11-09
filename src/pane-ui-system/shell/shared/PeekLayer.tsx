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
import { PeekBarProvider, usePeekBarState } from './peek-bar';

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

export function PeekLayer({ wide, closing = false, onClose, children }: { wide: boolean; closing?: boolean; onClose: () => void; children: ReactNode }) {
    const layerRef = useRef<HTMLDivElement>(null);
    // 기기별로 기억한 크기 — 폭(오른쪽 피크)·높이(아래 피크). 없으면 문서급 기본
    const [w, setW] = useState(() => loadNum(WKEY, DEFAULT_W));
    const [h, setH] = useState(() => loadNum(HKEY, 0));   // 0 = 아직 없음 → 마운트 때 62% 로
    const [dragging, setDragging] = useState(false);
    const bar = usePeekBarState();

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
        // 넓음(밀기)이면 이 층이 곧 패널이라 한계는 부모(칸) 폭으로 잰다 · 좁음(덮기)이면 층이 칸 전체다
        const layer = (wide ? layerRef.current?.parentElement : layerRef.current)?.getBoundingClientRect();
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

    // 🔴 ⭐ 넓으면 **민다**, 좁으면 **덮는다** — 요구명세 갈림 2(*"사이드 피크는 민다. 모바일은 밀지 않고 덮는다"*).
    //    밀기: 이 층이 칸의 flex 형제로 서서 본문이 그만큼 좁아진다(노션 side peek). 덮기: 칸 위에 absolute 로 아래에서 올라온다.
    //    ⛔ 가림막(딤) 없음 · 바깥 클릭을 삼키지도 닫지도 않는다 — 쥔님 2026-11-01 19:08 *"알림창이나 동작 막는 창이 아니라
    //    목록에서 세부 내용을 보는 창 · 탐색의 흐름은 끊기면 안 돼"*. 뒤의 목록은 그대로 눌리고, 미리보기는 ✕/Esc 로만 닫는다.
    const rootClass = wide
        ? `relative h-full shrink-0 z-30 pointer-events-auto overflow-hidden ${closing ? 'peek-shrink' : 'peek-grow'}`
        : 'absolute inset-0 z-30 pointer-events-none';
    const rootStyle = wide ? { width: `min(${w}px, calc(100% - ${EDGE_GAP}px))` } : undefined;
    const panelStyle = wide ? undefined : { height: h > 0 ? `min(${h}px, calc(100% - ${EDGE_GAP}px))` : '62%' };

    return (
        <div ref={layerRef} className={rootClass} style={rootStyle}>
            <div
                className={wide
                    ? 'absolute inset-0 bg-panel border-l border-line rounded-l-xl shadow-xl flex flex-col overflow-hidden'
                    : `absolute left-0 right-0 bottom-0 bg-panel border-t border-line rounded-t-xl shadow-xl flex flex-col pointer-events-auto overflow-hidden ${closing ? 'peek-to-bottom' : 'peek-from-bottom'}`}
                style={panelStyle}
                role="complementary"
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

                <div className="shrink-0 flex items-center gap-1 h-header px-pad border-b border-line select-none">
                    {/* 노드 틀(nodes.Frame)이 경로·액션바를 이 자리에 그린다 — 틀이 없는 내용이면 옛 「미리보기」 글자 */}
                    <div ref={bar.setSlot} className="flex-1 min-w-0 flex items-center gap-1">
                        {!bar.claimed && <span className="text-small font-semibold text-muted">미리보기</span>}
                    </div>
                    <IconButton icon="x" label="미리보기 닫기 (Esc)" onClick={onClose} />
                </div>
                <PeekBarProvider slot={bar.slot} claim={bar.claim}>
                    <div className="flex-1 min-h-0 overflow-auto p-4">{children}</div>
                </PeekBarProvider>
            </div>
        </div>
    );
}
