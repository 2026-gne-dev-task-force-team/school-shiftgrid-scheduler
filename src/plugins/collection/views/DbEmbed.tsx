/**
 * 컬렉션 끼워 넣기 모습(P5 · R3-E) — 다른 노드(페이지 블록) 안에 이 컬렉션이 어떻게 보일지.
 *   · 기본(view 없음) = 링크 한 줄(아이콘+이름 · 누르면 연다) — 옛 끼움과 같은 모습.
 *   · view 'inline' = 노션 「인라인 데이터베이스」: 이름 머리 + 표 한 벌(DbTable)이 그 자리에서 보이고 편집된다.
 *     🔴 쓰기는 탭 화면과 같은 commit(노드 다리) — 같은 노드라 원본이 바뀐다. 줄 열기(→)는 미리보기 창이 없어 뺀다.
 */
import { useSyncExternalStore } from 'react';
import { Icon, pressProps } from '../../../pane-ui-system';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import type { EmbedProps } from '../../explorer/contracts/nodes';
import { getDbRev, getNodesApi, snapshotOf, subscribeDb } from '../nodes';
import { DbTable } from './DbView';
import { openRecordTab } from '../tab-open';

export function DbEmbed({ nodeId, view, host }: EmbedProps & { host: PluginHost }) {
    useSyncExternalStore(subscribeDb, getDbRev, getDbRev);
    const api = getNodesApi();
    const node = api?.get(nodeId);
    if (!api || !node) return null;
    const head = (cls: string) => (
        <div {...pressProps(() => api.open(nodeId))} className={cls}>
            {node.icon ? <span>{node.icon}</span> : <Icon name="database" size={14} className="text-muted" />}
            <span className="truncate">{node.name}</span>
        </div>
    );
    if (view !== 'inline') return head('my-1 flex items-center gap-2 w-full text-left px-2 py-1.5 rounded border border-line text-body text-text hover:bg-text/[0.04]');
    const snap = snapshotOf(nodeId);
    return (
        <div data-db-inline={nodeId} className="flex flex-col">
            {head('flex items-center gap-2 px-3 py-1.5 border-b border-line text-body font-semibold text-text cursor-pointer hover:underline')}
            {snap && <DbTable host={host} snap={snap} onOpenRecordTab={(rowId) => { openRecordTab(host, rowId); }} />}
        </div>
    );
}
