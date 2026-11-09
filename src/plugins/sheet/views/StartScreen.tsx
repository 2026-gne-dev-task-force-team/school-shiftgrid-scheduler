/**
 * 표 시작 화면 — 보고 있는 표가 없을 때(리본으로 처음 열기 · 보던 표가 휴지통으로 감) 뜬다.
 *   안내 문구 대신 「새 표」 + 만들어 둔 표 목록. 겉모양은 창틀 공통 부품(StartScreen)에 맡기고,
 *   데이터·동작은 노드 다리(nodes.ts)로만 — 만들기는 createTable, 열기는 NodesApi.open(= 탐색기 두 번 누르기).
 */
import { useSyncExternalStore } from 'react';
import { StartScreen as StartScreenBase } from '../../../pane-ui-system';
import { subscribeTableNodes, getTableRev, liveTables, createTable, parentNameOf, getNodesApi } from '../nodes';

export function StartScreen() {
    // 노드가 바뀌면 다시 읽는다(rev 스냅샷).
    useSyncExternalStore(subscribeTableNodes, getTableRev, getTableRev);
    const items = liveTables().map((n) => ({ id: n.id, name: n.name, folder: parentNameOf(n.id) }));

    const open = (id: string) => { getNodesApi()?.open(id); };
    const make = () => { const id = createTable(); if (id) open(id); };

    return (
        <StartScreenBase
            icon="table"
            title="표"
            description="새로 만들거나, 만들어 둔 표를 고른다."
            newLabel="새 표"
            newHint="빈 표(3×3)가 바로 열린다"
            items={items}
            onNew={make}
            onOpen={open}
            disabled={!getNodesApi()}
        />
    );
}
