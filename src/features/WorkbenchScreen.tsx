/**
 * 작업대 화면 — 셸·조각을 조립하고 상태(패널 트리·사이드바 접힘)를 쥔다.
 * 🔴 조립만 한다 — 색·px 를 쓰지 않는다(그건 조각·셸의 몫).
 *
 * ⭐ 가운데는 패널 트리 모델(Workspace)이 쥔다 — 탭·스플릿·비율이 전부 한 자료구조에 담긴다.
 *    창틀은 viewId 가 무엇인지 모른다. 여기(앱)서 registerView 로 무엇을 그릴지 꽂아 준다.
 *    ⚠️ 왼쪽·오른쪽 사이드바는 아직 옛 PanelState(폭·접힘) 그대로다 — 트리로 옮기는 건 W3 몫이다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    useNarrow, usePanels, SidePanel, LeftSidebar, RightPanel, Rail,
    IconButton, useTheme, WorkspaceView, registerView,
    type WorkspaceHandlers, type Workspace, type ViewProps,
    leaf, loadWorkspace, saveWorkspace,
    openLeaf, closeLeaf, activateLeaf, splitAt, resize, addLeafToTabs,
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
function SettingsView() {
    const theme = useTheme();
    return <SettingsScreen theme={theme} />;
}
registerView({ id: 'sheet', title: '표', icon: 'table', defaultArea: 'center', Component: SheetView });
registerView({ id: 'settings', title: '설정', icon: 'gear', defaultArea: 'center', Component: SettingsView });

export function WorkbenchScreen() {
    const narrow = useNarrow();
    const panels = usePanels(narrow);
    useTheme();    // 마운트 때 저장된 테마를 적용한다(반환값은 설정 화면이 따로 쥔다)

    // 가운데 패널 트리 — 기기별로 보관된 배치를 읽어 온다
    const [ws, setWs] = useState<Workspace>(() => loadWorkspace());
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
        onSplit: (tabsId, dir) => {
            const lf = makeSheet();
            setWs((w) => splitAt(w, tabsId, dir, lf));
            setFocus(lf.id);
        },
        onResize: (splitId, sizes) => setWs((w) => resize(w, splitId, sizes)),
        onAddToTabs: (tabsId) => {
            const lf = makeSheet();
            setWs((w) => addLeafToTabs(w, tabsId, lf));
            setFocus(lf.id);
        },
        onAddGlobal: addTab,
    }), [makeSheet, addTab]);

    return (
        <div className="flex h-full w-full overflow-hidden">
            {/* 왼쪽 아이콘 레일 — 넓은 화면에서만. 좁으면 설정은 탭 줄 ⚙ 로 연다 */}
            {!narrow && (
                <Rail onAdd={addTab} onOpenSettings={openSettings} />
            )}

            {/* 왼쪽 사이드바 — 위·아래 두 칸 (아직 트리 밖 · W3 에서 합친다) */}
            <SidePanel
                side="left"
                title="사이드바"
                open={panels.state.leftOpen}
                width={panels.state.leftW}
                narrow={narrow}
                onWidth={(w) => panels.setWidth('left', w)}
                onToggle={(o) => panels.toggle('left', o)}
            >
                <LeftSidebar
                    split={panels.state.leftSplit}
                    onSplit={panels.setSplit}
                    top={{ title: '칸 1', actions: <IconButton icon="plus" label="칸 1에 추가" size={14} onClick={() => { /* 껍데기 */ }} /> }}
                    bottom={{ title: '칸 2', actions: <IconButton icon="plus" label="칸 2에 추가" size={14} onClick={() => { /* 껍데기 */ }} /> }}
                />
            </SidePanel>

            {/* 가운데 — 패널 트리 */}
            <main className="flex-1 min-w-0 flex flex-col">
                <WorkspaceView
                    node={ws.center}
                    narrow={narrow}
                    activeLeafId={focus}
                    handlers={handlers}
                    narrowBar={{
                        onOpenLeft: () => panels.toggle('left', true),
                        onOpenRight: () => panels.toggle('right', true),
                        onOpenSettings: openSettings,
                    }}
                />
            </main>

            {/* 오른쪽 패널 — 빈 몸통 (아직 트리 밖 · W3) */}
            <SidePanel
                side="right"
                title="속성"
                open={panels.state.rightOpen}
                width={panels.state.rightW}
                narrow={narrow}
                onWidth={(w) => panels.setWidth('right', w)}
                onToggle={(o) => panels.toggle('right', o)}
            >
                <RightPanel title="속성" />
            </SidePanel>
        </div>
    );
}
