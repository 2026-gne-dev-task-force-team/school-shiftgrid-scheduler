/**
 * 가운데 편집 영역 — 레이아웃 트리(창/스플릿)를 그린다. VSCode 처럼 좌우·상하로 갈라 나란히 본다.
 * 🔴 창은 표 id 만 들고 Project 에서 표를 끌어와 비춘다 — 같은 표를 두 창에 열면 한쪽 수정이 바로 반영된다.
 */
import { useCallback, useRef } from 'react';
import { useV2 } from '../store';
import type { PaneNode } from '../ops';
import { TimeGrid } from './TimeGrid';
import { Icon } from '../../ui/parts/Icon';

export function EditorArea({ narrow = false }: { narrow?: boolean }) {
    const { layout } = useV2();
    return <div className="h-full w-full min-h-0 min-w-0">{renderPane(layout.root, narrow)}</div>;
}

function renderPane(node: PaneNode, narrow: boolean) {
    if (node.kind === 'window') return <WindowPane key={node.id} winId={node.id} narrow={narrow} />;
    return <SplitPane key={node.id} node={node} narrow={narrow} />;
}

function SplitPane({ node, narrow }: { node: Extract<PaneNode, { kind: 'split' }>; narrow: boolean }) {
    const { setRatio } = useV2();
    const ref = useRef<HTMLDivElement | null>(null);
    const isRow = node.dir === 'row'; // 좌우
    const pct = Math.round(node.ratio * 100);

    // 🔴 pointer 로 받는다 — mousedown 만 듣던 옛 코드는 손가락에 아무 반응이 없었다
    const dragging = useRef(false);
    const onDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        if (!ref.current) return;
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 무시 */ }
        dragging.current = true;
    }, []);

    const onMove = useCallback((e: React.PointerEvent) => {
        const el = ref.current;
        if (!el || !dragging.current) return;
        const rect = el.getBoundingClientRect();
        const r = isRow ? (e.clientX - rect.left) / rect.width : (e.clientY - rect.top) / rect.height;
        setRatio(node.id, r);
    }, [isRow, node.id, setRatio]);

    const onUp = useCallback(() => { dragging.current = false; }, []);

    return (
        <div ref={ref} className={`h-full w-full min-h-0 min-w-0 flex ${isRow ? 'flex-row' : 'flex-col'}`}>
            <div className="min-h-0 min-w-0 overflow-hidden" style={isRow ? { width: `${pct}%` } : { height: `${pct}%` }}>
                {renderPane(node.a, narrow)}
            </div>
            <div
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                // 손가락으로 잡을 수 있게 좁은 화면에선 띠를 두껍게 — 1px 띠는 손끝에 안 잡힌다
                className={`shrink-0 bg-line hover:bg-accent transition-colors touch-none
                    ${isRow ? (narrow ? 'w-2' : 'w-1') + ' cursor-col-resize' : (narrow ? 'h-2' : 'h-1') + ' cursor-row-resize'}`}
                title="끌어서 크기 조절"
            />
            <div className="min-h-0 min-w-0 overflow-hidden flex-1">{renderPane(node.b, narrow)}</div>
        </div>
    );
}

function WindowPane({ winId, narrow }: { winId: string; narrow: boolean }) {
    const st = useV2();
    const win = st.layout.windows[winId];
    const focused = st.layout.activeWindow === winId;
    if (!win) return null;
    const sheet = st.getSheet(win.active);

    return (
        <div
            className={`h-full min-h-0 flex flex-col border ${focused ? 'border-accent/60' : 'border-line'}`}
            onMouseDown={() => st.focusWindow(winId)}
        >
            {/* 탭 줄 */}
            <div className="shrink-0 flex items-stretch bg-panel border-b border-line overflow-x-auto">
                <div className="flex items-stretch min-w-0">
                    {win.tabs.map((id) => {
                        const s = st.getSheet(id);
                        const active = win.active === id;
                        return (
                            <div key={id}
                                className={`group flex items-center gap-1.5 pl-3 pr-1.5 border-r border-line text-[12.5px] whitespace-nowrap cursor-pointer
                                    ${active ? 'bg-panel2 text-text' : 'text-muted hover:text-text'}`}
                                onClick={() => st.activateTab(winId, id)}>
                                <span className="truncate max-w-[140px]">{s?.name ?? '(없음)'}</span>
                                <button className="w-5 h-5 grid place-items-center rounded hover:bg-line text-muted"
                                    onClick={(e) => { e.stopPropagation(); st.closeTab(winId, id); }} title="탭 닫기">
                                    <Icon name="x" size={12} />
                                </button>
                            </div>
                        );
                    })}
                </div>
                <div className="ml-auto flex items-center gap-0.5 px-1 shrink-0">
                    {/* 좁은 화면에선 창 가르기를 감춘다 — 390px 을 둘로 가르면 양쪽 다 못 쓴다 */}
                    {!narrow && (
                        <>
                            <button className="w-7 h-7 grid place-items-center rounded text-muted hover:text-text hover:bg-panel2 text-[15px] leading-none" title="좌우로 가르기" onClick={() => st.split(winId, 'row')}>
                                ⬌
                            </button>
                            <button className="w-7 h-7 grid place-items-center rounded text-muted hover:text-text hover:bg-panel2 text-[15px] leading-none" title="상하로 가르기" onClick={() => st.split(winId, 'col')}>
                                ⬍
                            </button>
                        </>
                    )}
                    {Object.keys(st.layout.windows).length > 1 && (
                        <button className="w-7 h-7 grid place-items-center rounded text-muted hover:text-bad hover:bg-panel2" title="이 창 닫기" onClick={() => st.closePane(winId)}>
                            <Icon name="x" size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* 본문 */}
            <div className="flex-1 min-h-0 overflow-auto p-1.5 sm:p-3 bg-bg">
                {sheet ? (
                    <TimeGrid sheetId={sheet.id} narrow={narrow} />
                ) : (
                    <div className="h-full grid place-items-center text-muted text-[13px] px-4 text-center">
                        {narrow ? '왼쪽 위 ☰ 를 눌러 표를 고릅니다' : '왼쪽에서 표를 더블클릭해 엽니다'}
                    </div>
                )}
            </div>
        </div>
    );
}
