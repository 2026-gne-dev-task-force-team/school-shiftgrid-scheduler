/**
 * 「탐색기」 플러그인 — 노드 하이라키 한 벌 + 파일 탐색기 패널(설계 「노드 시스템 요구명세」 N1).
 *   쥔님 2026-11-01: *"노드 타입이나 그런 거는 여기서 규격만 정해주고 … 탐색기처럼 보여주면 돼"*.
 *
 * 🔴 ⛔ onActivate 는 등록만 한다 — 여기서 탭을 열지 않는다(onFirstRun 에서만 왼쪽 패널을 한 번 연다).
 * ⭐ 내장 타입은 「폴더」 하나뿐 — 교사·시간표 같은 실제 타입은 각 플러그인이 규격에 맞춰 꽂는다(N4).
 * ⭐ 모든 동작은 명령(new-folder·rename·remove·open-panel) — 리본·메뉴·키보드·팔레트가 같은 id 로 부른다.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost, Disposable } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { onTypeRegistered, createTypes, createIconOf, type NodeTypeDef } from './model/types';
import { makeNodesApi } from './api';
import { followActivatedLeaf } from './leaf-follow';
import { ExplorerView } from './views/ExplorerView';
import { ExplorerStatus } from './views/ExplorerStatus';
import {
    initStore, getState, newNode, renameSelected, removeSelected, confirmRemove, cancelRemove,
    nudgeSelected, openById,
    restoreSelected, askPurge, askPurgeAll, cancelPurgeConfirm, purgeConfirmed, purgeAllConfirmed,
    undoAction, undoAllowed, redoAction, subscribeState,
} from './store';
import type { SelectionApi } from '../../pane-ui-system/core/selection/contracts/selection';

const TREE_VIEW_ID = 'explorer.tree';   // host 가 'explorer.' 를 붙인다(id: 'tree')

let offSelection: (() => void) | null = null;
/** 탐색기 선택 → 선택 알림. 고른 것이 바뀔 때만 set(같은 값은 selection 쪽이 거른다). */
export function attachSelection(sel: SelectionApi): void {
    const push = (): void => {
        const s = getState();
        const node = s.selectedIds.length === 1 && s.selectedId ? s.tree.nodes[s.selectedId] : undefined;
        sel.set(node ? { type: node.type, id: node.id } : null);
    };
    offSelection?.();
    offSelection = subscribeState(push);
    push();
}

/**
 * 🔴 「새로 만들기 ▸」 명령 자동 등록 — create 가 있는 타입마다 `explorer.new-<type>` 명령을 켠다(N4 반쪽 메꿈).
 *   메뉴(ExplorerView)는 등록 표를 돌아 `new-<type>` 를 부르는데, 지금껏 그 명령을 아무도 등록하지 않아 「없는 명령」으로 떨어졌다.
 *   folder 의 손 등록(옛 explorer.new-folder)도 여기로 흡수한다 — folder 도 create 를 가진 표의 한 줄(두 벌 금지).
 *
 *   🔴 알림을 걸기 전에 현재 표를 한 번 돈다 — 활성 전에 이미 등록된 타입(순서가 달력이 먼저일 수 있다)도 빠짐없이.
 *   타입이 해제되면 그 명령도 해제(dispose 묶음). 같은 타입 재등록은 옛 명령을 거두고 새로.
 */
export function registerTypeCommands(host: PluginHost): Disposable {
    const cmds = new Map<string, Disposable>();
    const add = (def: NodeTypeDef): void => {
        if (!def.create) return;
        cmds.get(def.type)?.dispose();                       // 재등록이면 옛 명령 먼저 거둔다
        // 🔴 동적 선언(host.declare) — id 는 런타임값(new-<type>)이라 contributes 에 못 적는다. 구현은 하나(commands.newNode)고
        //    타입을 args{type} 데이터로 넘긴다(함수 직접 받기 금지 — 이름 'newNode' 로만). 명령 경로(헤더 단추·팔레트·단축키)
        //    = 「고른 것 기준」(via:'selection' — 고른 노드의 형제로, ⛔ 안으로 안 들어간다). 우클릭은 뷰가 via:'context' 로 직접 부른다.
        cmds.set(def.type, host.declare({
            kind: 'command',
            id: `explorer.new-${def.type}`,
            title: `새 ${def.label}`, icon: createIconOf(def),
            impl: 'newNode', args: { type: def.type },
        }));
    };
    const remove = (type: string): void => { cmds.get(type)?.dispose(); cmds.delete(type); };

    for (const def of createTypes()) add(def);               // 🔴 활성 전 등록분 한 번 — 이 줄이 빠지면 달력이 먼저 켜졌을 때 명령이 안 생긴다
    const sub = onTypeRegistered((ev) => { if (ev.kind === 'register') add(ev.def); else remove(ev.type); });

    return { dispose() { sub.dispose(); for (const d of cmds.values()) d.dispose(); cmds.clear(); } };
}

/**
 * 선언 안 되는 것만 남긴 onActivate(선언형 전환 D2) — 등록(뷰·명령 14·리본·상태바·노드 타입 folder)은 아래 contributes 로 옮겼다.
 *   ⭐ 여기 남는 둘은 「동작·동적 등록」이라 선언이 아니다:
 *     ① initStore — 저장된 나무 읽기(비동기 동작) · ⛔ await 안 한다(등록이 아니라 로드 깨우기).
 *     ② registerTypeCommands — create 있는 타입마다 `explorer.new-<type>` 를 **런타임에** 켜고 끈다.
 *        타입은 다른 플러그인(달력 등)이 런타임에 꽂아 집합이 변하니(동적) contributes 에 못 적는다 — id 가 런타임값이라서다.
 *        그래서 host.declare 로: 구현은 하나(commands.newNode)고 타입을 args{type} 데이터로 넘긴다(명세 「구현하며 바뀐 것 둘」 ②).
 *   🔴 folder 노드 타입은 contributes.nodeTypes 로 옮겨 applyContributes(= onActivate 보다 먼저)가 꽂는다 →
 *      registerTypeCommands 의 「활성 전 등록분 한 번 돌기」가 folder 를 잡아 new-folder 를 켠다(순서 그대로).
 */
function onActivate(host: PluginHost): void {
    void initStore(host);
    registerTypeCommands(host);
    // 🔑 탭이 바뀌면 탐색기 강조·속성 패널이 그 탭의 노드를 따라간다(노드 아닌 화면이면 풀림) — leaf-follow.ts
    host.workspace.on('activate', followActivatedLeaf);
}

/**
 * 🔴 nodes 인터페이스 모듈 — 「호출자별 팩토리」(__perCaller). host.modules.use<NodesApi>('nodes') 가
 *   호출자 id 와 (소비자,nodes) scope track 을 넣어 부른다. 그래서 register 접두사·setData 주인·disposable 회수가 호출자 기준으로 선다.
 */
const nodesApiFactory = Object.assign(
    (callerId: string | undefined, track?: (d: Disposable) => Disposable) => makeNodesApi(callerId, track),
    { __perCaller: true as const },
);

export const explorerPlugin = definePlugin({
    manifest: {
        ...manifest,
        // 🔴 M0 — 「nodes」 인터페이스를 채운다(provides). 모듈 값은 아래 modules.nodes(짝). nodeTypes 기여가 있어도
        //    제공자라 requires.nodes 가 면제된다(호스트 검사의 「제공자 예외」).
        provides: { nodes: '0.1.0' },
        supports: { selection: '^0.1' },
        // 🔴 선언형 기여 — 「무엇을 내나」를 데이터로 적는다. 함수·컴포넌트는 이름으로(아래 components·commands·renders).
        contributes: {
            // 🔴 nodes 약속을 **들고 온다**(2026-11-08 「플러그인은 꾸러미다」 — 탐색기 꾸러미가 약속·제공·화면을 한 폴더에).
            //    탐색기는 core 라 nodes 는 끌 수 없는 범용 약속으로 선다(쥔님 14:32 「컨트랙트 노드 끌수 없는 코어로」 — 꾸러미가 코어라 자연히).
            interfaces: [{ name: 'nodes', version: '0.1.0', label: '폴더 나무(탐색기)', desc: '만든 것을 담는 폴더 나무' }],
            // 뷰: 탐색기 패널(왼쪽 기본 · 사이드 패널 둘만 — center 없음·split 없음, 쥔님 2026-11-01 19:34).
            views: [{
                id: 'tree', title: '탐색기', icon: 'folder', defaultArea: 'left',
                placement: { areas: ['left', 'right'] },
                layout: { minWidth: 200, squeeze: 'scroll' },   // calendar 미니 패널과 같은 최소폭
                component: 'Tree',
            }],
            // 명령 14 — 대상 노드는 스토어의 「고른 노드」에서 읽는다. 🔴 new-folder 는 여기 없다(registerTypeCommands 가 folder 타입에서 자동).
            commands: [
                { id: 'explorer.open-panel', title: '탐색기 열기', icon: 'folder', keys: 'Mod+Shift+E' },
                { id: 'explorer.rename', title: '이름 바꾸기', icon: 'edit' },
                { id: 'explorer.remove', title: '삭제', icon: 'trash' },
                { id: 'explorer.confirm-remove', title: '삭제 확인', icon: 'trash', palette: false },
                { id: 'explorer.cancel-remove', title: '삭제 취소', icon: 'x', palette: false },
                { id: 'explorer.open', title: '고른 것 열기', icon: 'arrowRight' },
                { id: 'explorer.move-up', title: '위로 옮기기', icon: 'up' },
                { id: 'explorer.move-down', title: '아래로 옮기기', icon: 'down' },
                { id: 'explorer.restore', title: '복원', icon: 'undo' },
                { id: 'explorer.ask-purge', title: '영구 삭제', icon: 'trash' },
                { id: 'explorer.ask-purge-all', title: '휴지통 비우기', icon: 'trash' },
                { id: 'explorer.purge', title: '영구 삭제 확정', icon: 'trash', palette: false },
                { id: 'explorer.purge-all', title: '휴지통 비우기 확정', icon: 'trash', palette: false },
                { id: 'explorer.cancel-purge', title: '영구 삭제 취소', icon: 'x', palette: false },
                { id: 'explorer.undo', title: '되돌리기', icon: 'undo' },
                { id: 'explorer.redo', title: '다시 하기', icon: 'redo' },
            ],
            // 리본 아이콘 하나 — open-panel 명령을 가리킨다(누르면 탐색기 패널).
            ribbon: [{ commandId: 'explorer.open-panel', icon: 'folder', order: 2 }],
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
        'explorer.open-panel': (host) => { host.workspace.open(TREE_VIEW_ID, { where: 'left', reuse: true }); },
        'explorer.rename': () => renameSelected(),
        'explorer.remove': () => removeSelected(),
        'explorer.confirm-remove': () => confirmRemove(),
        'explorer.cancel-remove': () => cancelRemove(),
        'explorer.open': () => { const id = getState().selectedId; if (id) openById(id); },
        'explorer.move-up': () => nudgeSelected(-1),
        'explorer.move-down': () => nudgeSelected(1),
        'explorer.restore': () => restoreSelected(),
        'explorer.ask-purge': () => askPurge(),
        'explorer.ask-purge-all': () => askPurgeAll(),
        'explorer.purge': () => purgeConfirmed(),
        'explorer.purge-all': () => purgeAllConfirmed(),
        'explorer.cancel-purge': () => cancelPurgeConfirm(),
        'explorer.undo': () => undoAction(),
        'explorer.redo': () => redoAction(),
        // 🔴 동적 new-<type> 명령의 구현 하나 — registerTypeCommands 가 타입마다 id 'new-<type>' + args{type} 로 declare 한다.
        //    id 가 런타임값이라 contributes 에 못 적는 명령이 「이름 하나 + 데이터」로 선언형에 들어오는 본보기(명세 「구현하며 바뀐 것 둘」 ②).
        newNode: (_host, _ctx, args) => { const { type } = args as { type: string }; newNode(type, { via: 'selection' }); },
    },
    // 🔴 「지금 되나」 판정 — explorer.undo 는 args.undoTop(알림이 실은 토큰)이 더미 맨 위와 맞을 때만(C1). args 없으면 늘 된다.
    enabled: {
        'explorer.undo': (_host, ctx) => undoAllowed(ctx?.args),
    },
    // 상태바 그림 — 스토어를 스스로 구독해 나무가 바뀔 때 다시 그린다(host 는 안 쓴다).
    renders: {
        Count: () => createElement(ExplorerStatus),
    },
    // 🔴 M0 — nodes 인터페이스를 채우는 모듈(provides 와 짝). host.modules.use<NodesApi>('nodes') 가 이걸 받는다.
    //    「호출자별 팩토리」라 use 가 (소비자 id, scope track) 으로 부른다.
    modules: { nodes: nodesApiFactory },
    // 첫 실행 때 왼쪽에 패널 한 번(⛔ onActivate 가 아니라 여기 — 다리가 설 때까지 호스트가 미룬다).
    lifecycle: {
        onActivate,
        onFirstRun: (host) => { host.workspace.open(TREE_VIEW_ID, { where: 'left' }); },
        // 선택 알림(supports) — 하나만 골랐으면 { 노드 타입, id }, 아니면 null 을 알린다. 오면 붙고 가면 끊는다.
        onInterface: { selection: { attach: (_h, mod) => attachSelection(mod as SelectionApi), detach: () => { offSelection?.(); offSelection = null; } } },
    },
});
export default explorerPlugin;
