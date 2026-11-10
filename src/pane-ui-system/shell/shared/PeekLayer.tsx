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
import { isImeEnter } from '../../primitives/ime';
import { PeekBarProvider, usePeekBarState } from './peek-bar';
import { isMod, keyLabel } from '../../platform-keys';

const DEFAULT_W = 640;   // 문서급 기본 폭(쥔님: 480→640 이상)
const MIN_W = 320;
const MIN_H = 200;
const EDGE_GAP = 48;     // 칸 가장자리와 최소 간격(피크가 칸을 꽉 덮지 않게 — 덮기 쪽)
/** 밀기일 때 본문이 남겨야 하는 최소 폭 — 이보다 좁아지면(옛 EDGE_GAP 48 → 본문 ~60px 찌그러짐) 밀지 않고 덮는다. */
export const PEEK_BODY_MIN = 480;
/** 칸이 이 폭 이상이어야 「밀기」가 선다(피크 최소 폭 + 본문 최소 폭). */
export const PEEK_PUSH_MIN = MIN_W + PEEK_BODY_MIN;
/** 칸이 이 폭 이상이면(밀기엔 모자라도) 오른쪽 옆에 **겹쳐** 띄운다 — 본문 폭·높이는 그대로. 이보다 좁으면(모바일 꼴) 아래 시트. */
export const PEEK_OVERLAY_MIN = 520;
/** 피크가 서는 방식 — push 밀기(오른쪽, 본문이 좁아짐) · overlay 겹침(오른쪽, 본문 위) · bottom 아래 시트(좁은 칸) */
export type PeekMode = 'push' | 'overlay' | 'bottom';
export function peekModeFor(width: number, wideMin?: number): PeekMode {
    if (width >= Math.max(PEEK_PUSH_MIN, wideMin ?? 0)) return 'push';
    return width >= PEEK_OVERLAY_MIN ? 'overlay' : 'bottom';
}

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

export function PeekLayer({ mode, closing = false, onClose, onOpenInTab, children }: { mode: PeekMode; closing?: boolean; onClose: () => void; onOpenInTab?: () => void; children: ReactNode }) {
    const wide = mode !== 'bottom';   // 오른쪽에 서는가(밀기·겹침) — 좌우로 크기 조절
    const push = mode === 'push';
    const layerRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    // 기기별로 기억한 크기 — 폭(오른쪽 피크)·높이(아래 피크). 없으면 문서급 기본
    const [w, setW] = useState(() => loadNum(WKEY, DEFAULT_W));
    const [h, setH] = useState(() => loadNum(HKEY, 0));   // 0 = 아직 없음 → 마운트 때 62% 로
    const [dragging, setDragging] = useState(false);
    const bar = usePeekBarState();

    // 연 자리 — 렌더에서 잡는다. 닫히면(Esc·✕) 초점이 BODY 로 빠졌을 때 거기로 돌려준다(다른 곳을 눌러 옮긴 초점은 존중)
    const [opener] = useState(() => (typeof document !== 'undefined' ? document.activeElement as HTMLElement | null : null));
    useEffect(() => () => {
        const a = document.activeElement;
        if ((!a || a === document.body) && opener && opener !== document.body && opener.isConnected) opener.focus?.({ preventScroll: true });
    }, [opener]);

    // 열면 초점이 미리보기 안 첫 조작 요소로(R3-C) — 본문 먼저, 없으면 머리줄. 안쪽이 이미 초점을 가져갔으면(autoFocus) 덮지 않는다.
    //   ⭐ 위 「닫으면 연 자리로」는 그대로 — opener 는 이 효과 전에 렌더에서 잡혔다.
    useEffect(() => {
        const layer = layerRef.current;
        if (!layer) return;
        const a = document.activeElement;
        if (a && a !== document.body && layer.contains(a)) return;
        const sel = 'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
        (bodyRef.current?.querySelector<HTMLElement>(sel) ?? layer.querySelector<HTMLElement>(sel))?.focus({ preventScroll: true });
    }, []);

    // Esc 로 닫는다(✕ 와 함께 유일한 닫기 길 — 바깥 클릭은 안 닫는다)
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
            // ⌘Enter(윈도 Ctrl+Enter) = 탭으로 열기 — 초점이 이 피크 안에 있을 때만(다른 칸의 ⌘Enter 를 뺏지 않게)
            if (e.key === 'Enter' && !isImeEnter(e) && isMod(e) && onOpenInTab && layerRef.current?.contains(document.activeElement)) {
                e.preventDefault(); e.stopPropagation(); onOpenInTab();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose, onOpenInTab]);

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
        // 오른쪽(밀기·겹침)이면 이 층이 곧 패널이라 한계는 부모(칸) 폭으로 잰다 · 아래 시트면 층이 칸 전체다
        const layer = (wide ? layerRef.current?.parentElement : layerRef.current)?.getBoundingClientRect();
        if (!layer) return;
        const move = (ev: PointerEvent) => {
            if (wide) {
                const next = Math.max(MIN_W, Math.min(layer.width - (push ? PEEK_BODY_MIN : EDGE_GAP), layer.right - ev.clientX));
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
    }, [wide, push]);

    // 🔴 ⭐ 넓으면 **민다**, 좁으면 **덮는다** — 요구명세 갈림 2(*"사이드 피크는 민다. 모바일은 밀지 않고 덮는다"*).
    //    밀기: 이 층이 칸의 flex 형제로 서서 본문이 그만큼 좁아진다(노션 side peek). 덮기: 칸 위에 absolute 로 아래에서 올라온다.
    //    ⛔ 가림막(딤) 없음 · 바깥 클릭을 삼키지도 닫지도 않는다 — 쥔님 2026-11-01 19:08 *"알림창이나 동작 막는 창이 아니라
    //    목록에서 세부 내용을 보는 창 · 탐색의 흐름은 끊기면 안 돼"*. 뒤의 목록은 그대로 눌리고, 미리보기는 ✕/Esc 로만 닫는다.
    //    겹침(overlay): 밀기엔 칸이 모자라지만 아래 시트까지 갈 만큼 좁진 않을 때 — 본문 상자 위 오른쪽에 absolute 로 얹는다(본문 폭·높이 그대로, 달력이 시간 줄 서너 개로 눌리던 것 방지).
    const rootClass = push
        ? `relative h-full shrink-0 z-30 pointer-events-auto overflow-hidden ${closing ? 'peek-shrink' : 'peek-grow'}`
        : wide
            ? `absolute top-0 bottom-0 right-0 z-30 pointer-events-auto overflow-hidden ${closing ? 'peek-shrink' : 'peek-grow'}`
            : 'absolute inset-0 z-30 pointer-events-none';
    const rootStyle = wide ? { width: `min(${w}px, calc(100% - ${push ? PEEK_BODY_MIN : EDGE_GAP}px))` } : undefined;
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
                    {onOpenInTab && <IconButton icon="arrowRight" label={`탭으로 열기 (${keyLabel('Mod+Enter')})`} data={{ 'data-peek-open-tab': '' }} onClick={onOpenInTab} />}
                    <IconButton icon="x" label="미리보기 닫기 (Esc)" onClick={onClose} />
                </div>
                <PeekBarProvider slot={bar.slot} claim={bar.claim}>
                    <div ref={bodyRef} className="flex-1 min-h-0 overflow-auto p-4">{children}</div>
                </PeekBarProvider>
            </div>
        </div>
    );
}
