/**
 * 작업대 화면 — 셸·조각을 조립하고 상태(패널 트리·사이드바 폭/접힘/고정)를 쥔다.
 * 🔴 조립만 한다 — 색·px 를 쓰지 않는다(그건 조각·셸의 몫).
 *
 * ⭐ 가운데·왼쪽·오른쪽이 전부 같은 패널 트리 모델(Workspace)이 쥔다 — 탭·스플릿·비율이 한 자료구조에(W3).
 *    창틀은 viewId 가 무엇인지 모른다. 여기(앱)서 registerView 로 무엇을 그릴지 꽂아 준다.
 *    사이드바의 「개요·속성」 같은 이름도 전부 뷰 등록소가 주고, 창틀은 끝내 모른다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    useNarrow, usePanels, SidePanel, Rail,
    useTheme, WorkspaceView, EmptyArea, registerView, getView,
    usePaneSettings, effectiveViewLayout, effectiveMin, clampWidthTo,
    type WorkspaceHandlers, type Workspace, type ViewProps, type AreaKey,
    leaf, uid, findLeaf, findLeafByView, firstTabs, loadWorkspace, saveWorkspace, hasWorkspace, openLeaf,
    closeLeaf, activateLeaf, splitAt, resize, addLeafToTabs,
    closeOthers, closeToRight, moveLeaf, renameLeaf,
} from '../pane-ui-system';
import { SettingsScreen } from './settings/SettingsScreen';

// ── 뷰 등록 — 창틀 바깥(앱)에서 무엇을 그릴지 꽂는다 ──
function SheetView({ leaf: lf }: ViewProps) {
    return (
        <div className="h-full grid place-items-center px-6 text-center">
            <p className="text-2xl font-light text-muted/50 select-none truncate max-w-full">{lf.title}</p>
        </div>
    );
}
function SettingsView({ collapsed }: ViewProps) {
    const theme = useTheme();
    // ⭐ collapsed 는 창틀이 재서 준다(폭 < collapseBelow) — 설정 왼쪽 메뉴를 아이콘만으로 접는다
    return <SettingsScreen theme={theme} collapsed={collapsed} />;
}
// ⭐ 데모용 빈 뷰 — 이름·아이콘은 등록소가 준다(창틀은 모른다). 사이드바가 트리로 뭘 담는지 보여 줄 뿐이다.
function EmptyView({ leaf: lf }: ViewProps) {
    return (
        <div className="h-full grid place-items-center px-6 text-center">
            <p className="text-[13px] text-muted/50 select-none truncate max-w-full">{lf.title} · (빈 뷰)</p>
        </div>
    );
}
// ⭐ 뷰마다 「레이아웃 힌트」가 다르다 — "무슨 콘텐츠냐에 따라"(쥔님). 등록값은 기본, 설정이 덮는다.
//    표: 좁아지면 스크롤(내용이 안 없어진다) · 설정: 좁아지면 접힌다(옵시디언 설정) · 데모 둘: 찌그러짐.
registerView({
    id: 'sheet', title: '표', icon: 'table', defaultArea: 'center', Component: SheetView,
    layout: { minWidth: 240, squeeze: 'scroll' },
    ribbon: { order: 0 },
    // 🔴 내용 메뉴 — 틀 메뉴(닫기·가르기)와 구분선으로 갈린다. 데모: 제목만 바꾼다
    menu: (lf, host) => [
        {
            label: '이름 바꾸기', icon: 'edit',
            onClick: () => { const n = window.prompt('새 이름', lf.title); if (n && n.trim()) host.rename(n.trim()); },
        },
    ],
});
registerView({
    id: 'settings', title: '설정', icon: 'gear', defaultArea: 'center', Component: SettingsView,
    singleton: true,
    layout: { minWidth: 320, squeeze: 'collapse', collapseBelow: 480 },
});
registerView({
    id: 'outline', title: '개요', icon: 'layers', defaultArea: 'left', Component: EmptyView,
    layout: { minWidth: 180, squeeze: 'shrink' }, ribbon: { order: 1 },
});
registerView({
    id: 'props', title: '속성', icon: 'info', defaultArea: 'right', Component: EmptyView,
    layout: { minWidth: 200, squeeze: 'shrink' }, ribbon: { order: 2 },
});

/** 첫 실행(저장값 없음)에만 까는 기본 배치 — 사이드바에 데모 뷰 둘을 기본으로 */
function firstRunWorkspace(): Workspace {
    let ws = loadWorkspace();                                   // 빈 배치
    ws = openLeaf(ws, leaf('outline', '개요', { id: 'outline' }), 'left');
    ws = openLeaf(ws, leaf('props', '속성', { id: 'props' }), 'right');
    return ws;
}

export function WorkbenchScreen() {
    const narrow = useNarrow();
    const panels = usePanels(narrow);
    useTheme();    // 마운트 때 저장된 테마를 적용한다(반환값은 설정 화면이 따로 쥔다)

    // 패널 트리 — 기기별로 보관된 배치를 읽어 온다. 저장값이 없으면 기본 배치를 깐다
    const [ws, setWs] = useState<Workspace>(() => (hasWorkspace() ? loadWorkspace() : firstRunWorkspace()));
    // 좁은 화면에서 지금 보는 leaf(넓은 화면에선 각 묶음의 activeId 를 쓴다)
    const [focus, setFocus] = useState<string>('');
    const seq = useRef(0);

    useEffect(() => { saveWorkspace(ws); }, [ws]);

    const makeSheet = useCallback(() => {
        seq.current += 1;
        return leaf('sheet', `표 ${seq.current}`);
    }, []);

    const addTab = useCallback(() => {
        const lf = makeSheet();
        setWs((w) => openLeaf(w, lf, 'center'));
        setFocus(lf.id);
    }, [makeSheet]);

    // 설정 — id 를 고정해 두면 openLeaf 가 중복 없이 재사용한다
    const openSettings = useCallback(() => {
        const lf = leaf('settings', '설정', { id: 'settings' });
        setWs((w) => openLeaf(w, lf, 'center'));
        setFocus('settings');
    }, []);

    const handlers: WorkspaceHandlers = useMemo(() => ({
        onActivate: (id) => { setWs((w) => activateLeaf(w, id)); setFocus(id); },
        onClose: (id) => setWs((w) => closeLeaf(w, id)),
        // 🔴 가르기 = 원본 탭(sourceLeafId)을 복제해 옆에 — 새 「표 N」 아님(W8, 옵시디언식)
        onSplit: (tabsId, dir, sourceLeafId) => {
            const dupId = uid('leaf');
            setWs((w) => {
                const src = findLeaf(w, sourceLeafId);
                if (!src) return w;
                return splitAt(w, tabsId, dir, leaf(src.viewId, src.title, { id: dupId }));
            });
            setFocus(dupId);
        },
        onResize: (splitId, sizes) => setWs((w) => resize(w, splitId, sizes)),
        onAddToTabs: (tabsId) => {
            const lf = makeSheet();
            setWs((w) => addLeafToTabs(w, tabsId, lf));
            setFocus(lf.id);
        },
        onAddGlobal: addTab,
        onCloseOthers: (id) => setWs((w) => closeOthers(w, id)),
        onCloseRight: (id) => setWs((w) => closeToRight(w, id)),
        onMove: (id, to) => { setWs((w) => moveLeaf(w, id, to, 'after')); setFocus(id); },
        onRename: (id, title) => setWs((w) => renameLeaf(w, id, title)),
    }), [makeSheet, addTab]);

    // 리본 아이콘 → 그 뷰 열기. 표는 매번 새 표, 나머지는 있으면 그 탭으로(singleton 은 id 고정)
    const openView = useCallback((viewId: string) => {
        const def = getView(viewId);
        if (!def) return;
        if (viewId === 'sheet') { addTab(); return; }
        setWs((w) => {
            const existing = findLeafByView(w, viewId);
            if (existing) { setFocus(existing.id); return activateLeaf(w, existing.id); }
            const area: AreaKey = def.defaultArea ?? 'center';
            const lf = leaf(viewId, def.title, def.singleton ? { id: viewId } : undefined);
            setFocus(lf.id);
            return openLeaf(w, lf, area);
        });
    }, [addTab]);

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
        const title = getView(viewId)?.title ?? viewId;
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
                tabButtons={narrow ? {} : { splitCol: true }}
                rootChrome={chrome}
            />
        );
    };

    return (
        <div className="flex h-full w-full overflow-hidden">
            {/* 왼쪽 아이콘 레일 — 넓은 화면에서만. 좁으면 설정은 탭 줄 ⚙ 로 연다 */}
            {!narrow && (
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
                    narrowBar={{
                        onOpenLeft: () => panels.toggle('left', true),
                        onOpenRight: () => panels.toggle('right', true),
                        onOpenSettings: openSettings,
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
        </div>
    );
}
