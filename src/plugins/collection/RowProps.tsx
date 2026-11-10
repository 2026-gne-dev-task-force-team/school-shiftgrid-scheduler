/**
 * 레코드 행 노드의 속성 칸 — 그 행의 칸들을 PropertyList 한 줄로(노션 행 열기와 같은 결 · 칸은 표와 같은 Cell).
 *   🔴 칸은 레코드 뷰(행 주인)가 낸다(contributes.properties · target = ROW_TYPE).
 */
import { useSyncExternalStore } from 'react';
import type { PropertiesPaneProps } from '../../pane-ui-system/plugin';
import { getNodesApi, subscribeDb, getDbRev, snapshotOf, commit } from './nodes';
import { DB_TYPE } from './schema';
import { PropertyList } from './views/PropertyList';
import type { RecordCellValue } from './contracts/collection';

/** 행이 사는 레코드 뷰(db) — 하위 항목이면 부모 행을 거슬러 올라간다. */
export function dbOf(rowId: string): string | null {
    const api = getNodesApi();
    let id: string | null = rowId;
    for (let i = 0; id && i < 64; i++) {
        id = api?.parent(id) ?? null;
        if (id && api?.get(id)?.type === DB_TYPE) return id;
    }
    return null;
}

export function RowProps({ target }: PropertiesPaneProps) {
    useSyncExternalStore(subscribeDb, getDbRev);   // 표에서 고쳐도 칸이 따라온다
    const dbId = dbOf(target.id);
    const snap = dbId ? snapshotOf(dbId) : null;
    const rec = snap?.records.find((r) => r.id === target.id);
    if (!dbId || !snap || !rec) return null;
    return (
        <PropertyList
            rowId={target.id}
            fields={snap.doc.fields}
            values={rec as Record<string, RecordCellValue>}
            onChange={(key, value) => commit(dbId, { cells: [{ id: target.id, key, value }] })}
            onOptionsChange={(key, options) => commit(dbId, { fields: snap.doc.fields.map((f) => (f.key === key ? { ...f, options } : f)) })}
        />
    );
}
