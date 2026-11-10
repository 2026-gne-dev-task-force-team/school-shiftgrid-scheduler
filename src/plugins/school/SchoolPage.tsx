/**
 * 학교 열기 페이지 — 머리(이름) · 학교 칸(학교급·메모) · 본문(노션식 블록). 컬렉션 RecordPage 한 벌을 그대로 쓴다(page 폴더는 안 건드린다).
 *   값은 노드 data.values · 이름은 노드 이름 · 본문은 노드 body.
 */
import { useEffect, useReducer, useSyncExternalStore } from 'react';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { RecordViewApi, RecordCellValue } from '../collection/contracts/collection';
import { SCHOOL_FIELDS } from './config';
import { getActiveSchool, getNodes, subscribeActiveSchool } from './nodes';

export function SchoolPage({ host }: { host: PluginHost }) {
    const id = useSyncExternalStore(subscribeActiveSchool, getActiveSchool, getActiveSchool);
    const [, bump] = useReducer((n: number) => n + 1, 0);
    const nodes = getNodes();
    useEffect(() => { const d = nodes?.subscribe(() => bump()); return () => d?.dispose(); }, [nodes]);
    const rv = host.modules.use<RecordViewApi>('collection');
    const node = id ? nodes?.get(id) : undefined;
    if (!nodes || !node || nodes.isTrashed(node.id)) return <p className="text-small text-muted p-4">탐색기에서 학교를 누르면 여기서 열립니다.</p>;
    if (!rv) return <p className="text-small text-muted p-4">컬렉션 꾸러미가 꺼져 있어 칸을 그릴 수 없습니다.</p>;
    const values = ((node.data as { values?: Record<string, RecordCellValue> } | null)?.values) ?? {};
    return (
        <div className="p-4 max-w-xl">
            <rv.RecordPage
                host={host} id={node.id} fields={SCHOOL_FIELDS}
                values={{ ...values, name: node.name }}
                onChange={(key, v) => {
                    if (key === 'name') { const t = String(v ?? '').trim(); if (t) nodes.rename(node.id, t); return; }
                    nodes.setData(node.id, { ...(node.data as object | null), values: { ...values, [key]: v } });
                }}
                onRename={(n) => { const t = n.trim(); if (t) nodes.rename(node.id, t); }}
            />
        </div>
    );
}
