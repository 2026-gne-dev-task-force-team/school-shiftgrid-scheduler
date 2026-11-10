/**
 * 레코드 뷰 노드 화면 — 노션 「데이터베이스 페이지」처럼: 제목(노드 이름) + 표 하나. 설명문 ⛔.
 *   🔴 데이터는 노드 다리(nodes.ts)에서만 — 레코드 뷰도 그 행도 노드고, 저장·휴지통·되돌리기는 항목 시스템이 쥔다.
 *   RecordView 는 데이터를 안 들고 있다(controlled) — 콜백을 받아 이 화면이 한 묶음(commit)으로 노드에 쓴다.
 *   ⌘Z·⇧⌘Z 는 탐색기의 되돌리기 명령을 부른다(나무 전체 스냅샷 — 이 화면의 변경도 거기 쌓인다).
 */
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import type { KeyboardEvent } from 'react';
import type { ViewProps } from '../../../pane-ui-system';
import { notifyNodeUndo, type PluginHost } from '../../../pane-ui-system/plugin';
import { Button, EmptyState, Icon, undoKey, useFrameToolbar } from '../../../pane-ui-system';
import { RecordView } from '../RecordView';
import { StartScreen } from './StartScreen';
import { RowDoc } from '../RowDoc';
import { openRecordTab } from '../tab-open';
import type { CellChange, ConvertPlan, PasteRequest, RecordCellValue, RecordField, ViewDef } from '../RecordView';
import { buildPaste } from '../paste';
import { blankDb } from '../schema';
import {
    commit, getActiveDb, getDbRev, getNodesApi, indentRow, moveRowUnder, outdentRow, reorderRow, restoreTrashedRows,
    snapshotOf, subscribeDb, toggleRowCollapse, type DbSnapshot,
} from '../nodes';

function useDbSnapshot() {
    const rev = useSyncExternalStore(subscribeDb, getDbRev, getDbRev);
    void rev;
    return snapshotOf(getActiveDb());
}

/** 지운 직후 「되돌리기」 알림 — 탐색기 지우기와 같은 창구(창틀 notifyNodeUndo). */
function notifyUndo(host: PluginHost, title: string): void {
    notifyNodeUndo(host, getNodesApi(), title, 'collection.removed');
}

export function DbView({ host, peek, leaf }: ViewProps & { host: PluginHost }) {
    const snap = useDbSnapshot();
    const Frame = getNodesApi()?.Frame;
    const bar = useFrameToolbar();   // Frame 툴바 자리(Q12)
    const rootRef = useRef<HTMLDivElement>(null);

    const onKeyDown = useCallback((e: KeyboardEvent) => {
        const tgt = e.target as HTMLElement;
        if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA') return;   // 입력칸은 브라우저 되돌리기에 양보
        const u = undoKey(e);
        if (u) {
            e.preventDefault();
            const cmd = getNodesApi()?.cmd;
            if (cmd) host.commands.run(u === 'redo' ? cmd.redo : cmd.undo);
        }
    }, [host]);

    // 🔴 휴지통에 든 컬렉션은 그리지도 편집도 받지 않는다(페이지·시트·시간표와 같은 동작) — 시작 화면으로
    if (!snap || getNodesApi()?.isTrashed(snap.id)) {
        return <StartScreen leafId={leaf.id} />;   // 보고 있는 게 없으면 시작 화면(새로 만들기 + 만들어 둔 목록)
    }
    const { id } = snap;
    if (!Frame) return <EmptyState icon="warn" title="화면을 그릴 수 없습니다" description="항목 시스템이 꺼져 있습니다." />;

    return (
        <div ref={rootRef} className="h-full flex flex-col min-h-0" data-rv-db={id} tabIndex={-1} onKeyDown={onKeyDown}>
            <Frame nodeId={id} leafId={leaf.id} toolbar={bar.slot}
                headerExtra={snap.trashedRows > 0 && (
                    <Button size="sm" data-rv-restore-trash onClick={() => restoreTrashedRows(id, (title) => host.notify({ level: 'warn', title, key: 'collection.restore' }))}>
                        <Icon name="undo" size={13} /> 휴지통의 행 {snap.trashedRows}개 복원
                    </Button>
                )}>
            <div className="h-full">
                <DbTable host={host} snap={snap} toolbarHost={bar.host}
                    focusRoot={() => rootRef.current?.focus({ preventScroll: true })}
                    onOpenRecord={(rowId) => peek.show(<RowDoc host={host} dbId={id} rowId={rowId} />, { wideMin: 480, openInTab: () => openRecordTab(host, rowId) })}
                    onOpenRecordTab={(rowId) => { openRecordTab(host, rowId); }} />
            </div>
            </Frame>
        </div>
    );
}

/**
 * 표 한 벌(컬렉션 id 하나) — 탭 화면(DbView)과 끼워 넣기 펼침(DbEmbed · R3-E)이 같이 쓴다. 쓰기는 전부 commit(노드 다리) 한 곳.
 *   onOpenRecord 가 없으면 줄 열기(→)가 안 보인다 · focusRoot 는 지운 뒤 초점을 둘 자리(없으면 그대로).
 */
export function DbTable({ host, snap, toolbarHost, onOpenRecord, onOpenRecordTab, focusRoot }: {
    host: PluginHost; snap: DbSnapshot; toolbarHost?: HTMLElement | null; onOpenRecord?: (rowId: string) => void; onOpenRecordTab?: (rowId: string) => void; focusRoot?: () => void;
}) {
    const { id, doc, records } = snap;
    // 접힘 장부 — 행마다 records.find 로 훑으면 행 수² (#50). 레코드가 같은 동안 한 번만 만든다
    const collapsedIds = useMemo(() => new Set(records.filter((r) => r.__collapsed === true).map((r) => r.id)), [records]);
    const onFieldsChange = (fields: RecordField[]) => commit(id, { fields });
    const onViewsChange = (views: ViewDef[]) => commit(id, { views });
    const onCellChange = (rowId: string, key: string, value: RecordCellValue) => commit(id, { cells: [{ id: rowId, key, value }] });
    const onCellsChange = (cells: CellChange[]) => commit(id, { cells });
    const onConvertField = (plan: ConvertPlan) =>
        commit(id, {
            fields: doc.fields.map((f) => (f.key === plan.key ? plan.field : f)),
            cells: plan.changes.map((c) => ({ id: c.id, key: plan.key, value: c.value })),
        });
    const onPaste = (req: PasteRequest) => {
        const plan = buildPaste(doc.fields, req.keys, req.rows);
        commit(id, { fields: plan.fieldsChanged ? plan.fields : undefined, addRows: plan.rows });
    };

    return (
        <RecordView
            toolbarHost={toolbarHost}
            fields={doc.fields}
            records={records}
            getId={(r) => r.id}
            viewKey={`db.${id}`}
            titleKey={doc.titleKey}
            views={doc.views.length > 0 ? doc.views : [blankDb().views[0]]}
            onViewsChange={onViewsChange}
            onCellChange={onCellChange}
            onCellsChange={onCellsChange}
            onAddRecord={() => { commit(id, { addRows: [{}] }); }}
            onDeleteRecords={(ids) => {
                // 지운 행에 있던 초점이 BODY 로 빠지면 ⌘Z 가 어디서도 안 받힌다 — 이 뷰 뿌리로 옮겨 둔다(onKeyDown 이 받는다)
                focusRoot?.();
                commit(id, { removeRows: ids });
                notifyUndo(host, `행 ${ids.length}개를 휴지통으로 옮겼습니다`);
            }}
            onDestructive={(title, run) => {
                getNodesApi()?.batch(run);
                notifyUndo(host, title);
            }}
            onFieldsChange={onFieldsChange}
            onConvertField={onConvertField}
            onPaste={onPaste}
            onReorder={(rowId, beforeId) => reorderRow(id, rowId, beforeId)}
            // 줄 열기(→) — 미리보기에 그 줄의 칸들 + 페이지 문서(노션 줄 열기)
            iconOf={(rowId) => getNodesApi()?.get(rowId)?.icon}
            onOpenRecord={onOpenRecord}
            onOpenRecordTab={onOpenRecordTab}
            tree={{
                parentOf: (r) => (r.__parent as string | null) ?? null,
                collapsed: (rowId) => collapsedIds.has(rowId),
                onToggleCollapse: toggleRowCollapse,
                onIndent: indentRow,
                onOutdent: outdentRow,
                onMoveUnder: moveRowUnder,
                onAddChild: (rowId) => { commit(id, { addRows: [{}], addUnder: rowId }); },
            }}
        />
    );
}
