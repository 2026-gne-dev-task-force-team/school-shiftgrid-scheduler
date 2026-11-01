/**
 * 「프로젝트 탐색기」 플러그인 — 노드 하이라키 한 벌 + 파일 탐색기 패널(설계 「노드 시스템 요구명세」 N1).
 *   쥔님 2026-11-01: *"노드 타입이나 그런 거는 여기서 규격만 정해주고 … 탐색기처럼 보여주면 돼"*.
 *
 * 🔴 ⛔ activate 는 등록만 한다 — 여기서 탭을 열지 않는다(onFirstRun 에서만 왼쪽 패널을 한 번 연다).
 * ⭐ 내장 타입은 「폴더」 하나뿐 — 교사·시간표 같은 실제 타입은 각 플러그인이 규격에 맞춰 꽂는다(N4).
 * ⭐ 모든 동작은 명령(new-folder·rename·remove·open-panel) — 리본·메뉴·키보드·팔레트가 같은 id 로 부른다.
 */
import { createElement } from 'react';
import type { PluginModule, PluginHost, Disposable } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { registerType } from './model/types';
import { makeNodesApi } from './api';
import { ExplorerView } from './views/ExplorerView';
import { ExplorerStatus } from './views/ExplorerStatus';
import {
    initStore, getState, newFolder, renameSelected, removeSelected,
    nudgeSelected, openById,
    restoreSelected, askPurge, askPurgeAll, cancelPurgeConfirm, purgeConfirmed, purgeAllConfirmed,
    undoAction, redoAction,
} from './store';

const TREE_VIEW_ID = 'project-explorer.tree';   // host 가 'project-explorer.' 를 붙인다(id: 'tree')

function activate(host: PluginHost): void {
    // ── 저장된 나무 읽어 들이기(host.store = IndexedDB, 비동기) — 끝날 때까지 뷰는 「불러오는 중…」 ──
    //    🔴 await 하지 않는다(activate 는 등록만 하고 바로 돌아간다) — 로드 완료는 스토어가 알아서 깨운다.
    void initStore(host);

    // ── 내장 타입: 「폴더」 하나(컨테이너) — ⛔ 유일한 내장 타입. 나머지는 각 플러그인 몫 ──
    //    create 로 「새로 만들기 ▸ 폴더」 후보가 된다(표를 돈다 — 타입 이름 비교 없음).
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });

    // ── 뷰: 탐색기 패널(왼쪽 기본 · 사이드 패널 둘만) ──
    //    🔴 쥔님 2026-11-01 19:34 *"탐색기가 가운데로 또 갈 수 있네 — 패널 뷰는 탭 뷰로 못 간다니까"* → areas 에서 center 를 뺐다 · split 도 뺐다(기본 false)
    host.views.register({
        id: 'tree', title: '프로젝트 탐색기', icon: 'folder', defaultArea: 'left',
        placement: { areas: ['left', 'right'] },
        layout: { minWidth: 200, squeeze: 'scroll' },   // calendar 미니 패널과 같은 최소폭
        Component: () => createElement(ExplorerView, { host }),
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
    host.commands.add({ id: 'project-explorer.remove', title: '삭제(휴지통으로)', icon: 'trash', run: () => removeSelected() });
    // 열기 — 고른 노드의 타입 open 을 실행(실노드·유도 가상 줄 공통). 컨테이너 접기/펴기는 뷰가 맡는다.
    host.commands.add({ id: 'project-explorer.open', title: '열기', icon: 'arrowRight', run: () => { const id = getState().selectedId; if (id) openById(id); } });
    host.commands.add({ id: 'project-explorer.move-up', title: '위로', icon: 'left', run: () => nudgeSelected(-1) });
    host.commands.add({ id: 'project-explorer.move-down', title: '아래로', icon: 'left', run: () => nudgeSelected(1) });

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

/**
 * 🔴 N4 공개 api — 「호출자별 팩토리」(__perCaller). host.plugins.get<NodesApi>('project-explorer') 가
 *   호출자 id 와 track 을 넣어 부른다. 그래서 register 접두사·setData 주인·disposable 회수가 호출자 기준으로 선다.
 */
const nodesApiFactory = Object.assign(
    (callerId: string | undefined, track?: (d: Disposable) => Disposable) => makeNodesApi(callerId, track),
    { __perCaller: true as const },
);

export const projectExplorerPlugin: PluginModule = { manifest, activate, api: nodesApiFactory };
export default projectExplorerPlugin;
