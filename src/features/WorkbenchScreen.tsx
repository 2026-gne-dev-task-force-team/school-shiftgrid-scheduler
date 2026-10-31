/**
 * 작업대 화면 — 셸·조각을 조립하고 상태(탭·칸 접힘)를 쥔다.
 * 🔴 조립만 한다 — 색·px 를 쓰지 않는다(그건 조각·셸의 몫). 도메인·엔진·파일은 아직 없다.
 */
import { useCallback, useRef, useState } from 'react';
import {
    useNarrow, usePanels, SidePanel, LeftSidebar, RightPanel, Rail,
    Tabs, type TabItem, EditorArea, IconButton, useTheme,
} from '../workbench';
import { SettingsScreen } from './settings/SettingsScreen';

export function WorkbenchScreen() {
    const narrow = useNarrow();
    const panels = usePanels(narrow);
    const theme = useTheme();

    // 탭 — 열기·닫기·전환만 실제로 돈다
    const [tabs, setTabs] = useState<TabItem[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const seq = useRef(0);

    const addTab = useCallback(() => {
        seq.current += 1;
        const id = `t${seq.current}`;
        const tab: TabItem = { id, title: `표 ${seq.current}`, kind: 'sheet' };
        setTabs((ts) => [...ts, tab]);
        setActiveId(id);
    }, []);

    // 설정 — 이미 열려 있으면 그 탭으로 전환만(중복으로 안 열린다)
    const openSettings = useCallback(() => {
        const existing = tabs.find((t) => t.kind === 'settings');
        if (existing) { setActiveId(existing.id); return; }
        seq.current += 1;
        const id = `s${seq.current}`;
        setTabs((ts) => [...ts, { id, title: '설정', kind: 'settings' }]);
        setActiveId(id);
    }, [tabs]);

    const closeTab = useCallback((id: string) => {
        const idx = tabs.findIndex((t) => t.id === id);
        if (idx < 0) return;
        const next = tabs.filter((t) => t.id !== id);
        setTabs(next);
        // 닫은 것이 활성 탭이면 옆 탭으로 옮긴다(오른쪽 우선, 없으면 왼쪽)
        if (activeId === id) {
            setActiveId(next.length === 0 ? null : (next[idx] ?? next[idx - 1] ?? next[0]).id);
        }
    }, [tabs, activeId]);

    const activeTab = tabs.find((t) => t.id === activeId) ?? null;

    return (
        <div className="flex h-full w-full overflow-hidden">
            {/* 왼쪽 아이콘 레일 — 넓은 화면에서만. 좁으면 설정은 탭 줄 ⚙ 로 연다 */}
            {!narrow && (
                <Rail onAdd={addTab} onOpenSettings={openSettings} />
            )}

            {/* 왼쪽 사이드바 — 위·아래 두 칸 */}
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
                    // ⭐ 끝단은 슬롯이다 — 패널마다 다른 액션이 들어올 자리(지금은 + 하나뿐)
                    top={{ title: '칸 1', actions: <IconButton icon="plus" label="칸 1에 추가" size={14} onClick={() => { /* 껍데기 */ }} /> }}
                    bottom={{ title: '칸 2', actions: <IconButton icon="plus" label="칸 2에 추가" size={14} onClick={() => { /* 껍데기 */ }} /> }}
                />
            </SidePanel>

            {/* 가운데 — 탭 + 빈 면 */}
            <main className="flex-1 min-w-0 flex flex-col">
                <Tabs
                    tabs={tabs}
                    activeId={activeId}
                    onSelect={setActiveId}
                    onClose={closeTab}
                    onAdd={addTab}
                    narrow={narrow}
                    onOpenLeft={() => panels.toggle('left', true)}
                    onOpenRight={() => panels.toggle('right', true)}
                    onOpenSettings={openSettings}
                />
                {activeTab?.kind === 'settings'
                    ? <SettingsScreen theme={theme} />
                    : <EditorArea tab={activeTab} />}
            </main>

            {/* 오른쪽 패널 — 빈 몸통 */}
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
