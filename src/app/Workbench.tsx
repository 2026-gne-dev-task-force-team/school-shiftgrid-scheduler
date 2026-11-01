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
    useTheme, WorkspaceView, EmptyArea,
    usePaneSettings, effectiveViewLayout, effectiveMin, clampWidthTo,
    BottomBar, TabSwitcher, RibbonSheet, type BarItem,
    TitleBar, type TitleAction,
    StatusBar, type StatusItem,
    type WorkspaceHandlers, type Workspace, type AreaKey, type Leaf,
    leaf, uid, findLeaf, findLeafByView, firstTabs, flatten, loadWorkspace, saveWorkspace, openLeaf,
    closeLeaf, activateLeaf, splitAt, resize, addLeafToTabs,
    closeOthers, closeToRight, moveLeaf, moveTabWithin, renameLeaf, areaOfLeaf,
    type MovePos,
} from '../pane-ui-system';
import {
    setWorkspaceBridge, type WorkspaceOpenOptions,
    useStatusItems, useContribVersion, getNewTab, listTabMenu, fireWorkspace,
    type WorkspaceEvent,
} from '../pane-ui-system/plugin';
import { appHost } from './host';
import { canPlace, canSplit } from '../pane-ui-system/view-registry';   // 허용 자리 — 호스트 앱이 모델 앞에서 묻는다
import './blank';   // 등록은 import 부작용 — 빈 탭 뷰(app.blank)
const BLANK_VIEW_ID = 'app.blank';

export function Workbench() {
    const narrow = useNarrow();
    const panels = usePanels(narrow);
    useTheme();    // 마운트 때 저장된 테마를 적용한다(반환값은 설정 화면이 따로 쥔다)

    // 패널 트리 — 기기별로 보관된 배치를 읽어 온다. 🔴 첫 실행(저장값 없음)이면 빈 창틀이다 —
    //             ⛔ 아무 뷰도 자동으로 열지 않는다(쥔님 2026-11-01 *"그냥 다 비워줘"*). loadWorkspace 가 빈 배치를 준다.
    const [ws, setWs] = useState<Workspace>(() => loadWorkspace());
    // 좁은 화면에서 지금 보는 leaf(넓은 화면에선 각 묶음의 activeId 를 쓴다)
    const [focus, setFocus] = useState<string>('');
    // 좁은 화면 탭 전환 시트(하단 바 ▦ 로 연다)
    const [tabSwitcher, setTabSwitcher] = useState(false);
    // 좁은 화면 리본 시트(하단 바 ▤ 로 연다, ⑤)
    const [ribbonSheet, setRibbonSheet] = useState(false);
    const seq = useRef(0);

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

    // 🔴 작업대 다리 — 플러그인의 host.workspace.open/close 가 이리로 들어온다(host 는 React 밖에 산다).
    //    스케줄러 카드 상세가 이 다리로 가운데 탭을 연다(singleton).
    useEffect(() => {
        setWorkspaceBridge({
            open: (viewId: string, o?: WorkspaceOpenOptions): string | null => {
                const def = appHost.views.get(viewId);
                if (!def) return null;
                const title = o?.title ?? def.title;
                const area: AreaKey = (o?.where as AreaKey | undefined) ?? def.defaultArea ?? 'center';
                const lf = leaf(viewId, title, { id: def.singleton ? viewId : undefined, params: o?.params });
                setWs((w) => {
                    if (o?.reuse) {
                        const ex = findLeafByView(w, viewId);
                        if (ex) return activateLeaf(w, ex.id);
                    }
                    return openLeaf(w, lf, area);
                });
                setFocus(lf.id);
                return lf.id;
            },
            close: (leafId: string) => setWs((w) => closeLeaf(w, leafId)),
        });
        return () => setWorkspaceBridge(null);
    }, []);

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

    // 설정 — 코어 settings 플러그인의 뷰. id 를 고정해 두면 openLeaf 가 중복 없이 재사용한다(singleton)
    const openSettings = useCallback(() => {
        const lf = leaf('settings.main', '설정', { id: 'settings.main' });
        setWs((w) => openLeaf(w, lf, 'center'));
        setFocus('settings.main');
    }, []);

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

    // 리본 아이콘 → 그 뷰 열기. 있으면 그 탭으로(singleton 은 id 고정), 없으면 defaultArea 에 새로
    const openView = useCallback((viewId: string) => {
        const def = appHost.views.get(viewId);
        if (!def) return;
        setWs((w) => {
            const existing = findLeafByView(w, viewId);
            if (existing) { setFocus(existing.id); return activateLeaf(w, existing.id); }
            const area: AreaKey = def.defaultArea ?? 'center';
            const lf = leaf(viewId, def.title, def.singleton ? { id: viewId } : undefined);
            setFocus(lf.id);
            return openLeaf(w, lf, area);
        });
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

    // 빈 사이드바 우클릭 → 뷰 고르기. 고른 뷰를 그 자리에 연다
    const openViewHere = useCallback((area: Exclude<AreaKey, 'center' | 'floating'>, viewId: string) => {
        const title = appHost.views.get(viewId)?.title ?? viewId;
        const lf = leaf(viewId, title);
        setWs((w) => openLeaf(w, lf, area));
        setFocus(lf.id);
    }, []);

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
        </div>
    );
}
