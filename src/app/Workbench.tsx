/**
 * 작업대 화면 — 셸·조각을 조립하고 상태(패널 트리·사이드바 폭/접힘/고정)를 쥔다.
 * 🔴 조립만 한다 — 색·px 를 쓰지 않는다(그건 조각·셸의 몫).
 *
 * ⭐ 가운데·왼쪽·오른쪽이 전부 같은 패널 트리 모델(Workspace)이 쥔다 — 탭·스플릿·비율이 한 자료구조에(W3).
 *    창틀은 viewId 가 무엇인지 모른다. 무엇을 그릴지는 플러그인이 host.views.register 로 꽂고,
 *    앱은 appHost 로만 읽는다(registerView 직접 호출 0). 뷰 id 엔 플러그인 접두사가 붙어 있다(scheduler.week 등).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    useNarrow, usePanels, SidePanel, Rail,
    useTheme, WorkspaceView, EmptyArea, CommandPalette,
    usePaneSettings, effectiveViewLayout, effectiveMin, clampWidthTo,
    BottomBar, TabSwitcher, RibbonSheet, type BarItem,
    TitleBar, type TitleAction,
    StatusBar, type StatusItem,
    installContextMenuGuard,
    FRAME_COMMAND,
    type WorkspaceHandlers, type Workspace, type AreaKey, type Leaf, type Node,
    leaf, uid, findLeaf, findLeafByView, firstTabs, flatten, loadWorkspace, saveWorkspace, openLeaf,
    closeLeaf, activateLeaf, splitAt, resize, addLeafToTabs,
    closeOthers, closeToRight, moveLeaf, moveTabWithin, renameLeaf, areaOfLeaf,
    type MovePos,
} from '../pane-ui-system';
import {
    setWorkspaceBridge, type WorkspaceOpenOptions, type CommandContext, type Disposable,
    useStatusItems, useContribVersion, getNewTab, listTabMenu, fireWorkspace, ownerOfView,
    type WorkspaceEvent,
} from '../pane-ui-system/plugin';
import { appHost } from './host';
import { canPlace, canSplit, isSingleton } from '../pane-ui-system/view-registry';   // 자리 제한 — 호스트 앱이 모델 앞에서 묻는다
import './blank';   // 등록은 import 부작용 — 빈 탭 뷰(app.blank)
const BLANK_VIEW_ID = 'app.blank';

/** 이 leaf 가 든 탭 묶음의 id — 가르기 명령이 팔레트에서 불릴 때(맥락 없이) 활성 탭의 묶음을 찾는다. */
function tabsIdOfLeaf(ws: Workspace, leafId: string): string | null {
    const walk = (n: Node | null): string | null => {
        if (!n) return null;
        if (n.kind === 'tabs') return n.children.some((c) => c.id === leafId) ? n.id : null;
        if (n.kind === 'split') { for (const c of n.children) { const r = walk(c); if (r) return r; } }
        return null;
    };
    for (const area of ['left', 'center', 'right'] as const) { const r = walk(ws[area]); if (r) return r; }
    return null;
}

/**
 * 🔴 저장된 배치에서 「설치돼 있지 않은 플러그인」의 뷰를 닫는다(쥔님 2026-11-01 19:04 *"개요랑 속성 패널은 뭔데 있냐"* —
 *    지운 스케줄러의 「개요」·「속성」 leaf 가 localStorage 배치에 남아 자리표시로 떠 있었다).
 *    ⚠️ 가름선: 플러그인이 **꺼진** 것(ownerOfView 가 있고 enabled=false)은 남긴다 — 다시 켜면 그 자리로 돌아온다(자리표시의 뜻).
 *    없는 플러그인(ownerOfView=null)만 닫는다. 앱 자체 뷰(app.*)는 플러그인이 아니라 그대로.
 */
function pruneOrphanLeaves(ws: Workspace): Workspace {
    let out = ws;
    for (const area of ['left', 'center', 'right'] as const) {
        const n = ws[area];
        if (!n) continue;
        for (const l of flatten(n)) {
            if (l.viewId.startsWith('app.')) continue;
            if (ownerOfView(l.viewId) === null) out = closeLeaf(out, l.id);
        }
    }
    return out;
}

export function Workbench() {
    const narrow = useNarrow();
    const panels = usePanels(narrow);
    useTheme();    // 마운트 때 저장된 테마를 적용한다(반환값은 설정 화면이 따로 쥔다)

    // 패널 트리 — 기기별로 보관된 배치를 읽어 온다. 🔴 첫 실행(저장값 없음)이면 빈 창틀이다 —
    //             ⛔ 아무 뷰도 자동으로 열지 않는다(쥔님 2026-11-01 *"그냥 다 비워줘"*). loadWorkspace 가 빈 배치를 준다.
    const [ws, setWs] = useState<Workspace>(() => pruneOrphanLeaves(loadWorkspace()));
    // 🔴 늘 최신 배치를 가리키는 ref — React 밖(플러그인 다리)·콜백에서 「지금 무엇이 떠 있나」를 결정적으로 읽는다.
    //    렌더 중에 갱신해 두면 setWs 의 비동기 타이밍과 무관하게 openView 가 포커스 id 를 바로 정할 수 있다.
    const wsRef = useRef(ws);
    wsRef.current = ws;
    // 좁은 화면에서 지금 보는 leaf(넓은 화면에선 각 묶음의 activeId 를 쓴다)
    const [focus, setFocus] = useState<string>('');
    // 좁은 화면 탭 전환 시트(하단 바 ▦ 로 연다)
    const [tabSwitcher, setTabSwitcher] = useState(false);
    // 좁은 화면 리본 시트(하단 바 ▤ 로 연다, ⑤)
    const [ribbonSheet, setRibbonSheet] = useState(false);
    // 명령 팔레트(Ctrl/⌘+P)
    const [palette, setPalette] = useState(false);
    const seq = useRef(0);
    // 🔴 최신값 ref — 명령 run 은 한 번 등록되고 계속 산다. 그 안에서 늘 최신 handlers·focus·panels 를 읽게 한다.
    const focusRef = useRef(focus);
    focusRef.current = focus;
    const panelsRef = useRef(panels);
    panelsRef.current = panels;

    useEffect(() => { saveWorkspace(ws); }, [ws]);

    // 🔴 작업대 이벤트 — 트리 변화를 재서 플러그인에 쏜다(open/close/activate). 모든 경로를 잡는다
    //    (리본·+·드래그 무엇으로 열든). 플러그인 상태바가 이걸로 센다.
    type Area = 'left' | 'center' | 'right' | 'floating';
    const prevLeaves = useRef<Map<string, Leaf & { area: Area }>>(new Map());
    useEffect(() => {
        const cur = new Map<string, Leaf & { area: Area }>();
        for (const area of ['left', 'center', 'right'] as const) { const n = ws[area]; if (n) for (const l of flatten(n)) cur.set(l.id, { ...l, area }); }
        for (const l of ws.floating) cur.set(l.id, { ...l, area: 'floating' });
        for (const [id, l] of cur) if (!prevLeaves.current.has(id)) fireWorkspace('open', { id, viewId: l.viewId, params: l.params, area: l.area });
        for (const [id, l] of prevLeaves.current) if (!cur.has(id)) fireWorkspace('close', { id, viewId: l.viewId, params: l.params, area: l.area });
        prevLeaves.current = cur;
    }, [ws]);
    // 활성 바뀜 — focus 로. 같은 뷰로 다시 와도 한 번만
    const prevFocus = useRef<string>('');
    useEffect(() => {
        if (!focus || focus === prevFocus.current) return;
        prevFocus.current = focus;
        const l = findLeaf(ws, focus);
        if (l) fireWorkspace('activate' as WorkspaceEvent, { id: l.id, viewId: l.viewId, params: l.params });
    }, [focus, ws]);

    // 🔴 ⭐ 뷰 열기 — 리본·플러그인(workspace.open)·설정·빈 사이드바 고르기가 **전부 이 한 함수**를 거친다.
    //    쥔님 2026-11-01: *"스플릿할 수 있는가 · 딱 한 창만 띄울 수 있는가 그거 두 개 다 하자"* →
    //    자리 제한(canPlace)·싱글턴(isSingleton)을 여기 한 곳에서 묻는다(한 길만 막으면 다른 길로 뚫린다).
    //    - singleton : 강제 재사용 — 이미 떠 있으면 새로 안 열고 그리로(그 뷰는 딱 한 장).
    //    - reuse(옵션): 비싱글턴에 대한 호출자 힌트 — 있으면 재사용, 없으면 새 장.
    //    wsRef 로 최신 배치를 읽어 포커스 id 를 결정적으로 돌려준다.
    const openView = useCallback((viewId: string, o?: WorkspaceOpenOptions): string | null => {
        const def = appHost.views.get(viewId);
        if (!def) return null;
        const single = isSingleton(viewId);
        const wantReuse = single || !!o?.reuse;
        if (wantReuse) {
            const ex = findLeafByView(wsRef.current, viewId);
            if (ex) { setWs((w) => activateLeaf(w, ex.id)); setFocus(ex.id); return ex.id; }
        }
        // 새로 — 요청 자리가 placement.areas 에 막혀 있으면 허용된 첫 자리(없으면 가운데)로 떨군다
        let area: 'left' | 'center' | 'right' = o?.where ?? def.defaultArea ?? 'center';
        if (!canPlace(viewId, area)) area = def.placement?.areas?.[0] ?? 'center';
        const lf = leaf(viewId, o?.title ?? def.title, { id: single ? viewId : undefined, params: o?.params });
        setWs((w) => openLeaf(w, lf, area));
        setFocus(lf.id);
        return lf.id;
    }, []);

    // 🔴 작업대 다리 — 플러그인의 host.workspace.open/close 가 이리로 들어온다(host 는 React 밖에 산다).
    //    open 은 위 openView 그대로 — 뷰가 제 안에서 탭을 띄우든 리본이 열든 같은 판정을 거친다.
    useEffect(() => {
        setWorkspaceBridge({
            open: (viewId: string, o?: WorkspaceOpenOptions) => openView(viewId, o),
            close: (leafId: string) => setWs((w) => closeLeaf(w, leafId)),
        });
        return () => setWorkspaceBridge(null);
    }, [openView]);

    // 🔴 「+」가 여는 것 — 기본은 **빈 탭**(app.blank · 쥔님 13:15 *"그냥 빈 새 탭이 떠야 되는데"*).
    //    플러그인이 newTab 한 칸을 잡으면 그게 우선(지금은 아무도 안 잡는다).
    useContribVersion();                 // 새 탭 기여가 바뀌면 다시 그린다
    const newTab = getNewTab();
    const makeSheet = useCallback((): Leaf | null => {
        const nt = getNewTab();
        if (!nt) return leaf(BLANK_VIEW_ID, '새 탭');
        seq.current += 1;
        const base = appHost.views.get(nt.viewId)?.title ?? '탭';
        return leaf(nt.viewId, `${base} ${seq.current}`);
    }, []);

    const addTab = useCallback(() => {
        const lf = makeSheet();
        if (!lf) return;
        setWs((w) => openLeaf(w, lf, 'center'));
        setFocus(lf.id);
    }, [makeSheet]);

    // 설정 — 코어 settings 플러그인의 뷰(싱글턴). openView 가 이미 떠 있으면 그리로 보낸다.
    const openSettings = useCallback(() => { openView('settings.main'); }, [openView]);

    const handlers: WorkspaceHandlers = useMemo(() => ({
        onActivate: (id) => { setWs((w) => activateLeaf(w, id)); setFocus(id); },
        onClose: (id) => setWs((w) => closeLeaf(w, id)),
        // 🔴 가르기 = 원본 탭(sourceLeafId)을 복제해 옆에 — 새 「표 N」 아님(W8, 옵시디언식)
        onSplit: (tabsId, dir, sourceLeafId) => {
            const dupId = uid('leaf');
            setWs((w) => {
                const src = findLeaf(w, sourceLeafId);
                if (!src || !canSplit(src.viewId)) return w;   // 🔴 placement.split=false 면 안 가른다
                return splitAt(w, tabsId, dir, leaf(src.viewId, src.title, { id: dupId }));
            });
            setFocus(dupId);
        },
        onResize: (splitId, sizes) => setWs((w) => resize(w, splitId, sizes)),
        onAddToTabs: (tabsId) => {
            const lf = makeSheet();
            if (!lf) return;
            setWs((w) => addLeafToTabs(w, tabsId, lf));
            setFocus(lf.id);
        },
        onAddGlobal: addTab,
        // 🔴 + 가 여는 것의 이름 — 플러그인이 newTab 으로 준다(없으면 뜻 없는 '새 탭')
        addLabel: newTab?.label ?? '새 탭',
        // 🔴 「모든 탭 메뉴」 기여 — 플러그인이 host.menu 로 꽂은 항목을 이 leaf 로 푼다
        tabMenu: (lf: Leaf) => listTabMenu({ id: lf.id, viewId: lf.viewId, title: lf.title, params: lf.params }),
        onCloseOthers: (id) => setWs((w) => closeOthers(w, id)),
        onCloseRight: (id) => setWs((w) => closeToRight(w, id)),
        // 🔴 이동은 전부 placement 를 묻는다 — 메뉴가 잠궜어도 드래그·키보드가 뚫지 못하게 모델 앞에서 한 번 더
        onMove: (id, to) => { setWs((w) => { const l = findLeaf(w, id); return l && canPlace(l.viewId, to) ? moveLeaf(w, id, to, 'after') : w; }); setFocus(id); },
        onRename: (id, title) => setWs((w) => renameLeaf(w, id, title)),
        // 🔴 드래그 드롭(W6·W7) — 존 판정은 창틀이 끝냈고, 여긴 moveLeaf 한 번으로 모델만 바꾼다
        onDropLeaf: (id, target, pos: MovePos) => {
            setWs((w) => {
                const l = findLeaf(w, id);
                if (!l) return w;
                // target 이 자리 이름이면 그 자리로, leaf id 면 그 leaf 가 있는 자리로 묻는다
                const area = (target === 'left' || target === 'center' || target === 'right') ? target
                    : areaOfLeaf(w, target);
                if (!area || area === 'floating' || !canPlace(l.viewId, area)) return w;
                // 가장자리 드롭(새 split)은 가르기 허용도 본다
                if ((pos === 'left' || pos === 'right' || pos === 'up' || pos === 'down') && !canSplit(l.viewId)) return w;
                return moveLeaf(w, id, target, pos);
            });
            setFocus(id);
        },
        // 키보드 Alt+←/→ 로 같은 줄 안에서 한 칸(W6 ④)
        onReorderTab: (id, delta) => { setWs((w) => moveTabWithin(w, id, delta)); setFocus(id); },
    }), [makeSheet, addTab, newTab]);
    const handlersRef = useRef(handlers);
    handlersRef.current = handlers;

    // 🔴 ⭐ 「모든 동작은 명령」(쥔님) — 창틀이 제공하는 동작을 전부 명령으로 등록한다(FRAME_COMMAND id, 창틀이 이름을 쥔다).
    //    탭 메뉴·우클릭 메뉴가 이 id 로 runCommand 를 거치고(구조 검사 ⑩), 팔레트에도 같이 뜬다.
    //    ⛔ run 안에서 handlers/focus/panels 를 ref 로 읽는다 — 한 번 등록되고 계속 살아도 늘 최신이게.
    useEffect(() => {
        const H = () => handlersRef.current;
        const target = (ctx?: CommandContext) => ctx?.leafId ?? focusRef.current;
        const tabsOf = (ctx: CommandContext | undefined, leafId: string) => ctx?.tabsId ?? tabsIdOfLeaf(wsRef.current, leafId);
        const add = (id: string, title: string, run: (ctx?: CommandContext) => void, icon?: Parameters<typeof appHost.commands.add>[0]['icon']) =>
            appHost.commands.add({ id, title, icon, run });

        const disp: Disposable[] = [
            add(FRAME_COMMAND.closeTab, '탭 닫기', (c) => { const id = target(c); if (id) H().onClose(id); }, 'x'),
            add(FRAME_COMMAND.closeOthers, '다른 탭 모두 닫기', (c) => { const id = target(c); if (id) H().onCloseOthers(id); }),
            add(FRAME_COMMAND.closeRight, '오른쪽 탭 닫기', (c) => { const id = target(c); if (id) H().onCloseRight(id); }),
            add(FRAME_COMMAND.splitRow, '오른쪽으로 가르기', (c) => { const id = target(c); if (!id) return; const t = tabsOf(c, id); if (t) H().onSplit(t, 'row', id); }, 'split'),
            add(FRAME_COMMAND.splitCol, '아래로 가르기', (c) => { const id = target(c); if (!id) return; const t = tabsOf(c, id); if (t) H().onSplit(t, 'col', id); }, 'splitH'),
            add(FRAME_COMMAND.moveLeft, '왼쪽 사이드바로', (c) => { const id = target(c); if (id) H().onMove(id, 'left'); }, 'panelLeft'),
            add(FRAME_COMMAND.moveCenter, '가운데로', (c) => { const id = target(c); if (id) H().onMove(id, 'center'); }),
            add(FRAME_COMMAND.moveRight, '오른쪽 사이드바로', (c) => { const id = target(c); if (id) H().onMove(id, 'right'); }, 'panelRight'),
            add(FRAME_COMMAND.newTab, '새 탭', (c) => { if (c?.tabsId) H().onAddToTabs(c.tabsId); else H().onAddGlobal(); }, 'plus'),
            add(FRAME_COMMAND.openSettings, '설정 열기', () => { openView('settings.main'); }, 'gear'),
            add(FRAME_COMMAND.toggleLeft, '왼쪽 사이드바 접기/펴기', () => { const p = panelsRef.current; p.toggle('left', !p.state.leftOpen); }, 'panelLeft'),
            add(FRAME_COMMAND.toggleRight, '오른쪽 사이드바 접기/펴기', () => { const p = panelsRef.current; p.toggle('right', !p.state.rightOpen); }, 'panelRight'),
        ];
        return () => { for (const d of disp) d.dispose(); };
    }, [openView]);

    // 🔴 ⭐ 전역 우클릭 통제(항목 A, 쥔님 두 번 지시) — 입력칸·본문(옵트인 클래스) 밖에서는 브라우저
    //    기본 컨텍스트 메뉴를 막는다(가드가 쥔 예외 셀렉터 기준). 글자 선택 차단은 index.css(html user-select:none).
    useEffect(() => installContextMenuGuard(), []);

    // 🔴 명령 팔레트 열기 — Ctrl/⌘+P. ⚠️ 브라우저 인쇄(Ctrl/⌘+P)와 겹쳐 preventDefault 로 가로챈다(보고 항목).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'p' || e.key === 'P')) {
                e.preventDefault();
                setPalette((v) => !v);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // 🔴 사이드바 최소/최대 폭 — 설정 기본값에 그 안 뷰의 minWidth 를 얹는다(무한정 못 줄인다, W4)
    const pane = usePaneSettings();
    const sideMin = (area: 'left' | 'right'): number => {
        const t = firstTabs(ws[area]);
        const active = t ? (t.children.find((c) => c.id === t.activeId) ?? t.children[0]) : null;
        const lay = active ? effectiveViewLayout(active.viewId) : undefined;
        return effectiveMin(pane.settings.sidebarMinWidth, lay?.minWidth);
    };
    const leftMin = sideMin('left');
    const rightMin = sideMin('right');
    const sideMax = pane.settings.sidebarMaxWidth;

    // 빈 사이드바 우클릭 → 뷰 고르기. openView 로 그 자리에(placement·singleton 판정도 같이 거친다)
    const openViewHere = useCallback((area: Exclude<AreaKey, 'center' | 'floating'>, viewId: string) => {
        openView(viewId, { where: area });
    }, [openView]);

    // 사이드바 한쪽을 그린다 — 트리가 있으면 WorkspaceView, 없으면 빈 면.
    // 접기·📌 꼭지(rootChrome)는 넓은 화면에서만 — 좁은 화면 서랍은 막(scrim)으로 닫는다.
    const renderSide = (area: Exclude<AreaKey, 'center' | 'floating'>) => {
        const node = ws[area];
        const pinned = area === 'left' ? panels.state.leftPinned : panels.state.rightPinned;
        const chrome = narrow ? undefined : {
            side: area,
            onCollapse: () => panels.toggle(area, false),
            pinned,
            onTogglePin: () => panels.setPinned(area, !pinned),
        };
        if (!node) return <EmptyArea chrome={chrome} onPick={(viewId) => openViewHere(area, viewId)} />;
        return (
            <WorkspaceView
                node={node}
                narrow={narrow}
                activeLeafId={focus}
                handlers={handlers}
                area={area}
                tabButtons={{}}   // ⛔ 사이드바는 안 가른다(쥔님 01:51) — 탭 줄에 단추 없음
                rootChrome={chrome}
            />
        );
    };

    // 좁은 화면 하단 바·탭 전환이 쓰는 값 — 가운데의 펴진 leaf 목록 + 앱이 바에 꽂는 항목(설정)
    const centerLeaves = flatten(ws.center);
    const barItems: BarItem[] = [
        { id: 'settings', icon: 'gear', label: '설정', onClick: openSettings },
    ];

    // 🔴 타이틀바 오른쪽 액션 슬롯 — 앱이 꽂는다(배열). ⛔ 설정 ⚙ 는 여기 안 둔다(리본 아래에 그대로).
    //    슬롯 자체는 살아 있다 — 쌓을 액션이 생기면 이 배열에 줄을 더한다. 지금은 비운다.
    const titleActions: TitleAction[] = [];
    const showTitleBar = pane.settings.showTitleBar;

    // 🔴 상태바 — 좁은 화면은 설정값(showStatusBar)과 별개로 기본 숨김(statusBarNarrow 로 켠다, 쥔님).
    const showStatus = narrow ? pane.settings.statusBarNarrow : pane.settings.showStatusBar;
    // 🔴 ⭐ 상태바 항목은 이제 앱이 아니라 플러그인이 꽂는다(스케줄러의 「카드 N」). 스토어에서 읽어 그린다.
    //    render() 를 여기서 불러 노드로 넘긴다 — 작업대 이벤트로 스토어가 다시 그려지면 이 render 가 새 값을 준다.
    const statusEntries = useStatusItems();
    const statusItems: StatusItem[] = statusEntries.map((e) => ({ id: `${e.owner}:${e.id}`, side: e.side, node: e.render() }));

    return (
        <div className="flex flex-col h-full w-full overflow-hidden">
            {/* 🔴 상단 타이틀바 — 전체 폭 한 줄(리본·사이드바·가운데 위). 앱 이름·액션은 앱이 넘긴다 */}
            {showTitleBar && <TitleBar title="시간표 짜기" actions={titleActions} />}

            {/* 🔴 리본을 상단에(엑셀식) — 설정 「창틀 › 리본을 상단에」. 같은 Rail 을 가로로 눕힌다(쥔님 13:39) */}
            {!narrow && pane.settings.ribbonPosition === 'top' && (
                <Rail orientation="horizontal" onOpenView={openView} onOpenSettings={openSettings} />
            )}

            {/* 틀 가운데 줄 — 리본·사이드바·가운데·사이드바가 가로로 */}
            <div className="flex flex-1 min-h-0 w-full overflow-hidden">
            {/* 왼쪽 아이콘 레일 — 넓은 화면에서만(리본이 상단이면 여기엔 없다). 좁으면 설정은 탭 줄 ⚙ 로 연다 */}
            {!narrow && pane.settings.ribbonPosition !== 'top' && (
                <Rail onOpenView={openView} onOpenSettings={openSettings} />
            )}

            {/* 왼쪽 사이드바 — 가운데와 같은 패널 트리(W3) */}
            <SidePanel
                side="left"
                open={panels.state.leftOpen}
                pinned={panels.state.leftPinned}
                width={clampWidthTo(panels.state.leftW, leftMin, sideMax)}
                minWidth={leftMin}
                maxWidth={sideMax}
                narrow={narrow}
                onWidth={(w) => panels.setWidth('left', w)}
                onToggle={(o) => panels.toggle('left', o)}
            >
                {renderSide('left')}
            </SidePanel>

            {/* 가운데 — 패널 트리. 🔴 넓은 화면에서 접힌 사이드바는 폭 0 이라, 다시 펴는 ◧/◨ 가 가운데 양 끝에 온다(W6) */}
            <main className="flex-1 min-w-0 flex flex-col">
                <WorkspaceView
                    node={ws.center}
                    narrow={narrow}
                    activeLeafId={focus}
                    handlers={handlers}
                    area="center"
                    // 🔴 세로 가르기(아래로) 단추도 탭 줄에 — 쥔님 2026-11-01 *"패널 세로 나누기 안되노"*.
                    //    우클릭 메뉴·아래 25% 띠 드롭은 되는데 탭 줄엔 「오른쪽으로 가르기」만 있어 세로로 가를 길이 눈에 없었다.
                    tabButtons={{ add: true, splitRow: true, splitCol: true }}
                    centerEdges={narrow ? undefined : {
                        onExpandLeft: panels.state.leftOpen ? undefined : () => panels.toggle('left', true),
                        onExpandRight: panels.state.rightOpen ? undefined : () => panels.toggle('right', true),
                    }}
                />
            </main>

            {/* 오른쪽 사이드바 — 같은 패널 트리(W3) */}
            <SidePanel
                side="right"
                open={panels.state.rightOpen}
                pinned={panels.state.rightPinned}
                width={clampWidthTo(panels.state.rightW, rightMin, sideMax)}
                minWidth={rightMin}
                maxWidth={sideMax}
                narrow={narrow}
                onWidth={(w) => panels.setWidth('right', w)}
                onToggle={(o) => panels.toggle('right', o)}
            >
                {renderSide('right')}
            </SidePanel>

            {/* 🔴 좁은 화면 전용: 하단 플로팅 바 + 탭 전환 시트(W10). 넓은 화면은 한 픽셀도 안 바뀐다 */}
            {narrow && (
                <>
                    <BottomBar
                        items={barItems}
                        tabCount={centerLeaves.length}
                        onOpenLeft={() => panels.toggle('left', true)}
                        onOpenRight={() => panels.toggle('right', true)}
                        onOpenTabs={() => setTabSwitcher(true)}
                        onOpenRibbon={() => setRibbonSheet(true)}
                        aboveStatusBar={showStatus}
                    />
                    <TabSwitcher
                        open={tabSwitcher}
                        onClose={() => setTabSwitcher(false)}
                        tabs={centerLeaves.map((l) => ({ id: l.id, title: l.title, icon: appHost.views.get(l.viewId)?.icon }))}
                        activeId={centerLeaves.some((l) => l.id === focus) ? focus : (centerLeaves[0]?.id ?? null)}
                        onSelect={handlers.onActivate}
                        onCloseTab={handlers.onClose}
                        onNew={addTab}
                    />
                    {/* 🔴 ⑤ 리본 시트 — 하단 바 ▤ 로 연다. 리본 뷰를 열면 openView 가 defaultArea 에 꽂는다(표는 새 표) */}
                    <RibbonSheet
                        open={ribbonSheet}
                        onClose={() => setRibbonSheet(false)}
                        onOpenView={openView}
                    />
                </>
            )}
            </div>

            {/* 🔴 하단 상태바 — 전체 폭 한 줄. 좁은 화면은 기본 숨김(showStatus 가 가른다) */}
            {showStatus && <StatusBar items={statusItems} />}

            {/* 🔴 명령 팔레트 — Ctrl/⌘+P. 스스로 portal 로 뜬다(위치 무관) */}
            <CommandPalette open={palette} onClose={() => setPalette(false)} />
        </div>
    );
}
