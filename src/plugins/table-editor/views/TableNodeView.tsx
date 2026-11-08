/**
 * 표 노드 화면 — 노션 「페이지 안 표」처럼: 제목(노드 이름) + 표 하나. 설명문 ⛔.
 *   🔴 데이터는 노드 다리(nodes.ts)에서만 — 표도 노드고 저장·휴지통은 노드 시스템이 쥔다.
 *   표(Table)는 데이터를 안 들고 있다(controlled) — onCommit(tx) 를 받아 이 화면이 문서에 적용하고 setData 한다.
 *   그래서 다시 열어도 남고, 같은 표를 두 탭에 열면 한쪽 편집이 다른 쪽에 비친다.
 */
import { useSyncExternalStore } from 'react';
import { Table } from '../Table';
import type { CellDecoration, CellTone } from '../contracts/table';
import { useActiveTable } from '../store';
import { subscribeTableNodes, getTableRev, tableNodeOf, docOf, writeDoc, applyTx } from '../nodes';

// 노션 단순 표 묶음 — 행·열 늘리고 줄이기·열 폭·칸 합치기·머리 고정. (체크칸·검증·행 높이는 뺀다.)
const FEATURES = ['rows', 'axis-edit', 'col-resize', 'merge', 'sticky-headers', 'paste-policy:append', 'history'];

export function TableNodeView() {
    const activeId = useActiveTable();
    // 노드가 바뀔 때만 다시 읽는다(rev 스냅샷).
    useSyncExternalStore(subscribeTableNodes, getTableRev, getTableRev);

    const node = tableNodeOf(activeId);
    if (!activeId || !node) {
        return (
            <div className="h-full flex items-center justify-center p-6 text-center text-muted select-none">
                왼쪽 탐색기에서 「새로 만들기 ▸ 표」로 표를 만들고 열면 여기에 뜬다.
            </div>
        );
    }

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
            <div className="mx-auto w-full max-w-[900px] px-8 pt-12 pb-16">
                <h1 className="mb-6 text-[32px] font-bold leading-tight tracking-tight text-text truncate select-none">{node.name}</h1>
                <Table
                    columns={doc.cols}
                    rows={doc.rows}
                    merges={doc.merges}
                    features={FEATURES}
                    hideColHeader
                    headerRow={doc.headerRow}
                    headerCol={doc.headerCol}
                    decorate={decorate}
                    onSetHeaderRow={(v) => writeDoc(activeId, { ...doc, headerRow: v })}
                    onSetHeaderCol={(v) => writeDoc(activeId, { ...doc, headerCol: v })}
                    onColor={setTone}
                    onCommit={(tx) => writeDoc(activeId, applyTx(docOf(activeId), tx))}
                />
            </div>
        </div>
    );
}
