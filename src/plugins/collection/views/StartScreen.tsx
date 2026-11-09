/**
 * 컬렉션 시작 화면 — 보고 있는 컬렉션가 없을 때(리본으로 처음 열기 · 보던 것이 휴지통으로 감) 뜬다(쥔님 2026-11-09).
 *   다른 목록 꾸러미와 같은 결: 「새 컬렉션」 + 만들어 둔 목록. 겉모양은 창틀 공통 부품(StartScreen)에 맡긴다.
 *   열기는 「보고 있는 컬렉션」를 바꾸는 것뿐 — 이 화면이 곧 그 탭이라 다시 열 필요가 없다.
 */
import { useSyncExternalStore } from 'react';
import { StartScreen as StartScreenBase } from '../../../pane-ui-system';
import { subscribeDb, getDbRev, liveDbs, createDb, setActiveDb, getNodesApi } from '../nodes';

export function StartScreen() {
    useSyncExternalStore(subscribeDb, getDbRev, getDbRev);
    const items = liveDbs();
    const make = () => { const id = createDb(); if (id) setActiveDb(id); };
    return (
        <StartScreenBase
            icon="table"
            title="컬렉션"
            description="새로 만들거나, 만들어 둔 컬렉션를 고른다."
            newLabel="새 컬렉션"
            newHint="빈 컬렉션가 바로 열린다"
            items={items}
            onNew={make}
            onOpen={setActiveDb}
            disabled={!getNodesApi()}
        />
    );
}
