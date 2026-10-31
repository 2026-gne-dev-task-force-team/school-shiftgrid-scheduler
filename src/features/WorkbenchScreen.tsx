/**
 * 작업대 화면 — 셸·조각을 조립하고 상태(탭·칸 접힘)를 쥔다.
 * 🔴 조립만 한다 — 색·px 를 쓰지 않는다(그건 조각·셸의 몫). 도메인·엔진·파일은 아직 없다.
 */
import { useCallback, useRef, useState } from 'react';
import { useNarrow, usePanels } from '../core/layout/useScreen';
import { SidePanel } from '../ui/shell/SidePanel';
import { LeftSidebar } from '../ui/shell/LeftSidebar';
import { RightPanel } from '../ui/shell/RightPanel';
import { Tabs, type TabItem } from '../ui/shell/Tabs';
import { EditorArea } from '../ui/shell/EditorArea';

export function WorkbenchScreen() {
    const narrow = useNarrow();
    const panels = usePanels(narrow);

    // 왼쪽 두 칸의 접힘
    const [topCollapsed, setTopCollapsed] = useState(false);
    const [bottomCollapsed, setBottomCollapsed] = useState(false);

    // 탭 — 열기·닫기·전환만 실제로 돈다
    const [tabs, setTabs] = useState<TabItem[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const seq = useRef(0);

    const addTab = useCallback(() => {
        seq.current += 1;
        const id = `t${seq.current}`;
        const tab: TabItem = { id, title: `표 ${seq.current}` };
        setTabs((ts) => [...ts, tab]);
        setActiveId(id);
    }, []);

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
                    top={{ title: '칸 1', collapsed: topCollapsed, onToggle: () => setTopCollapsed((v) => !v) }}
                    bottom={{ title: '칸 2', collapsed: bottomCollapsed, onToggle: () => setBottomCollapsed((v) => !v) }}
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
                />
                <EditorArea tab={activeTab} />
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
