/**
 * 레코드 줄 문서 — 줄을 열면(→) 미리보기에 그 줄의 칸들 + 페이지 문서(노션 줄 열기와 같은 결 · 쥔님 2026-11-09).
 *   🔴 문서 편집기는 페이지 편집기 꾸러미가 page-doc 약속으로 내준다(supports) — 없으면 칸만 보인다.
 *   문서는 줄 노드 data.body 에 산다(레코드 뷰는 속을 안 읽는다 — 저장만 commit(body) 로).
 */
import { useSyncExternalStore } from 'react';
import type { PluginHost } from '../../pane-ui-system/plugin';
// 🔴 import type 만 — page-doc 약속 타입은 페이지 편집기 꾸러미 contracts 에서(값은 host.modules.use).
import type { PageDocApi } from '../page/contracts/page-doc';
import { RowProps } from './RowProps';
import { commit, getDbRev, snapshotOf, subscribeDb, getNodesApi } from './nodes';

export function RowDoc({ host, dbId, rowId }: { host: PluginHost; dbId: string; rowId: string }) {
    useSyncExternalStore(subscribeDb, getDbRev, getDbRev);
    const snap = snapshotOf(dbId);
    const node = getNodesApi()?.get(rowId);
    if (!snap || !node) return <p className="text-[12px] text-muted">이 줄이 없어졌습니다.</p>;
    const pd = host.modules.use<PageDocApi>('page-doc');
    const body = (node.data as { body?: unknown } | undefined)?.body;
    return (
        <div className="flex flex-col gap-3">
            <RowProps host={host} target={{ type: node.type, id: rowId }} />
            {pd ? (
                <div className="border-t border-line -mx-4">
                    <pd.PageDoc
                        host={host}
                        docKey={rowId}
                        value={body}
                        onChange={(v) => commit(dbId, { body: [{ id: rowId, body: v }] })}
                        title={node.name}
                        onRename={(name) => commit(dbId, { cells: [{ id: rowId, key: snap.doc.titleKey, value: name }] })}
                    />
                </div>
            ) : (
                <p className="text-[12px] text-muted">페이지 편집기를 켜면 이 줄에 문서를 쓸 수 있습니다.</p>
            )}
        </div>
    );
}
