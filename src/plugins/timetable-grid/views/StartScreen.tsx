/**
 * 시간표 시작 화면 — 보고 있는 시간표가 없을 때(리본으로 처음 열었을 때 · 보던 표가 휴지통으로 갔을 때) 뜬다.
 *   쥔님(2026-11-08 21:14): 「리본에서 열 때 선택된 게 없으면 새 시간표 만들기나 있는 시간표 목록 보여주는 첫 화면」.
 *   🔴 데이터는 노드 다리(nodes.ts)에서만 — 만들기는 createSheet, 열기는 NodesApi.open(= 탐색기 두 번 누르기와 같은 길).
 *   겉모양은 창틀 공통 부품(StartScreen) — 손 복제를 버렸다(R3).
 *   ⛔ 아무것도 묻지 않는다 — 「새 시간표」 한 번이면 빈 표가 바로 열린다(명세 「처음 켰을 때」).
 */
import { useSyncExternalStore } from 'react';
import { StartScreen as StartScreenBase } from '../../../pane-ui-system';
import { useLauncherTab } from '../../../pane-ui-system/plugin';
import {
    subscribeNodes, getSheetNodes, inTrash, createSheet, parentNameOf, getNodesApi,
} from '../nodes';

export function StartScreen({ leafId }: { leafId?: string }) {
    useLauncherTab(leafId, '새 시간표');
    const sheetNodes = useSyncExternalStore(subscribeNodes, getSheetNodes, getSheetNodes);
    const items = sheetNodes.filter((n) => !inTrash(n.id))
        .map((n) => ({ id: n.id, name: n.name, folder: parentNameOf(n.id), emoji: n.icon || undefined }));

    const open = (id: string) => { getNodesApi()?.open(id); };
    const make = () => { const id = createSheet(); if (id) open(id); };

    return (
        <StartScreenBase
            icon="schedule"
            title="시간표"
            noun="시간표"
            newLabel="새 시간표"
            newHint="빈 표(월~금 × 6행)가 바로 열린다"
            items={items}
            onNew={make}
            onOpen={open}
            disabled={!getNodesApi()}
        />
    );
}
