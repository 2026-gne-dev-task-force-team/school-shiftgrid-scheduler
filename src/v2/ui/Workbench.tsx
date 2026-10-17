/**
 * 작업대 — 세 쪽(탐색기 · 가운데 · 속성) + 상단 바. 켜면 빈 작업대다(아무것도 안 묻는다).
 * ⛔ 환영 화면·코치마크·처음 안내 없음 — 빈 작업대가 설명이다(설계 「이건 진짜 하지 마」).
 */
import { useEffect, useState } from 'react';
import { useV2 } from '../store';
import { Explorer } from './Explorer';
import { Properties } from './Properties';
import { EditorArea } from './EditorArea';
import { Icon } from '../../ui/parts/Icon';
import { MOD } from '../../ui/lib';
import { carriedLabel } from '../migrate';
import { getTheme, toggleTheme, type Theme } from '../../ui/help/theme';

function isEditable(el: EventTarget | null): boolean {
    const t = el as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export function Workbench() {
    const st = useV2();

    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            const meta = e.metaKey || e.ctrlKey;
            if (meta && (e.key === 's' || e.key === 'S')) { e.preventDefault(); void st.saveFile(); return; }
            if (isEditable(e.target)) return;
            if (meta && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return; }
            if (meta && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); st.redo(); }
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [st]);

    return (
        <div className="h-full flex flex-col">
            <TopBar />
            {st.hasAutosave && <ResumeBanner />}
            {st.report && <ReportBanner />}
            <div className="flex-1 min-h-0 flex">
                <aside className="w-56 shrink-0 bg-panel border-r border-line">
                    <Explorer />
                </aside>
                <main className="flex-1 min-w-0 bg-bg p-1.5">
                    <EditorArea />
                </main>
                <aside className="w-72 shrink-0 bg-panel border-l border-line overflow-auto">
                    <Properties />
                </aside>
            </div>
            <Notices />
        </div>
    );
}

function TopBar() {
    const st = useV2();
    const [theme, setTheme] = useState<Theme>(getTheme());
    return (
        <header className="shrink-0 bg-panel border-b border-line flex items-center gap-2 px-3 h-11">
            <span className="font-semibold text-[14px] flex items-center gap-2">
                <Icon name="table" size={17} /> 시간표 짜기
            </span>
            <span className="text-[12px] text-muted ml-1 truncate">
                {st.project.name || '제목 없는 학교'} {st.project.term && `· ${st.project.term}`}
            </span>
            <div className="ml-auto flex items-center gap-1">
                <button className="px-2.5 py-1.5 rounded-md text-[13px] text-muted hover:text-text hover:bg-panel2" onClick={st.newProject} title="새 프로젝트">
                    새로
                </button>
                <button className="px-2.5 py-1.5 rounded-md text-[13px] text-muted hover:text-text hover:bg-panel2 inline-flex items-center gap-1.5"
                    onClick={() => void st.openFile()} title="파일 열기 (v1 파일도 열립니다)">
                    <Icon name="upload" size={14} /> 열기
                </button>
                <div className="w-px h-5 bg-line mx-1" />
                <button className="w-8 h-8 grid place-items-center rounded text-muted hover:text-text hover:bg-panel2 disabled:opacity-40"
                    onClick={st.undo} disabled={!st.canUndo} title={`되돌리기 (${MOD}+Z)`}><Icon name="undo" size={15} /></button>
                <button className="w-8 h-8 grid place-items-center rounded text-muted hover:text-text hover:bg-panel2 disabled:opacity-40"
                    onClick={st.redo} disabled={!st.canRedo} title={`다시하기 (${MOD}+Y)`}><Icon name="redo" size={15} /></button>
                <button className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium bg-accent hover:bg-accenth text-white"
                    onClick={() => void st.saveFile()} title={`다른 이름으로 저장 (${MOD}+S)`}>
                    <Icon name="download" size={15} /> 저장
                    {st.dirty && <span className="text-white/80" title="저장 안 한 변경">●</span>}
                </button>
                <button className="w-8 h-8 grid place-items-center rounded text-muted hover:text-text hover:bg-panel2"
                    onClick={() => setTheme(toggleTheme())} title="밝게/어둡게">
                    <Icon name={theme === 'light' ? 'moon' : 'sun'} size={15} />
                </button>
            </div>
        </header>
    );
}

function ResumeBanner() {
    const st = useV2();
    return (
        <div className="shrink-0 bg-accent/10 border-b border-accent/30 px-3 py-2 flex items-center gap-3 text-[12.5px]">
            <Icon name="info" size={15} className="text-accent" />
            <span className="flex-1">저장하지 않은 작업이 남아 있습니다. 이어서 할까요?</span>
            <button className="px-2.5 py-1 rounded bg-accent text-white" onClick={st.resume}>이어서</button>
            <button className="px-2.5 py-1 rounded text-muted hover:text-text" onClick={st.dismissResume}>아니요</button>
        </div>
    );
}

function ReportBanner() {
    const st = useV2();
    const r = st.report;
    if (!r) return null;
    const bad = !r.ok;
    const carriedList = Object.entries(r.carried)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${carriedLabel(k)} ${n}`)
        .join(' · ');
    return (
        <div className={`shrink-0 border-b px-3 py-2 flex items-start gap-3 text-[12.5px] ${bad ? 'bg-bad/10 border-bad/40' : 'bg-panel2 border-line'}`}>
            <Icon name={bad ? 'warn' : 'info'} size={15} className={bad ? 'text-bad mt-0.5' : 'text-muted mt-0.5'} />
            <div className="flex-1 leading-relaxed">
                <div className="font-medium">
                    v1 파일을 열었습니다 — 반 {r.sheetCount}개를 표로 폈습니다.
                </div>
                <div className="text-muted">
                    {carriedList
                        ? <>아직 화면에 안 보이지만 파일에 그대로 보관한 것: {carriedList} <span className="opacity-70">(다음 모듈에서 씁니다)</span></>
                        : '보관할 다른 항목은 없습니다.'}
                </div>
                {bad && (
                    <div className="text-bad font-medium mt-0.5">
                        ⚠️ 항목 수가 안 맞습니다(원본 {r.sourceTotal} · 보관 {r.heldTotal}). 저장이 막혔습니다.
                    </div>
                )}
            </div>
            <button className="shrink-0 text-muted hover:text-text" onClick={st.dismissReport} title="닫기"><Icon name="x" size={14} /></button>
        </div>
    );
}

function Notices() {
    const st = useV2();
    if (st.notices.length === 0) return null;
    return (
        <div className="fixed right-3 bottom-3 z-[200] w-80 space-y-2">
            {st.notices.map((n) => (
                <div key={n.id}
                    className={`rounded-md border px-3 py-2 text-[12.5px] shadow-lg ${n.kind === 'error' ? 'bg-bad/10 border-bad/40 text-text' : 'bg-ok/10 border-ok/40 text-text'}`}>
                    <div className="flex items-start gap-2">
                        <Icon name={n.kind === 'error' ? 'warn' : 'check'} size={14} className={n.kind === 'error' ? 'text-bad mt-0.5' : 'text-ok mt-0.5'} />
                        <div className="flex-1">
                            <div className="font-medium">{n.title}</div>
                            {n.lines.map((l, i) => <div key={i} className="text-muted">{l}</div>)}
                        </div>
                        <button className="text-muted hover:text-text" onClick={() => st.dismissNotice(n.id)}><Icon name="x" size={13} /></button>
                    </div>
                </div>
            ))}
        </div>
    );
}
