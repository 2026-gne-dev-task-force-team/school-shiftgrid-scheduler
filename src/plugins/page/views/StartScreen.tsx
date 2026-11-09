/**
 * 페이지 시작 화면 — 보고 있는 페이지가 없을 때(리본으로 처음 열기 · 보던 페이지가 휴지통으로 감) 뜬다.
 *   안내 문구 대신 「새 페이지」 + 만들어 둔 페이지 목록. 겉모양은 창틀 공통 부품(StartScreen)에 맡기고,
 *   데이터·동작은 노드 다리(nodes.ts)로만 — 만들기는 createPage, 열기는 NodesApi.open(= 탐색기 두 번 누르기).
 */
import { useSyncExternalStore } from 'react';
import { StartScreen as StartScreenBase, focusWhenReady } from '../../../pane-ui-system';
import { useLauncherTab } from '../../../pane-ui-system/plugin';
import { subscribePageNodes, getPageRev, livePages, createPage, parentNameOf, getNodesApi } from '../nodes';

export function StartScreen({ leafId }: { leafId?: string }) {
    useLauncherTab(leafId, '새 페이지');
    // 노드가 바뀌면 다시 읽는다(rev 스냅샷).
    useSyncExternalStore(subscribePageNodes, getPageRev, getPageRev);
    const items = livePages().map((n) => ({ id: n.id, name: n.name, folder: parentNameOf(n.id), emoji: n.icon || undefined }));

    const open = (id: string) => { getNodesApi()?.open(id); };
    const make = () => { const id = createPage(); if (id) { open(id); focusWhenReady('input[aria-label="페이지 제목"]', true); } };

    return (
        <StartScreenBase
            icon="fileText"
            title="페이지"
            noun="페이지"
            newLabel="새 페이지"
            newHint="빈 페이지가 바로 열린다"
            items={items}
            onNew={make}
            onOpen={open}
            disabled={!getNodesApi()}
        />
    );
}
