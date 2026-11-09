/**
 * 레코드 행 노드의 속성 칸 — 그 행의 칸들을 위에서 아래로 보여 준다(노션 행 열기와 같은 결).
 *   🔴 칸은 레코드 뷰(행 주인)가 낸다(contributes.properties · target = ROW_TYPE).
 *   글·숫자 칸만 여기서 고친다(기존 commit 길 그대로) — 고르기·날짜·관계 같은 칸은 표에서 고친다(보기만).
 */
import { useSyncExternalStore } from 'react';
import { PropertyField } from '../../pane-ui-system';
import type { PropertiesPaneProps } from '../../pane-ui-system/plugin';
import { getNodesApi, subscribeDb, getDbRev, snapshotOf, commit } from './nodes';
import { DB_TYPE } from './schema';
import { dateText } from './fields/dates';
import type { RecordField } from './contracts/record-view';

/** 행이 사는 레코드 뷰(db) — 하위 항목이면 부모 행을 거슬러 올라간다. */
function dbOf(rowId: string): string | null {
    const api = getNodesApi();
    let id: string | null = rowId;
    for (let i = 0; id && i < 64; i++) {
        id = api?.parent(id) ?? null;
        if (id && api?.get(id)?.type === DB_TYPE) return id;
    }
    return null;
}

const EDITABLE = new Set(['text', 'number', 'url', 'email', 'phone']);

function show(f: RecordField, v: unknown): string {
    if (v == null || v === '') return '';
    if (f.type === 'date') return dateText(v);
    if (f.type === 'check') return v ? '예' : '아니오';
    if (Array.isArray(v)) return v.map((x) => f.options?.find((o) => o.value === x)?.label ?? String(x)).join(', ');
    if (f.options) return f.options.find((o) => o.value === v)?.label ?? String(v);
    return String(v);
}

export function RowProps({ target }: PropertiesPaneProps) {
    useSyncExternalStore(subscribeDb, getDbRev);   // 표에서 고쳐도 칸이 따라온다
    const dbId = dbOf(target.id);
    const snap = dbId ? snapshotOf(dbId) : null;
    const rec = snap?.records.find((r) => r.id === target.id);
    if (!dbId || !snap || !rec) return null;
    return (
        <div className="flex flex-col gap-2">
            {snap.doc.fields.map((f) => {
                const v = rec[f.key];
                const can = !f.readOnly && EDITABLE.has(f.type);
                const set = (s: string) => {
                    const value = f.type === 'number' ? (s.trim() === '' ? null : Number(s)) : s;
                    if (typeof value === 'number' && Number.isNaN(value)) return;
                    commit(dbId, { cells: [{ id: target.id, key: f.key, value }] });
                };
                return <PropertyField key={f.key} label={f.label} value={show(f, v)} onCommit={can ? set : undefined} />;
            })}
        </div>
    );
}
