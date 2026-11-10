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
    usePaneSettings, getPaneSettings, effectiveViewLayout, effectiveMin, clampWidthTo,
    BottomBar, TabSwitcher, RibbonSheet, type BarItem,
    TitleBar, type TitleAction,
    StatusBar, type StatusItem, StorageErrorStatus, storageStatusKind, Toasts, NotifyStatus,
    installContextMenuGuard, installKeybindings,
    FRAME_COMMAND, viewOpenCommandId, isSidePanelView,
    type WorkspaceHandlers, type Workspace, type AreaKey, type Leaf, type Node,
    leaf, uid, findLeaf, findLeafByView, findLeafByViewParams, firstTabs, flatten, loadWorkspace, saveWorkspace, openLeaf,
    closeLeaf, activateLeaf, splitAt, resize, addLeafToTabs,
    closeOthers, closeToRight, moveLeaf, moveTabWithin, renameLeaf, withLeafGlyph, areaOfLeaf,
    type MovePos,
} from '../pane-ui-system';
import {
    setWorkspaceBridge, makeHost, resetFirstRunFlags, type WorkspaceOpenOptions, type CommandContext, type Disposable,
    useStatusItems, useContribVersion, getNewTab, getCommand, listTabMenu, fireWorkspace, ownerOfView,
    useStorageErrors, useDurability, useNotifications,
    type WorkspaceEvent, type PluginHost, type IconName,
} from '../pane-ui-system/plugin';
import { appHost } from './host';
import { canPlace, canSplit, isSingleton, leafTitle } from '../pane-ui-system/view-registry';   // 자리 제한·제목 — 호스트 앱이 모델 앞에서 묻는다
import './blank';   // 등록은 import 부작용 — 빈 탭 뷰(app.blank)
import './notify-view';   // 알림 패널 뷰(app.notify)
const BLANK_VIEW_ID = 'app.blank';
const NOTIFY_VIEW_ID = 'app.notify';

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
            const owner = ownerOfView(l.viewId);
            // 켜진 플러그인이 더는 내지 않는 뷰도 닫는다(2026-11-09 작은 달력 비활성화 — 남은 calendar.mini 자리표시)
            const dropped = owner && owner.enabled && !owner.blocked && !appHost.views.get(l.viewId);
            if (owner === null || dropped) out = closeLeaf(out, l.id);
        }
    }
    return out;
}

/**
 * 🔴 저장된 배치의 빈 「새 탭」은 되살리지 않는다(#43 — 시작 화면에 빈 새 탭 6개가 쌓여 가르기 칸 8개가 생겼다).
 *    ⚠️ 다른 탭이 하나도 없으면 빈 새 탭 하나만 남긴다(통째로 비면 첫 실행 복구가 돈다).
 */
export function pruneBlankLeaves(ws: Workspace): Workspace {
    const all = (['left', 'center', 'right'] as const).flatMap((a) => (ws[a] ? flatten(ws[a]!) : []));
    const blanks = all.filter((l) => l.viewId === BLANK_VIEW_ID);
    const drop = all.length === blanks.length ? blanks.slice(1) : blanks;
    return drop.reduce((w, l) => closeLeaf(w, l.id), ws);
}

export function Workbench() {
    const narrow = useNarrow();
    const panels = usePanels(narrow);
    useTheme();    // 마운트 때 저장된 테마를 적용한다(반환값은 설정 화면이 따로 쥔다)

    // 패널 트리 — 기기별로 보관된 배치를 읽어 온다. 🔴 첫 실행(저장값 없음)이면 빈 창틀이다 —
    //             ⛔ 아무 뷰도 자동으로 열지 않는다(쥔님 2026-11-01 *"그냥 다 비워줘"*). loadWorkspace 가 빈 배치를 준다.
    //             🔴 단, 저장된 배치가 깨졌거나 고아 뷰 정리(pruneOrphanLeaves)로 왼쪽·가운데·오른쪽이 모두 텅 비었는데
    //                옛 '__first-run' 플래그만 남아 있으면 영영 빈 창에 갇히므로, 첫 실행 플래그를 풀어 기본 배치를 복구한다.
    const [ws, setWs] = useState<Workspace>(() => {
        const loaded = pruneBlankLeaves(pruneOrphanLeaves(loadWorkspace()));
        if (!loaded.left && !loaded.right && flatten(loaded.center).length === 0) {
            resetFirstRunFlags();
        }
        return loaded;
    });
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
        if (l) {
            // 어느 자리 탭인가도 싣는다 — 사이드 패널(탐색기·속성) 포커스는 「탭 바뀜」이 아니라서 듣는 쪽이 가른다(R3).
            const area = (['left', 'center', 'right'] as const).find((a) => { const n = ws[a]; return !!n && flatten(n).some((x) => x.id === l.id); }) ?? (ws.floating.some((x) => x.id === l.id) ? 'floating' : undefined);
            fireWorkspace('activate' as WorkspaceEvent, { id: l.id, viewId: l.viewId, params: l.params, area });
        }
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
            // 비싱글턴 + params 가 있으면 「뷰+params 같은 탭」만 재사용(레코드 탭 — 레코드마다 한 장)
            const ex = !single && o?.params ? findLeafByViewParams(wsRef.current, viewId, o.params) : findLeafByView(wsRef.current, viewId);
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
            setTitle: (leafId: string, title: string) => setWs((w) => renameLeaf(w, leafId, title)),
            setGlyph: (leafId: string, glyph: string | undefined) => setWs((w) => withLeafGlyph(w, leafId, glyph)),
        });
        return () => setWorkspaceBridge(null);
    }, [openView]);

    // 🔴 시작 화면(설정 「창틀 > 시작 화면」, 쥔님 2026-11-09) — 켤 때 한 번, 고른 뷰가 안 떠 있으면 연다.
    //    이미 떠 있으면 손대지 않는다(활성 탭도 안 바꾼다). 꺼진 플러그인 뷰는 openView 가 null 로 건너뛴다.
    //    ref 로 한 번만 — StrictMode 의 두 번째 실행 땐 wsRef 가 아직 옛 배치라 겹쳐 연다.
    const startupDone = useRef(false);
    useEffect(() => {
        if (startupDone.current) return;
        startupDone.current = true;
        for (const id of getPaneSettings().startupViews) {
            if (!findLeafByView(wsRef.current, id)) openView(id);
        }
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
        // 🔴 ⭐ 가르기는 **틀 조작**이다 — 활성 탭을 복제하지 않고 새 쪽에 **빈 탭**을 연다(쥔님 2026-11-01 19:34
        //    *"복제는 아직 만들기엔 복잡한 게 많을 거 같은데 없애주고"* · 세로 나누기가 모든 뷰에서 막혀 있던 뿌리 =
        //    「가르기 = 복제」라 singleton·split:false 뷰는 전부 못 갈랐다). 뷰의 placement 는 안 본다 — 빈 탭은 어디든 간다.
        onSplit: (tabsId, dir, _sourceLeafId) => {
            const newId = uid('leaf');
            setWs((w) => splitAt(w, tabsId, dir, leaf(BLANK_VIEW_ID, '새 탭', { id: newId })));
            setFocus(newId);
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
                // 사이드 패널은 위아래로만 가른다(쥔님 2026-11-08) — 좌우 가르기는 가운데만
                if ((pos === 'left' || pos === 'right') && area !== 'center') return w;
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
        // 🔴 D5③: appHost.commands.add 가 사라졌다 — 창틀 자신의 프레임 명령도 host.declare 로 꽂는다.
        //    run 은 이 effect 의 클로저(refs)라 이름(= 명령 id)으로 impl 에 담고, declare 가 그 이름을 찾아 꽂는다
        //    (함수 직접 받기 금지는 지킨다 — impl 객체를 거친다). fh 의 impl.commands(runs)를 declare 전에 채운다.
        const runs: Record<string, (host: PluginHost, ctx?: CommandContext) => void> = {};
        const fh = makeHost('app', { commands: runs });
        // keys = 기본 단축키(사용자가 설정 「단축키」에서 덮어쓴다 — keybindings.ts)
        const add = (id: string, title: string, run: (ctx?: CommandContext) => void, icon?: IconName, keys?: string) => {
            runs[id] = (_host, ctx) => run(ctx);
            return fh.declare({ kind: 'command', id, title, icon, keys });
        };

        runs['frame.palette.k'] = () => setPalette((v) => !v);
        const disp: Disposable[] = [
            add(FRAME_COMMAND.closeTab, '탭 닫기', (c) => { const id = target(c); if (id) H().onClose(id); }, 'x'),
            add(FRAME_COMMAND.closeOthers, '다른 탭 모두 닫기', (c) => { const id = target(c); if (id) H().onCloseOthers(id); }),
            add(FRAME_COMMAND.closeRight, '오른쪽 탭 닫기', (c) => { const id = target(c); if (id) H().onCloseRight(id); }),
            add(FRAME_COMMAND.splitRow, '오른쪽으로 가르기', (c) => { const id = target(c); if (!id) return; const t = tabsOf(c, id); if (t) H().onSplit(t, 'row', id); }, 'split', 'Mod+\\'),
            add(FRAME_COMMAND.splitCol, '아래로 가르기', (c) => { const id = target(c); if (!id) return; const t = tabsOf(c, id); if (t) H().onSplit(t, 'col', id); }, 'splitH'),
            add(FRAME_COMMAND.moveLeft, '왼쪽 사이드바로', (c) => { const id = target(c); if (id) H().onMove(id, 'left'); }, 'panelLeft'),
            add(FRAME_COMMAND.moveCenter, '가운데로', (c) => { const id = target(c); if (id) H().onMove(id, 'center'); }),
            add(FRAME_COMMAND.moveRight, '오른쪽 사이드바로', (c) => { const id = target(c); if (id) H().onMove(id, 'right'); }, 'panelRight'),
            add(FRAME_COMMAND.newTab, '새 탭', (c) => { if (c?.tabsId) H().onAddToTabs(c.tabsId); else H().onAddGlobal(); }, 'plus'),
            add(FRAME_COMMAND.openSettings, '설정 열기', () => { openView('settings.main'); }, 'gear', 'Mod+,'),
            add(FRAME_COMMAND.openNotify, '알림 패널 열기', () => { openView(NOTIFY_VIEW_ID); }, 'bell'),
            // 🔔 리본에도 선다 — 명령을 가리키는 동작(host.ribbon.add 와 같은 길)
            fh.declare({ kind: 'ribbon', commandId: FRAME_COMMAND.openNotify, icon: 'bell' }),
            add(FRAME_COMMAND.toggleLeft, '왼쪽 사이드바 접기/펴기', () => { const p = panelsRef.current; p.toggle('left', !p.state.leftOpen); }, 'panelLeft', 'Mod+B'),
            add(FRAME_COMMAND.toggleRight, '오른쪽 사이드바 접기/펴기', () => { const p = panelsRef.current; p.toggle('right', !p.state.rightOpen); }, 'panelRight', 'Mod+Alt+B'),
            // ⚠️ 브라우저 인쇄(Ctrl/⌘+P)와 겹쳐 디스패처가 preventDefault 로 가로챈다
            add(FRAME_COMMAND.palette, '명령 팔레트', () => setPalette((v) => !v), 'search', 'Mod+P'),
            // ⌘K / Ctrl+K 도 같은 팔레트 — 팔레트 목록엔 중복으로 안 보이게 숨긴다(keyMap 은 명령 하나에 키 하나)
            fh.declare({ kind: 'command', id: 'frame.palette.k', title: '명령 팔레트 (⌘K)', keys: 'Mod+K', palette: false }),
        ];
        return () => { for (const d of disp) d.dispose(); };
    }, [openView]);

    // 🔴 닫은 옆 패널을 다시 열 길(Q1·X7, 쥔님 11-09 *"속성 패널을 닫으면 다시 열 길이 없다"*) — 옆 패널 뷰마다 「<이름> 열기」 명령 하나.
    //    명령 팔레트에 뜨고, 꾸러미가 viewOpenCommandId 로 리본에 꽂을 수도 있다. 알림 패널은 제 명령(openNotify)이 있어 뺀다.
    //    ⚠️ 의존은 뷰 id 목록 글자(sideSig) — declare 가 기여 버전을 올려서 그걸 의존으로 걸면 무한 반복한다.
    //    뷰 목록은 플러그인을 켜고 끌 때 바뀌고, 그때 위 useContribVersion 이 다시 그려 sideSig 가 다시 계산된다.
    //    ⭐ 꾸러미가 제 `<꾸러미id>.open` 명령을 냈으면 그걸 쓴다(같은 명령이 팔레트에 둘 뜨지 않게).
    const needsOpenCmd = (v: { id: string }) => v.id !== NOTIFY_VIEW_ID && !getCommand(`${ownerOfView(v.id) ?? ''}.open`);
    const sideViews = appHost.views.list().filter(isSidePanelView).filter(needsOpenCmd);
    const sideSig = sideViews.map((v) => `${v.id}:${v.title}`).join('|');
    useEffect(() => {
        const runs: Record<string, (host: PluginHost, ctx?: CommandContext) => void> = {};
        const fh = makeHost('app', { commands: runs });
        const disp: Disposable[] = [];
        for (const v of appHost.views.list().filter(isSidePanelView).filter(needsOpenCmd)) {
            const id = viewOpenCommandId(v.id);
            runs[id] = () => { openView(v.id, { where: v.defaultArea }); };
            disp.push(fh.declare({ kind: 'command', id, title: `${v.title} 열기`, icon: v.icon }));
        }
        return () => { for (const d of disp) d.dispose(); };
    }, [openView, sideSig]);

    // 🔴 ⭐ 전역 우클릭 통제(항목 A, 쥔님 두 번 지시) — 입력칸·본문(옵트인 클래스) 밖에서는 브라우저
    //    기본 컨텍스트 메뉴를 막는다(가드가 쥔 예외 셀렉터 기준). 글자 선택 차단은 index.css(html user-select:none).
    useEffect(() => installContextMenuGuard(), []);

    // 🔴 단축키 디스패처 — 명령의 keys(+사용자 재지정)를 runCommand 로 잇는다. 팔레트 Ctrl/⌘+P 도 이 길이다.
    useEffect(() => installKeybindings(), []);

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
    const notifyUnread = useNotifications().unread;
    const centerLeaves = flatten(ws.center);
    const barItems: BarItem[] = [
        { id: 'notify', icon: 'bell', label: '알림', badge: notifyUnread || undefined, onClick: () => openView(NOTIFY_VIEW_ID) },
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
    // 🔴 ⭐ 창틀이 스스로 꽂는 칸 — 저장 실패·내구성 경고(평시엔 StorageErrorStatus 가 null 이라 안 보인다).
    //    경고가 있으면 상태바를 「숨김 설정」이어도 켠다 — 안 그러면 조용한 저장 유실로 되돌아간다(이 교체의 요지).
    //    내구성(저장 안 됨·위태)도 실패와 같이 force-show 한다 — kind 가 null 이 아니면 비출 게 있다는 뜻.
    const storageErrors = useStorageErrors();
    const storageDurability = useDurability();
    const frameAlert = storageStatusKind(storageErrors.length, storageDurability) !== null;
    // 🔔 알림 칸은 늘 꽂는다(상태바가 보일 때) — 안 읽은 수만 비추고, 누르면 알림 패널. 토스트는 아래 <Toasts/> 가 따로 그린다.
    const frameStatus: StatusItem[] = [
        ...(frameAlert ? [{ id: 'frame:storage-error', side: 'right' as const, node: <StorageErrorStatus /> }] : []),
        { id: 'frame:notify', side: 'right', node: <NotifyStatus /> },
    ];

    return (
        <div className="flex flex-col h-full w-full overflow-hidden">
            <SkipLink />
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
            <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 flex flex-col outline-none">
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
                        aboveStatusBar={showStatus || frameAlert}
                    />
                    <TabSwitcher
                        open={tabSwitcher}
                        onClose={() => setTabSwitcher(false)}
                        tabs={centerLeaves.map((l) => ({ id: l.id, title: leafTitle(l), icon: appHost.views.get(l.viewId)?.icon, glyph: l.glyph }))}
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

            {/* 🔴 하단 상태바 — 전체 폭 한 줄. 좁은 화면은 기본 숨김(showStatus 가 가른다).
                ⭐ 저장 실패가 있으면 숨김 설정이어도 켠다 — 실패를 가리면 조용한 유실이 된다 */}
            {(showStatus || frameAlert) && (
                // 🔴 좁은 화면에서 상태줄이 설정으로 꺼져 있는데 경고만 켜진 경우 — 경고 칸만 한 줄(독은 aboveStatusBar 로 그 위에 뜬다)
                <StatusBar items={narrow && !showStatus ? frameStatus.filter((i) => i.id === 'frame:storage-error') : [...frameStatus, ...statusItems]} />
            )}

            {/* 🔴 명령 팔레트 — Ctrl/⌘+P. 스스로 portal 로 뜬다(위치 무관) */}
            <CommandPalette open={palette} onClose={() => setPalette(false)} />

            {/* 🔔 토스트 — 알림이 잠깐 뜨는 자리(host.notify). 스스로 fixed 로 뜬다 */}
            <Toasts />
        </div>
    );
}

/** #47 건너뛰기 링크 — 앱 맨 앞. 초점 받을 때만 보인다. 누르면 활성 본문(제목 입력칸이 있으면 그 칸, 없으면 본문 영역)에 초점. */
export function SkipLink() {
    return (
        <a href="#main-content" data-skip-link
            className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-toast focus:px-3 focus:py-1.5 focus:rounded focus:bg-bg focus:text-text focus:text-small focus:shadow focus:outline focus:outline-2 focus:outline-accent"
            onClick={(e) => {
                e.preventDefault();
                const main = document.getElementById('main-content');
                if (!main) return;
                const t = main.querySelector<HTMLElement>('input[aria-label="페이지 제목"], [data-testid="table-grid"], [role="tabpanel"] button, h1');
                (t ?? main).focus();
            }}>
            본문으로 건너뛰기
        </a>
    );
}
