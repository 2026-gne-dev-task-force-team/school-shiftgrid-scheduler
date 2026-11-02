/**
 * 「탐색기」 플러그인 — 노드 하이라키 한 벌 + 파일 탐색기 패널(설계 「노드 시스템 요구명세」 N1).
 *   쥔님 2026-11-01: *"노드 타입이나 그런 거는 여기서 규격만 정해주고 … 탐색기처럼 보여주면 돼"*.
 *
 * 🔴 ⛔ activate 는 등록만 한다 — 여기서 탭을 열지 않는다(onFirstRun 에서만 왼쪽 패널을 한 번 연다).
 * ⭐ 내장 타입은 「폴더」 하나뿐 — 교사·시간표 같은 실제 타입은 각 플러그인이 규격에 맞춰 꽂는다(N4).
 * ⭐ 모든 동작은 명령(new-folder·rename·remove·open-panel) — 리본·메뉴·키보드·팔레트가 같은 id 로 부른다.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost, Disposable } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { onTypeRegistered, createTypes, type NodeTypeDef } from './model/types';
import { makeNodesApi } from './api';
import { ExplorerView } from './views/ExplorerView';
import { ExplorerStatus } from './views/ExplorerStatus';
import {
    initStore, getState, newNode, renameSelected, removeSelected,
    nudgeSelected, openById,
    restoreSelected, askPurge, askPurgeAll, cancelPurgeConfirm, purgeConfirmed, purgeAllConfirmed,
    undoAction, redoAction,
} from './store';

const TREE_VIEW_ID = 'project-explorer.tree';   // host 가 'project-explorer.' 를 붙인다(id: 'tree')

/**
 * 🔴 「새로 만들기 ▸」 명령 자동 등록 — create 가 있는 타입마다 `project-explorer.new-<type>` 명령을 켠다(N4 반쪽 메꿈).
 *   메뉴(ExplorerView)는 등록 표를 돌아 `new-<type>` 를 부르는데, 지금껏 그 명령을 아무도 등록하지 않아 「없는 명령」으로 떨어졌다.
 *   folder 의 손 등록(옛 project-explorer.new-folder)도 여기로 흡수한다 — folder 도 create 를 가진 표의 한 줄(두 벌 금지).
 *
 *   🔴 알림을 걸기 전에 현재 표를 한 번 돈다 — 활성 전에 이미 등록된 타입(순서가 달력이 먼저일 수 있다)도 빠짐없이.
 *   타입이 해제되면 그 명령도 해제(dispose 묶음). 같은 타입 재등록은 옛 명령을 거두고 새로.
 */
export function registerTypeCommands(host: PluginHost): Disposable {
    const cmds = new Map<string, Disposable>();
    const add = (def: NodeTypeDef): void => {
        if (!def.create) return;
        cmds.get(def.type)?.dispose();                       // 재등록이면 옛 명령 먼저 거둔다
        cmds.set(def.type, host.commands.add({
            id: `project-explorer.new-${def.type}`,
            title: `새 ${def.label}`, icon: 'plus',
            // 🔴 명령 경로(헤더 단추·팔레트·단축키) = 「고른 것 기준」 — 고른 노드의 형제로(⛔ 안으로 안 들어간다). 우클릭은 뷰가 via:'context' 로 직접 부른다.
            run: () => newNode(def.type, { via: 'selection' }),
        }));
    };
    const remove = (type: string): void => { cmds.get(type)?.dispose(); cmds.delete(type); };

    for (const def of createTypes()) add(def);               // 🔴 활성 전 등록분 한 번 — 이 줄이 빠지면 달력이 먼저 켜졌을 때 명령이 안 생긴다
    const sub = onTypeRegistered((ev) => { if (ev.kind === 'register') add(ev.def); else remove(ev.type); });

    return { dispose() { sub.dispose(); for (const d of cmds.values()) d.dispose(); cmds.clear(); } };
}

/**
 * 선언 안 되는 것만 남긴 activate(선언형 전환 D2) — 등록(뷰·명령 14·리본·상태바·노드 타입 folder)은 아래 contributes 로 옮겼다.
 *   ⭐ 여기 남는 둘은 「동작·동적 등록」이라 선언이 아니다:
 *     ① initStore — 저장된 나무 읽기(비동기 동작) · ⛔ await 안 한다(등록이 아니라 로드 깨우기).
 *     ② registerTypeCommands — create 있는 타입마다 `project-explorer.new-<type>` 를 **런타임에** 켜고 끈다.
 *        타입은 다른 플러그인(달력 등)이 런타임에 꽂아 집합이 변하니(동적) 선언으로 못 적는다 — host.declare 도
 *        run 을 이름으로 찾는데 여기 run 은 타입마다 만드는 클로저라 못 쓴다. 그래서 옛 host.commands.add 를 그대로 둔다.
 *   🔴 folder 노드 타입은 contributes.nodeTypes 로 옮겨 applyContributes(= activate 보다 먼저)가 꽂는다 →
 *      registerTypeCommands 의 「활성 전 등록분 한 번 돌기」가 folder 를 잡아 new-folder 를 켠다(순서 그대로).
 */
function activate(host: PluginHost): void {
    void initStore(host);
    registerTypeCommands(host);
}

/**
 * 🔴 N4 공개 api — 「호출자별 팩토리」(__perCaller). host.plugins.get<NodesApi>('project-explorer') 가
 *   호출자 id 와 track 을 넣어 부른다. 그래서 register 접두사·setData 주인·disposable 회수가 호출자 기준으로 선다.
 */
const nodesApiFactory = Object.assign(
    (callerId: string | undefined, track?: (d: Disposable) => Disposable) => makeNodesApi(callerId, track),
    { __perCaller: true as const },
);

export const projectExplorerPlugin = definePlugin({
    manifest: {
        ...manifest,
        // 🔴 선언형 기여 — 「무엇을 내나」를 데이터로 적는다. 함수·컴포넌트는 이름으로(아래 components·commands·renders).
        contributes: {
            // 뷰: 탐색기 패널(왼쪽 기본 · 사이드 패널 둘만 — center 없음·split 없음, 쥔님 2026-11-01 19:34).
            views: [{
                id: 'tree', title: '탐색기', icon: 'folder', defaultArea: 'left',
                placement: { areas: ['left', 'right'] },
                layout: { minWidth: 200, squeeze: 'scroll' },   // calendar 미니 패널과 같은 최소폭
                component: 'Tree',
            }],
            // 명령 14 — 대상 노드는 스토어의 「고른 노드」에서 읽는다. 🔴 new-folder 는 여기 없다(registerTypeCommands 가 folder 타입에서 자동).
            commands: [
                { id: 'project-explorer.open-panel', title: '탐색기', icon: 'folder' },
                { id: 'project-explorer.rename', title: '이름 바꾸기', icon: 'edit' },
                { id: 'project-explorer.remove', title: '삭제(휴지통으로)', icon: 'trash' },
                { id: 'project-explorer.open', title: '열기', icon: 'arrowRight' },
                { id: 'project-explorer.move-up', title: '위로', icon: 'left' },
                { id: 'project-explorer.move-down', title: '아래로', icon: 'left' },
                { id: 'project-explorer.restore', title: '복원', icon: 'undo' },
                { id: 'project-explorer.ask-purge', title: '영구 삭제', icon: 'trash' },
                { id: 'project-explorer.ask-purge-all', title: '휴지통 비우기', icon: 'trash' },
                { id: 'project-explorer.purge', title: '영구 삭제 확정', icon: 'trash' },
                { id: 'project-explorer.purge-all', title: '휴지통 비우기 확정', icon: 'trash' },
                { id: 'project-explorer.cancel-purge', title: '삭제 취소', icon: 'x' },
                { id: 'project-explorer.undo', title: '되돌리기', icon: 'undo' },
                { id: 'project-explorer.redo', title: '다시 하기', icon: 'redo' },
            ],
            // 리본 아이콘 하나 — open-panel 명령을 가리킨다(누르면 탐색기 패널).
            ribbon: [{ commandId: 'project-explorer.open-panel', icon: 'folder', order: 2 }],
            // 상태바 — 「노드 N · 휴지통 M」. render 는 아래 renders.Count.
            statusBar: [{ id: 'count', side: 'left', render: 'Count' }],
            // ⭐ 내장 노드 타입 「폴더」 하나(컨테이너) — 함수 칸 없는 순수 데이터라 impl 이 없다(folder 는 접두사 없는 예외).
            nodeTypes: [{ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } }],
        },
    },
    // 🔴 뷰·상태바 구현은 이름으로 — 호스트가 꽂을 때 host(p.host)를 끼워 넣는다(안드로이드 Context).
    components: {
        Tree: (p) => createElement(ExplorerView, { host: p.host }),
    },
    // 명령 run — 전부 여기로. host 를 쓰는 건 open-panel 뿐(나머지는 스토어 함수).
    //   🔴 reuse: true — 싱글턴을 뗐으니 리본을 또 눌러도 루트 패널은 한 장만(⚠️ reuse 는 params 를 안 본다).
    commands: {
        'project-explorer.open-panel': (host) => { host.workspace.open(TREE_VIEW_ID, { where: 'left', reuse: true }); },
        'project-explorer.rename': () => renameSelected(),
        'project-explorer.remove': () => removeSelected(),
        'project-explorer.open': () => { const id = getState().selectedId; if (id) openById(id); },
        'project-explorer.move-up': () => nudgeSelected(-1),
        'project-explorer.move-down': () => nudgeSelected(1),
        'project-explorer.restore': () => restoreSelected(),
        'project-explorer.ask-purge': () => askPurge(),
        'project-explorer.ask-purge-all': () => askPurgeAll(),
        'project-explorer.purge': () => purgeConfirmed(),
        'project-explorer.purge-all': () => purgeAllConfirmed(),
        'project-explorer.cancel-purge': () => cancelPurgeConfirm(),
        'project-explorer.undo': () => undoAction(),
        'project-explorer.redo': () => redoAction(),
    },
    // 상태바 그림 — 스토어를 스스로 구독해 나무가 바뀔 때 다시 그린다(host 는 안 쓴다).
    renders: {
        Count: () => createElement(ExplorerStatus),
    },
    activate,
    // 첫 실행 때 왼쪽에 패널 한 번(⛔ activate 가 아니라 여기 — 다리가 설 때까지 호스트가 미룬다).
    lifecycle: { onFirstRun: (host) => { host.workspace.open(TREE_VIEW_ID, { where: 'left' }); } },
    api: nodesApiFactory,
});
export default projectExplorerPlugin;
