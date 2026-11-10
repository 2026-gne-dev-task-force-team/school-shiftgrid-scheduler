/**
 * 표 노드 화면 — 노션 「페이지 안 표」처럼: 제목(노드 이름) + 표 하나. 설명문 ⛔.
 *   🔴 데이터는 노드 다리(nodes.ts)에서만 — 표도 노드고 저장·휴지통은 항목 시스템이 쥔다.
 *   표(Table)는 데이터를 안 들고 있다(controlled) — onCommit(tx) 를 받아 이 화면이 문서에 적용하고 setData 한다.
 *   그래서 다시 열어도 남고, 같은 표를 두 탭에 열면 한쪽 편집이 다른 쪽에 비친다.
 */
import { useState, useSyncExternalStore } from 'react';
import { Icon } from '../../../pane-ui-system';
import { Table } from '../Table';
import { DEFAULT_FEATURES } from '../features/modules';
import type { CellDecoration, CellTone } from '../contracts/table';
import { useLeafNode } from '../../../pane-ui-system/plugin';
import { useActiveTable, setActiveTable } from '../store';
import { subscribeTableNodes, getTableRev, tableNodeOf, getNodesApi, notifyRemoved, removedTitle, docOf, writeDoc, applyTx, inTrash, richCell } from '../nodes';
import { StartScreen } from './StartScreen';


export function TableNodeView({ leafId }: { leafId?: string }) {
    const activeId = useLeafNode(leafId, useActiveTable(), setActiveTable);   // 새로고침 뒤에도 이 탭의 표
    // 툴바 자리 — Frame 의 toolbar 자리에 놓은 빈 요소. Table 이 단추를 거기에 그린다(본문 스크롤 밖 고정).
    const [barHost, setBarHost] = useState<HTMLElement | null>(null);
    // 노드가 바뀔 때만 다시 읽는다(rev 스냅샷).
    useSyncExternalStore(subscribeTableNodes, getTableRev, getTableRev);

    const node = tableNodeOf(activeId);
    // 보고 있는 표가 없으면(리본으로 처음 열기 · 휴지통으로 감) 시작 화면 — 새로 만들기 + 목록.
    if (!activeId || !node || inTrash(activeId)) return <StartScreen leafId={leafId} />;

    const doc = docOf(activeId);
    const Frame = getNodesApi()?.Frame;
    if (!Frame) return <p className="p-4 text-small text-muted">항목 시스템이 꺼져 있어 화면을 그릴 수 없습니다.</p>;

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

    // 리치 셀 — 칸 글자를 마크다운·노드 칩으로 그리고, 편집 중 `@` 로 칩을 넣는다(노트 꾸러미가 꺼져 있으면 맨 글자).
    const rc = richCell();
    const RichText = rc?.RichText;

    return (
        // 노션 페이지처럼 — 가운데 정렬된 읽기 폭 · 큰 머리 · 넉넉한 여백(틀이 쥔다). 표가 더 넓으면 표 자체가 가로 스크롤.
        <Frame nodeId={activeId} leafId={leafId} scroll
            toolbar={<div ref={setBarHost} />}
            fallback={<Icon name="table" size={22} className="text-muted" />}>
                <Table
                    columns={doc.cols}
                    rows={doc.rows}
                    merges={doc.merges}
                    features={DEFAULT_FEATURES}
                    hideColHeader
                    toolbar
                    toolbarHost={barHost}
                    colTabs={doc.colTabs}
                    headerRow={doc.headerRow}
                    headerCol={doc.headerCol}
                    decorate={decorate}
                    renderText={RichText ? (v) => <RichText text={v} /> : undefined}
                    mention={rc ? { Picker: rc.NodePicker, token: rc.token } : undefined}
                    onSetHeaderRow={(v) => writeDoc(activeId, { ...doc, headerRow: v })}
                    onSetHeaderCol={(v) => writeDoc(activeId, { ...doc, headerCol: v })}
                    footerRow={doc.footerRow}
                    onSetFooterRow={(v) => writeDoc(activeId, { ...doc, footerRow: v })}
                    tableStyle={doc.style}
                    onSetTableStyle={(st) => writeDoc(activeId, { ...doc, style: st })}
                    onColor={setTone}
                    onRemoved={(kind, n, undo, isTop) => notifyRemoved(removedTitle(kind, n), undo, isTop)}
                    onCommit={(tx) => writeDoc(activeId, applyTx(docOf(activeId), tx))}
                />
        </Frame>
    );
}
