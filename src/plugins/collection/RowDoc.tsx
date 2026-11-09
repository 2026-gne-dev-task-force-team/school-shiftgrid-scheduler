/**
 * 레코드 뷰(db) 행 열기 페이지 — RecordPage 한 벌(Q5 R5): 노드 틀(머리·경로·⋯) · 속성 목록 · 본문(노션 줄 열기 · 쥔님 2026-11-09).
 *   🔴 칸은 행이 사는 db 의 칸 정의 그대로(표와 같은 Cell). 이름·본문은 commit 한 길로 — 제목 칸 값과 노드 이름이 같이 간다.
 *   문서는 줄 노드 공통 body 칸에 산다(레코드 뷰는 속을 안 읽는다 — 저장만 commit(body) 로).
 */
import { useSyncExternalStore } from 'react';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { RecordCellValue } from './contracts/collection';
import { RecordPage } from './views/RecordPage';
import { commit, getDbRev, snapshotOf, subscribeDb, getNodesApi } from './nodes';

export function RowDoc({ host, dbId, rowId }: { host: PluginHost; dbId: string; rowId: string }) {
    useSyncExternalStore(subscribeDb, getDbRev, getDbRev);
    const snap = snapshotOf(dbId);
    const node = getNodesApi()?.get(rowId);
    const rec = snap?.records.find((r) => r.id === rowId);
    if (!snap || !node || !rec) return <p className="text-small text-muted">이 줄이 없어졌습니다.</p>;
    return (
        <RecordPage
            host={host}
            id={rowId}
            fields={snap.doc.fields}
            values={rec as Record<string, RecordCellValue>}
            onChange={(key, value) => commit(dbId, { cells: [{ id: rowId, key, value }] })}
            onOptionsChange={(key, options) => commit(dbId, { fields: snap.doc.fields.map((f) => (f.key === key ? { ...f, options } : f)) })}
            onRename={(name) => commit(dbId, { cells: [{ id: rowId, key: snap.doc.titleKey, value: name }] })}
            onBody={(v) => commit(dbId, { body: [{ id: rowId, body: v }] })}
        />
    );
}
