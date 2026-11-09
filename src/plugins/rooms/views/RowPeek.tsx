/**
 * 줄 미리보기 — 레코드 뷰에서 줄을 열면(→) 뜬다: 칸(속성 칸과 같은 것) + 줄 문서(page-doc 이 있으면).
 *   🔴 문서 편집기는 페이지 편집기 꾸러미가 page-doc 약속으로 내준다(supports) — 없으면 칸만.
 */
import { useSyncExternalStore } from 'react';
import type { PluginHost } from '../../../pane-ui-system/plugin';
// 🔴 import type 만 — page-doc 약속 타입은 페이지 편집기 꾸러미 contracts 에서(값은 host.modules.use).
import type { PageDocApi } from '../../page/contracts/page-doc';
import { RoomProps } from './RoomProps';
import { subscribeNodes, getRoomNodes, bodyOf, setBody, getNodesApi } from '../nodes';

export function RowPeek({ host, id }: { host: PluginHost; id: string }) {
    useSyncExternalStore(subscribeNodes, getRoomNodes);
    const node = getNodesApi()?.get(id);
    if (!node) return <p className="text-[12px] text-muted">이 줄이 없어졌습니다.</p>;
    const pd = host.modules.use<PageDocApi>('page-doc');
    return (
        <div className="flex flex-col gap-3">
            <RoomProps host={host} target={{ type: node.type, id }} />
            {pd && (
                <div className="border-t border-line -mx-4">
                    <pd.PageDoc host={host} docKey={id} value={bodyOf(id)} onChange={(v) => setBody(id, v)}
                        title={node.name} onRename={(n) => getNodesApi()?.rename(id, n)} />
                </div>
            )}
        </div>
    );
}
