/**
 * 「프로젝트 탐색기」 플러그인 — 노드 하이라키 한 벌 + 파일 탐색기 패널(설계 「노드 시스템 요구명세」 N1).
 *   쥔님 2026-11-01: *"노드 타입이나 그런 거는 여기서 규격만 정해주고 … 탐색기처럼 보여주면 돼"*.
 *
 * 🔴 ⛔ activate 는 등록만 한다 — 여기서 탭을 열지 않는다(onFirstRun 에서만 왼쪽 패널을 한 번 연다).
 * ⭐ 내장 타입은 「폴더」 하나뿐 — 교사·시간표 같은 실제 타입은 각 플러그인이 규격에 맞춰 꽂는다(N4).
 * ⭐ 모든 동작은 명령(new-folder·rename·remove·collapse-all·open-panel) — 리본·메뉴·키보드·팔레트가 같은 id 로 부른다.
 */
import { createElement } from 'react';
import type { PluginModule, PluginHost, ViewProps } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { registerType } from './model/types';
import { ExplorerView } from './views/ExplorerView';
import { ExplorerStatus } from './views/ExplorerStatus';
import {
    initStore, getState, newFolder, renameSelected, removeSelected,
    duplicateNode, collapseAllNodes, nudgeSelected,
    restoreSelected, askPurge, askPurgeAll, cancelPurgeConfirm, purgeConfirmed, purgeAllConfirmed,
    undoAction, redoAction,
} from './store';

const TREE_VIEW_ID = 'project-explorer.tree';   // host 가 'project-explorer.' 를 붙인다(id: 'tree')

/** 고른 노드 이름 — 「이 폴더를 탐색기로」 탭의 제목(없으면 '프로젝트 탐색기'). */
function selectedName(): string {
    const s = getState();
    return (s.selectedId && s.tree.nodes[s.selectedId]?.name) || '프로젝트 탐색기';
}

function activate(host: PluginHost): void {
    // ── 저장된 나무 읽어 들이기(기기별 host.storage) ──
    initStore(host);

    // ── 내장 타입: 「폴더」 하나(컨테이너) — ⛔ 유일한 내장 타입. 나머지는 각 플러그인 몫 ──
    //    create 로 「새로 만들기 ▸ 폴더」 후보가 된다(표를 돈다 — 타입 이름 비교 없음).
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });

    // ── 뷰: 탐색기 패널(왼쪽 기본 · 세 자리 다 가능 · 가를 수 있음) ──
    //    ⚠️ 싱글턴을 뗐다(N2) — 「이 폴더를 탐색기로」가 rootId 가 다른 탭을 여러 장 열 수 있어야 한다.
    //    루트 패널은 open-panel 이 reuse: true 로 한 장만 쓴다. params.rootId 로 어느 가지를 뿌리로 볼지 가른다.
    host.views.register({
        id: 'tree', title: '프로젝트 탐색기', icon: 'folder', defaultArea: 'left',
        placement: { areas: ['left', 'center', 'right'], split: true },
        layout: { minWidth: 200, squeeze: 'scroll' },   // calendar 미니 패널과 같은 최소폭
        Component: (p: ViewProps) => createElement(ExplorerView, { host, rootId: p.leaf.params?.rootId as string | undefined }),
    });

    // ── 명령 — 전부 등록. 대상 노드는 스토어의 「고른 노드」에서 읽는다(🙋 5) ──
    //    🔴 reuse: true — 싱글턴을 뗐으니 리본을 또 눌러도 루트 패널은 한 장만(⚠️ reuse 는 params 를 안 본다 → 보고).
    host.commands.add({
        id: 'project-explorer.open-panel', title: '프로젝트 탐색기', icon: 'folder',
        run: () => { host.workspace.open(TREE_VIEW_ID, { where: 'left', reuse: true }); },
    });
    // 🔴 「새 폴더」 = 「새로 만들기 ▸ 폴더」. 헤더 단추·우클릭 메뉴가 같은 id(new-<type> 규칙, folder 는 곧 new-folder)를 부른다.
    host.commands.add({ id: 'project-explorer.new-folder', title: '새 폴더', icon: 'plus', run: () => newFolder() });
    host.commands.add({ id: 'project-explorer.rename', title: '이름 바꾸기', icon: 'edit', run: () => renameSelected() });
    host.commands.add({ id: 'project-explorer.duplicate', title: '복제', icon: 'copy', run: () => duplicateNode() });
    host.commands.add({ id: 'project-explorer.remove', title: '삭제(휴지통으로)', icon: 'trash', run: () => removeSelected() });
    host.commands.add({ id: 'project-explorer.collapse-all', title: '모두 접기', icon: 'left', run: () => collapseAllNodes() });
    host.commands.add({ id: 'project-explorer.move-up', title: '위로', icon: 'left', run: () => nudgeSelected(-1) });
    host.commands.add({ id: 'project-explorer.move-down', title: '아래로', icon: 'left', run: () => nudgeSelected(1) });
    // 「이 폴더를 탐색기로」 — 같은 뷰를 rootId 파라미터로 가운데 탭에(VS Code 「Open Folder as Workspace」).
    host.commands.add({
        id: 'project-explorer.open-as-root', title: '이 폴더를 탐색기로', icon: 'panelRight',
        run: () => {
            const id = getState().selectedId;
            if (!id) return;
            host.workspace.open(TREE_VIEW_ID, { where: 'center', params: { rootId: id }, title: selectedName() });
        },
    });

    // ── 휴지통(N3) — 복원·영구삭제(인라인 확인)·비우기 · 되돌리기/다시하기 ──
    host.commands.add({ id: 'project-explorer.restore', title: '복원', icon: 'undo', run: () => restoreSelected() });
    host.commands.add({ id: 'project-explorer.ask-purge', title: '영구 삭제', icon: 'trash', run: () => askPurge() });
    host.commands.add({ id: 'project-explorer.ask-purge-all', title: '휴지통 비우기', icon: 'trash', run: () => askPurgeAll() });
    host.commands.add({ id: 'project-explorer.purge', title: '영구 삭제 확정', icon: 'trash', run: () => purgeConfirmed() });
    host.commands.add({ id: 'project-explorer.purge-all', title: '휴지통 비우기 확정', icon: 'trash', run: () => purgeAllConfirmed() });
    host.commands.add({ id: 'project-explorer.cancel-purge', title: '삭제 취소', icon: 'x', run: () => cancelPurgeConfirm() });
    host.commands.add({ id: 'project-explorer.undo', title: '되돌리기', icon: 'undo', run: () => undoAction() });
    host.commands.add({ id: 'project-explorer.redo', title: '다시 하기', icon: 'redo', run: () => redoAction() });

    // ── 리본 아이콘 하나 — 누르면 탐색기 패널을 연다(reuse 로 한 장만) ──
    host.ribbon.add({ commandId: 'project-explorer.open-panel', icon: 'folder', order: 2 });

    // ── 상태바 — 「노드 N · 휴지통 M」(M=0 이면 「노드 N」만). 스토어를 스스로 구독해 바뀔 때 다시 그린다 ──
    host.statusBar.add({ id: 'count', side: 'left', render: () => createElement(ExplorerStatus) });

    // ── 첫 실행 때 왼쪽에 패널 한 번 열기(⛔ activate 에서가 아니라 여기서) ──
    host.onFirstRun(() => { host.workspace.open(TREE_VIEW_ID, { where: 'left' }); });
}

export const projectExplorerPlugin: PluginModule = { manifest, activate };
export default projectExplorerPlugin;
