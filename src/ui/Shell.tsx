/** 껍데기 — 상단 바 + 왼쪽 7단계 세로 탭 + 본문 + 상태줄. Esc=홈, ⌘Z/Y, ⌘S */
import { useEffect, type ReactNode } from 'react';
import { useStore } from '../store/store';
import { SCREENS } from './screens';
import { Icon } from './parts/Icon';
import { Button, Mark, Info } from './parts/ui';
import { ErrorBox } from './parts/ui';

import HomeScreen from './screens/HomeScreen';
import BasicScreen from './screens/BasicScreen';
import BlocksScreen from './screens/BlocksScreen';
import GenerateScreen from './screens/GenerateScreen';
import DiagnoseScreen from './screens/DiagnoseScreen';
import EditScreen from './screens/EditScreen';
import BoardsScreen from './screens/BoardsScreen';
import ExportScreen from './screens/ExportScreen';

function isEditable(el: EventTarget | null): boolean {
    const t = el as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export default function Shell() {
    const st = useStore();

    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            const meta = e.metaKey || e.ctrlKey;
            if (meta && (e.key === 's' || e.key === 'S')) { e.preventDefault(); void st.saveFile(); return; }
            if (isEditable(e.target)) return;
            if (meta && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return; }
            if (meta && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); st.redo(); return; }
            if (e.key === 'Escape' && !e.defaultPrevented) { if (st.screen !== 'home') st.setScreen('home'); }
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [st]);

    // Electron 파일 메뉴(새로·열기·저장·다른 이름으로)를 스토어에 잇는다. 웹에서는 다리가 없어 그냥 지나간다
    useEffect(() => {
        const bridge = (window as unknown as { shiftgridMenu?: { onAction(cb: (a: string, p?: unknown) => void): () => void } }).shiftgridMenu;
        if (!bridge) return;
        return bridge.onAction((action, payload) => {
            if (action === 'new') st.newDoc();
            else if (action === 'open' && payload) st.loadOpened(payload as Parameters<typeof st.loadOpened>[0]);
            else if (action === 'save') void st.saveFile();
            else if (action === 'saveAs') void st.saveFileAs();
        });
    }, [st]);

    const body = renderScreen(st.screen);

    return (
        <div className="h-full flex flex-col">
            <TopBar />
            <div className="flex-1 min-h-0 flex">
                {st.screen !== 'home' && <LeftTabs />}
                <main className="flex-1 min-w-0 flex flex-col">
                    <div className="flex-1 min-h-0 overflow-auto">{body}</div>
                    <StatusBar />
                </main>
            </div>
            {st.screen !== 'home' && <BottomTabBar />}
            <Notices />
        </div>
    );
}

function renderScreen(id: string): ReactNode {
    switch (id) {
        case 'home': return <HomeScreen />;
        case 'basic': return <BasicScreen />;
        case 'blocks': return <BlocksScreen />;
        case 'generate': return <GenerateScreen />;
        case 'diagnose': return <DiagnoseScreen />;
        case 'edit': return <EditScreen />;
        case 'boards': return <BoardsScreen />;
        case 'export': return <ExportScreen />;
        default: return <HomeScreen />;
    }
}

function TopBar() {
    const st = useStore();
    const fileName = st.path ? st.path.split(/[\\/]/).pop() : '저장 안 됨';
    return (
        <header className="no-print shrink-0 bg-panel border-b border-line" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <div className="flex items-center gap-2 md:gap-3 px-2 md:px-3 h-11">
                <button className="flex items-center gap-2 text-text hover:text-accenth" onClick={() => st.setScreen('home')} title="홈으로">
                    <Icon name="home" size={17} />
                    <span className="font-semibold text-[14px] hidden md:inline">시간표 짜기</span>
                </button>
                <div className="w-px h-5 bg-line hidden md:block" />
                <div className="min-w-0 flex items-baseline gap-2">
                    <span className="text-[13px] font-medium truncate">{st.doc.meta.name || '(학교 이름 없음)'}</span>
                    <span className="text-[12px] text-muted truncate hidden md:inline">{st.doc.meta.term}</span>
                </div>
                <div className="ml-auto flex items-center gap-1 md:gap-1.5">
                    <span className="text-[12px] text-muted items-center gap-1 hidden md:flex" title={st.dirty ? '저장 안 한 변경이 있습니다' : '저장됨'}>
                        <Icon name="file" size={13} />{fileName}
                        {st.dirty && <span className="text-warn" title="저장 안 한 변경">●</span>}
                    </span>
                    {st.dirty && <span className="text-warn md:hidden" title="저장 안 한 변경">●</span>}
                    <div className="w-px h-5 bg-line mx-1 hidden md:block" />
                    <Button variant="soft" icon="undo" onClick={st.undo} disabled={!st.canUndo} title="되돌리기 (⌘Z)" />
                    <Button variant="soft" icon="redo" onClick={st.redo} disabled={!st.canRedo} title="다시하기 (⌘Y)" />
                    <Button variant="primary" icon="save" onClick={() => void st.saveFile()} title="저장 (⌘S)"><span className="hidden md:inline">저장</span></Button>
                </div>
            </div>
        </header>
    );
}

function LeftTabs() {
    const st = useStore();
    const hard = st.diag.hardCount;
    const noSetup = st.doc.specs.length === 0 || st.doc.tracks.length === 0;
    return (
        <nav className="no-print hidden md:flex w-40 shrink-0 bg-panel border-r border-line flex-col py-2">
            {SCREENS.map((s, i) => {
                const active = st.screen === s.id;
                // 🔴만 센다 — 하드 위반이 있으면 생성·진단·편집에 붙인다
                const showHard = hard > 0 && (s.id === 'diagnose' || s.id === 'edit' || s.id === 'generate');
                const showWarn = noSetup && s.id === 'basic';
                return (
                    <button key={s.id} onClick={() => st.setScreen(s.id)}
                        className={`flex items-center gap-2.5 px-3 py-2 text-[13px] text-left border-l-2 transition-colors
                            ${active ? 'border-accent bg-panel2 text-text' : 'border-transparent text-muted hover:text-text hover:bg-panel2/60'}`}>
                        <span className="text-muted/70 text-[11px] w-3">{i + 1}</span>
                        <Icon name={s.icon} size={16} />
                        <span className="flex-1">{s.title}</span>
                        {showHard && <Mark kind="bad" className="text-[11px]" />}
                        {showWarn && <Mark kind="warn" className="text-[11px]" />}
                    </button>
                );
            })}
        </nav>
    );
}

function StatusBar() {
    const st = useStore();
    const hard = st.diag.hardCount;
    const soft = st.diag.softWeight;
    const placed = st.demand.reduce((s, d) => s + d.placed, 0);
    const need = st.demand.reduce((s, d) => s + d.need, 0);
    return (
        <footer className="no-print h-7 shrink-0 bg-panel border-t border-line flex items-center gap-2 md:gap-3 px-2 md:px-3 text-[12px] text-muted overflow-x-auto whitespace-nowrap">
            <span className="flex items-center gap-1 shrink-0">
                <Mark kind={hard > 0 ? 'bad' : 'ok'} />
                하드 위반 {hard}건
            </span>
            <span className="shrink-0">소프트 벌점 {soft.toLocaleString()}점</span>
            <span className="shrink-0">배정 {placed} / 필요 {need}시간</span>
            <span className="ml-auto flex items-center gap-1 shrink-0">
                <Info lines={[
                    '이 줄은 지금 시간표의 상태를 요약합니다.',
                    '하드 위반이 0이라야 시간표가 성립합니다. 소프트 벌점은 낮을수록 좋습니다.',
                    '숫자를 바꾸려면 왼쪽 진단·편집에서 고칩니다.',
                ]} />
            </span>
        </footer>
    );
}

// ── 하단 탭 바 (폰) — 왼쪽 세로 탭의 자리를 대신한다 ───────────
function BottomTabBar() {
    const st = useStore();
    const hard = st.diag.hardCount;
    const noSetup = st.doc.specs.length === 0 || st.doc.tracks.length === 0;
    return (
        <nav className="no-print md:hidden flex overflow-x-auto bg-panel border-t border-line shrink-0"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {SCREENS.map((s) => {
                const active = st.screen === s.id;
                const showHard = hard > 0 && (s.id === 'diagnose' || s.id === 'edit' || s.id === 'generate');
                const showWarn = noSetup && s.id === 'basic';
                return (
                    <button key={s.id} onClick={() => st.setScreen(s.id)}
                        className={`relative flex-1 min-w-[56px] flex flex-col items-center justify-center gap-0.5 min-h-[48px] py-1 text-[10px] leading-none
                            ${active ? 'text-accenth' : 'text-muted'}`}>
                        <Icon name={s.icon} size={19} />
                        <span className="truncate max-w-full px-0.5">{s.title}</span>
                        {showHard && <Mark kind="bad" className="absolute top-0.5 right-2 text-[9px]" />}
                        {showWarn && <Mark kind="warn" className="absolute top-0.5 right-2 text-[9px]" />}
                    </button>
                );
            })}
        </nav>
    );
}

function Notices() {
    const st = useStore();
    if (st.notices.length === 0) return null;
    return (
        <div className="fixed right-2 md:right-3 left-2 md:left-auto z-[200] w-auto md:w-80 space-y-2 no-print"
            style={{ top: 'calc(env(safe-area-inset-top) + 3rem)' }}>
            {st.notices.map((n) => (
                <ErrorBox key={n.id} title={n.title} lines={n.lines} onClose={() => st.dismiss(n.id)} />
            ))}
        </div>
    );
}
