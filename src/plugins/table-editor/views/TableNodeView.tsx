/**
 * 표 노드 화면 — 노션 「페이지 안 표」처럼: 제목(노드 이름) + 표 하나. 설명문 ⛔.
 *   🔴 데이터는 노드 다리(nodes.ts)에서만 — 표도 노드고 저장·휴지통은 노드 시스템이 쥔다.
 *   표(Table)는 데이터를 안 들고 있다(controlled) — onCommit(tx) 를 받아 이 화면이 문서에 적용하고 setData 한다.
 *   그래서 다시 열어도 남고, 같은 표를 두 탭에 열면 한쪽 편집이 다른 쪽에 비친다.
 */
import { useSyncExternalStore } from 'react';
import { Icon } from '../../../pane-ui-system';
import { Table } from '../Table';
import { DEFAULT_FEATURES } from '../features/modules';
import type { CellDecoration, CellTone } from '../contracts/table';
import { useActiveTable, setActiveTable } from '../store';
import { subscribeTableNodes, getTableRev, tableNodeOf, docOf, writeDoc, applyTx, inTrash } from '../nodes';
import { StartScreen } from './StartScreen';


export function TableNodeView() {
    const activeId = useActiveTable();
    // 노드가 바뀔 때만 다시 읽는다(rev 스냅샷).
    useSyncExternalStore(subscribeTableNodes, getTableRev, getTableRev);

    const node = tableNodeOf(activeId);
    // 보고 있는 표가 없으면(리본으로 처음 열기 · 휴지통으로 감) 시작 화면 — 새로 만들기 + 목록.
    if (!activeId || !node || inTrash(activeId)) return <StartScreen />;

    const doc = docOf(activeId);

    const decorate = (rowId: string, key: string): CellDecoration | undefined => {
        const tone = doc.rowTones?.[rowId] ?? doc.colTones?.[key];
        return tone ? { tone } : undefined;
    };
    const setTone = (kind: 'row' | 'col', id: string, tone?: CellTone): void => {
        const field = kind === 'row' ? 'rowTones' : 'colTones';
        const next = { ...(doc[field] ?? {}) } as Record<string, CellTone>;
        if (tone) next[id] = tone; else delete next[id];
        writeDoc(activeId, { ...doc, [field]: next });
    };

    return (
        // 노션 페이지처럼 — 가운데 정렬된 읽기 폭(≈900px) · 큰 제목 · 넉넉한 여백. 표가 더 넓으면 표 자체가 가로 스크롤.
        <div className="h-full overflow-auto">
            <div className="mx-auto w-full max-w-[900px] px-8 pt-6 pb-16">
                {/* 표 목록으로 돌아가기 — 시작 화면(새로 만들기 + 목록)으로. */}
                <button
                    type="button"
                    onClick={() => setActiveTable(null)}
                    className="mb-4 flex items-center gap-1 h-btn px-2 -ml-2 rounded text-[12px] text-muted hover:text-text hover:bg-text/[0.04] select-none"
                >
                    <Icon name="left" size={12} /> 목록
                </button>
                <h1 className="mb-6 text-[32px] font-bold leading-tight tracking-tight text-text truncate select-none">{node.name}</h1>
                <Table
                    columns={doc.cols}
                    rows={doc.rows}
                    merges={doc.merges}
                    features={DEFAULT_FEATURES}
                    hideColHeader
                    headerRow={doc.headerRow}
                    headerCol={doc.headerCol}
                    decorate={decorate}
                    onSetHeaderRow={(v) => writeDoc(activeId, { ...doc, headerRow: v })}
                    onSetHeaderCol={(v) => writeDoc(activeId, { ...doc, headerCol: v })}
                    footerRow={doc.footerRow}
                    onSetFooterRow={(v) => writeDoc(activeId, { ...doc, footerRow: v })}
                    tableStyle={doc.style}
                    onSetTableStyle={(st) => writeDoc(activeId, { ...doc, style: st })}
                    onColor={setTone}
                    onCommit={(tx) => writeDoc(activeId, applyTx(docOf(activeId), tx))}
                />
            </div>
        </div>
    );
}
