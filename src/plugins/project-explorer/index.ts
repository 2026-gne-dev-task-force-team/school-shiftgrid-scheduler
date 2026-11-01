/**
 * 「프로젝트 탐색기」 플러그인 — 노드 하이라키 한 벌 + 파일 탐색기 패널(설계 「노드 시스템 요구명세」 N1).
 *   쥔님 2026-11-01: *"노드 타입이나 그런 거는 여기서 규격만 정해주고 … 탐색기처럼 보여주면 돼"*.
 *
 * 🔴 ⛔ activate 는 등록만 한다 — 여기서 탭을 열지 않는다(onFirstRun 에서만 왼쪽 패널을 한 번 연다).
 * ⭐ 내장 타입은 「폴더」 하나뿐 — 교사·시간표 같은 실제 타입은 각 플러그인이 규격에 맞춰 꽂는다(N4).
 * ⭐ 모든 동작은 명령(new-folder·rename·remove·collapse-all·open-panel) — 리본·메뉴·키보드·팔레트가 같은 id 로 부른다.
 */
import { createElement } from 'react';
import type { PluginModule, PluginHost } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { registerType } from './model/types';
import { ExplorerView } from './views/ExplorerView';
import { initStore, newFolder, renameSelected, removeSelected, collapseAllNodes } from './store';

const TREE_VIEW_ID = 'project-explorer.tree';   // host 가 'project-explorer.' 를 붙인다(id: 'tree')

function activate(host: PluginHost): void {
    // ── 저장된 나무 읽어 들이기(기기별 host.storage) ──
    initStore(host);

    // ── 내장 타입: 「폴더」 하나(컨테이너) — ⛔ 유일한 내장 타입. 나머지는 각 플러그인 몫 ──
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });

    // ── 뷰: 탐색기 패널(왼쪽 기본 · 세 자리 다 가능 · 가를 수 있음 · 싱글턴) ──
    host.views.register({
        id: 'tree', title: '프로젝트 탐색기', icon: 'folder', defaultArea: 'left',
        placement: { areas: ['left', 'center', 'right'], split: true, singleton: true },
        layout: { minWidth: 200, squeeze: 'scroll' },   // calendar 미니 패널과 같은 최소폭
        Component: () => createElement(ExplorerView, { host }),
    });

    // ── 명령 — 전부 등록. 대상 노드는 스토어의 「고른 노드」에서 읽는다(🙋 5) ──
    host.commands.add({
        id: 'project-explorer.open-panel', title: '프로젝트 탐색기', icon: 'folder',
        run: () => { host.workspace.open(TREE_VIEW_ID, { where: 'left' }); },
    });
    host.commands.add({ id: 'project-explorer.new-folder', title: '새 폴더', icon: 'plus', run: () => newFolder() });
    host.commands.add({ id: 'project-explorer.rename', title: '이름 바꾸기', icon: 'edit', run: () => renameSelected() });
    host.commands.add({ id: 'project-explorer.remove', title: '삭제(휴지통으로)', icon: 'trash', run: () => removeSelected() });
    host.commands.add({ id: 'project-explorer.collapse-all', title: '모두 접기', icon: 'left', run: () => collapseAllNodes() });

    // ── 리본 아이콘 하나 — 누르면 탐색기 패널을 연다(싱글턴이라 두 장 안 열린다) ──
    host.ribbon.add({ commandId: 'project-explorer.open-panel', icon: 'folder', order: 2 });

    // ── 첫 실행 때 왼쪽에 패널 한 번 열기(⛔ activate 에서가 아니라 여기서) ──
    host.onFirstRun(() => { host.workspace.open(TREE_VIEW_ID, { where: 'left' }); });
}

export const projectExplorerPlugin: PluginModule = { manifest, activate };
export default projectExplorerPlugin;
