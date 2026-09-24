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
        <header className="no-print flex items-center gap-3 px-3 h-11 bg-panel border-b border-line shrink-0">
            <button className="flex items-center gap-2 text-text hover:text-accenth" onClick={() => st.setScreen('home')} title="홈으로">
                <Icon name="home" size={17} />
                <span className="font-semibold text-[14px]">시간표 짜기</span>
            </button>
            <div className="w-px h-5 bg-line" />
            <div className="min-w-0 flex items-baseline gap-2">
                <span className="text-[13px] font-medium truncate">{st.doc.meta.name || '(학교 이름 없음)'}</span>
                <span className="text-[12px] text-muted truncate">{st.doc.meta.term}</span>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
                <span className="text-[12px] text-muted flex items-center gap-1" title={st.dirty ? '저장 안 한 변경이 있습니다' : '저장됨'}>
                    <Icon name="file" size={13} />{fileName}
                    {st.dirty && <span className="text-warn" title="저장 안 한 변경">●</span>}
                </span>
                <div className="w-px h-5 bg-line mx-1" />
                <Button variant="soft" icon="undo" onClick={st.undo} disabled={!st.canUndo} title="되돌리기 (⌘Z)" />
                <Button variant="soft" icon="redo" onClick={st.redo} disabled={!st.canRedo} title="다시하기 (⌘Y)" />
                <Button variant="primary" icon="save" onClick={() => void st.saveFile()} title="저장 (⌘S)">저장</Button>
            </div>
        </header>
    );
}

function LeftTabs() {
    const st = useStore();
    const hard = st.diag.hardCount;
    const noSetup = st.doc.specs.length === 0 || st.doc.tracks.length === 0;
    return (
        <nav className="no-print w-40 shrink-0 bg-panel border-r border-line flex flex-col py-2">
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
        <footer className="no-print h-7 shrink-0 bg-panel border-t border-line flex items-center gap-3 px-3 text-[12px] text-muted">
            <span className="flex items-center gap-1">
                <Mark kind={hard > 0 ? 'bad' : 'ok'} />
                하드 위반 {hard}건
            </span>
            <span>소프트 벌점 {soft.toLocaleString()}점</span>
            <span>배정 {placed} / 필요 {need}시간</span>
            <span className="ml-auto flex items-center gap-1">
                <Info lines={[
                    '이 줄은 지금 시간표의 상태를 요약합니다.',
                    '하드 위반이 0이라야 시간표가 성립합니다. 소프트 벌점은 낮을수록 좋습니다.',
                    '숫자를 바꾸려면 왼쪽 진단·편집에서 고칩니다.',
                ]} />
            </span>
        </footer>
    );
}

function Notices() {
    const st = useStore();
    if (st.notices.length === 0) return null;
    return (
        <div className="fixed top-12 right-3 z-[200] w-80 space-y-2 no-print">
            {st.notices.map((n) => (
                <ErrorBox key={n.id} title={n.title} lines={n.lines} onClose={() => st.dismiss(n.id)} />
            ))}
        </div>
    );
}
