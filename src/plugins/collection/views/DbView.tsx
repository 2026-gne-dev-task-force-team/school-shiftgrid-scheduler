/**
 * 레코드 뷰 노드 화면 — 노션 「데이터베이스 페이지」처럼: 제목(노드 이름) + 표 하나. 설명문 ⛔.
 *   🔴 데이터는 노드 다리(nodes.ts)에서만 — 레코드 뷰도 그 행도 노드고, 저장·휴지통·되돌리기는 노드 시스템이 쥔다.
 *   RecordView 는 데이터를 안 들고 있다(controlled) — 콜백을 받아 이 화면이 한 묶음(commit)으로 노드에 쓴다.
 *   ⌘Z·⇧⌘Z 는 탐색기의 되돌리기 명령을 부른다(나무 전체 스냅샷 — 이 화면의 변경도 거기 쌓인다).
 */
import { useCallback, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent } from 'react';
import type { ViewProps } from '../../../pane-ui-system';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import { Icon, IconPicker, undoKey } from '../../../pane-ui-system';
import { RecordView } from '../RecordView';
import { StartScreen } from './StartScreen';
import { RowDoc } from '../RowDoc';
import type { CellChange, ConvertPlan, PasteRequest, RecordCellValue, RecordField, ViewDef } from '../RecordView';
import { buildPaste } from '../paste';
import { isImeEnter } from '../fields/ime';
import { blankDb } from '../schema';
import {
    commit, getActiveDb, getDbRev, indentRow, outdentRow, renameDb, reorderRow, restoreTrashedRows, setDbIcon,
    snapshotOf, subscribeDb, toggleRowCollapse,
} from '../nodes';

function useDbSnapshot() {
    const rev = useSyncExternalStore(subscribeDb, getDbRev, getDbRev);
    void rev;
    return snapshotOf(getActiveDb());
}

function TitleInput({ id, name }: { id: string; name: string }) {
    const [text, setText] = useState(name);
    const [seen, setSeen] = useState(name);
    if (seen !== name) { setSeen(name); setText(name); }   // 밖(탐색기)에서 이름이 바뀌면 따라간다
    const done = () => { if (text.trim() !== name) renameDb(id, text); };
    return (
        <input
            data-rv-db-title
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={done}
            onKeyDown={(e) => { if (isImeEnter(e)) return; if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="w-full bg-transparent text-[28px] font-bold leading-tight tracking-tight text-text outline-none"
        />
    );
}

export function DbView({ host, peek }: ViewProps & { host: PluginHost }) {
    const snap = useDbSnapshot();

    const onKeyDown = useCallback((e: KeyboardEvent) => {
        const tgt = e.target as HTMLElement;
        if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA') return;   // 입력칸은 브라우저 되돌리기에 양보
        const u = undoKey(e);
        if (u) {
            e.preventDefault();
            host.commands.run(u === 'redo' ? 'explorer.redo' : 'explorer.undo');
        }
    }, [host]);

    if (!snap) {
        return <StartScreen />;   // 보고 있는 게 없으면 시작 화면(새로 만들기 + 만들어 둔 목록)
    }
    const { id, doc, records } = snap;

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
        <div className="h-full flex flex-col min-h-0" data-rv-db={id} tabIndex={-1} onKeyDown={onKeyDown}>
            <div className="shrink-0 px-6 pt-6 pb-2 flex items-end gap-3">
                {/* 아이콘 — 탭 안에서 바로(페이지와 같은 결) */}
                <IconPicker icon={doc.icon} onSetIcon={(i) => setDbIcon(id, i)} fallback={<Icon name="table" size={26} className="text-muted" />} sizeClass="text-[28px]" />
                <div className="flex-1 min-w-0"><TitleInput id={id} name={snap.name} /></div>
                {snap.trashedRows > 0 && (
                    <button type="button" data-rv-restore-trash onClick={() => restoreTrashedRows(id)}
                        className="shrink-0 h-row px-2 rounded border border-line text-[12px] text-muted hover:text-text inline-flex items-center gap-1">
                        <Icon name="undo" size={13} />휴지통의 행 {snap.trashedRows}개 복원
                    </button>
                )}
            </div>
            <div className="flex-1 min-h-0">
                <RecordView
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
                    onDeleteRecords={(ids) => commit(id, { removeRows: ids })}
                    onFieldsChange={onFieldsChange}
                    onConvertField={onConvertField}
                    onPaste={onPaste}
                    onReorder={(rowId, beforeId) => reorderRow(id, rowId, beforeId)}
                    // 줄 열기(→) — 미리보기에 그 줄의 칸들 + 페이지 문서(노션 줄 열기)
                    onOpenRecord={(rowId) => peek.show(<RowDoc host={host} dbId={id} rowId={rowId} />, { wideMin: 480 })}
                    tree={{
                        parentOf: (r) => (r.__parent as string | null) ?? null,
                        collapsed: (rowId) => records.find((r) => r.id === rowId)?.__collapsed === true,
                        onToggleCollapse: toggleRowCollapse,
                        onIndent: indentRow,
                        onOutdent: outdentRow,
                    }}
                />
            </div>
        </div>
    );
}
