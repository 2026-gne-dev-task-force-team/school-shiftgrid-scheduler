/**
 * 가운데 편집 영역 — 레이아웃 트리(창/스플릿)를 그린다. VSCode 처럼 좌우·상하로 갈라 나란히 본다.
 * 🔴 창은 표 id 만 들고 Project 에서 표를 끌어와 비춘다 — 같은 표를 두 창에 열면 한쪽 수정이 바로 반영된다.
 */
import { useCallback, useRef } from 'react';
import { useV2 } from '../store';
import type { PaneNode } from '../ops';
import { sheetAxes } from '../axes';
import { cellTextOf, rowHeightOf, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT } from '../model';
import { Grid } from './Grid';
import { Icon } from '../../ui/parts/Icon';

export function EditorArea() {
    const { layout } = useV2();
    return <div className="h-full w-full min-h-0 min-w-0">{renderPane(layout.root)}</div>;
}

function renderPane(node: PaneNode) {
    if (node.kind === 'window') return <WindowPane key={node.id} winId={node.id} />;
    return <SplitPane key={node.id} node={node} />;
}

function SplitPane({ node }: { node: Extract<PaneNode, { kind: 'split' }> }) {
    const { setRatio } = useV2();
    const ref = useRef<HTMLDivElement | null>(null);
    const isRow = node.dir === 'row'; // 좌우
    const pct = Math.round(node.ratio * 100);

    const onDrag = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const onMove = (ev: MouseEvent) => {
            const r = isRow ? (ev.clientX - rect.left) / rect.width : (ev.clientY - rect.top) / rect.height;
            setRatio(node.id, r);
        };
        const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [isRow, node.id, setRatio]);

    return (
        <div ref={ref} className={`h-full w-full min-h-0 min-w-0 flex ${isRow ? 'flex-row' : 'flex-col'}`}>
            <div className="min-h-0 min-w-0 overflow-hidden" style={isRow ? { width: `${pct}%` } : { height: `${pct}%` }}>
                {renderPane(node.a)}
            </div>
            <div
                onMouseDown={onDrag}
                className={`shrink-0 bg-line hover:bg-accent transition-colors ${isRow ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}`}
                title="끌어서 크기 조절"
            />
            <div className="min-h-0 min-w-0 overflow-hidden flex-1">{renderPane(node.b)}</div>
        </div>
    );
}

function WindowPane({ winId }: { winId: string }) {
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
                    <button className="w-7 h-7 grid place-items-center rounded text-muted hover:text-text hover:bg-panel2 text-[15px] leading-none" title="좌우로 가르기" onClick={() => st.split(winId, 'row')}>
                        ⬌
                    </button>
                    <button className="w-7 h-7 grid place-items-center rounded text-muted hover:text-text hover:bg-panel2 text-[15px] leading-none" title="상하로 가르기" onClick={() => st.split(winId, 'col')}>
                        ⬍
                    </button>
                    {Object.keys(st.layout.windows).length > 1 && (
                        <button className="w-7 h-7 grid place-items-center rounded text-muted hover:text-bad hover:bg-panel2" title="이 창 닫기" onClick={() => st.closePane(winId)}>
                            <Icon name="x" size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* 표 위 작은 툴바 — 줄 간격을 열어둔 채로 바로 조절(모듈 1.1 ④) */}
            {sheet && <GridToolbar sheetId={sheet.id} />}

            {/* 본문 */}
            <div className="flex-1 min-h-0 overflow-auto p-3 bg-bg">
                {sheet ? (
                    <GridFor sheetId={sheet.id} />
                ) : (
                    <div className="h-full grid place-items-center text-muted text-[13px]">
                        왼쪽에서 표를 더블클릭해 엽니다
                    </div>
                )}
            </div>
        </div>
    );
}

/** 표 위 툴바 — 줄 간격(행 높이) 슬라이더. 표마다 저장된다 */
function GridToolbar({ sheetId }: { sheetId: string }) {
    const st = useV2();
    const sheet = st.getSheet(sheetId);
    if (!sheet) return null;
    const h = rowHeightOf(sheet);
    return (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1 bg-panel border-b border-line text-[11.5px] text-muted">
            <span className="shrink-0">줄 간격</span>
            <input
                type="range" min={MIN_ROW_HEIGHT} max={MAX_ROW_HEIGHT} step={1} value={h}
                onChange={(e) => st.setRowHeight(sheetId, Number(e.target.value))}
                className="w-40 accent-accent" title="격자 줄 간격(행 높이)" />
            <span className="shrink-0 tabular-nums w-10">{h}px</span>
        </div>
    );
}

/** 한 표의 격자 — Project 에서 끌어와(단일 상태) 비춘다 */
function GridFor({ sheetId }: { sheetId: string }) {
    const st = useV2();
    const sheet = st.getSheet(sheetId);
    if (!sheet) return null;
    const { cols, rows } = sheetAxes(sheet);
    return (
        <Grid
            cols={cols}
            rows={rows}
            corner="교시"
            rowHeight={rowHeightOf(sheet)}
            getText={(c, r) => cellTextOf(sheet.cells[`${c}:${r}`])}
            onCommit={(c, r, text) => st.setCell(sheetId, c, r, text)}
        />
    );
}
