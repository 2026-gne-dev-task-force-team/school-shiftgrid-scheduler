/**
 * 방 목록 시작 화면 — 보고 있는 목록이 없을 때(리본으로 처음 열기 · 보던 목록이 휴지통으로 감) 뜬다.
 *   안내 문구 대신 「새 방 목록」 + 만들어 둔 목록. 겉모양은 창틀 공통 부품(StartScreen)에 맡기고,
 *   데이터·동작은 노드 다리(nodes.ts)로만 — 만들기는 createList, 열기는 NodesApi.open(= 탐색기 두 번 누르기).
 */
import { useSyncExternalStore } from 'react';
import { StartScreen as StartScreenBase } from '../../../pane-ui-system';
import { subscribeNodes, getListNodes, inTrash, createList, parentNameOf, getNodesApi } from '../nodes';

export function StartScreen() {
    const listNodes = useSyncExternalStore(subscribeNodes, getListNodes, getListNodes);
    const items = listNodes
        .filter((n) => !inTrash(n.id))
        .map((n) => ({ id: n.id, name: n.name, folder: parentNameOf(n.id) }));

    const open = (id: string) => { getNodesApi()?.open(id); };
    const make = () => { const id = createList(); if (id) open(id); };

    return (
        <StartScreenBase
            icon="door"
            title="방 목록"
            description="새로 만들거나, 만들어 둔 방 목록을 고른다."
            newLabel="새 방 목록"
            newHint="빈 목록이 바로 열린다"
            items={items}
            onNew={make}
            onOpen={open}
            disabled={!getNodesApi()}
        />
    );
}
