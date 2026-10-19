/**
 * 작업대 — 세 쪽(탐색기 · 가운데 · 속성) + 상단 바. 켜면 빈 작업대다(아무것도 안 묻는다).
 * ⛔ 환영 화면·코치마크·처음 안내 없음 — 빈 작업대가 설명이다(설계 「이건 진짜 하지 마」).
 */
import { useEffect, useRef, useState } from 'react';
import { useV2 } from '../store';
import { Explorer } from './Explorer';
import { Properties } from './Properties';
import { EditorArea } from './EditorArea';
import { SidePanel } from './SidePanel';
import { useNarrow, usePanels, type Panels } from './useScreen';
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
    const narrow = useNarrow();
    const panels = usePanels(narrow);

    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            const meta = e.metaKey || e.ctrlKey;
            if (meta && (e.key === 's' || e.key === 'S')) { e.preventDefault(); void st.saveFile(); return; }
            // 패널 접기/펴기 — 탐색기 Ctrl+B · 속성 Ctrl+Alt+B (VSCode 와 같은 자리)
            if (meta && (e.key === 'b' || e.key === 'B')) {
                e.preventDefault();
                const side = e.altKey ? 'right' : 'left';
                panels.toggle(side, !(side === 'left' ? panels.state.leftOpen : panels.state.rightOpen));
                return;
            }
            if (isEditable(e.target)) return;
            if (meta && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return; }
            if (meta && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); st.redo(); }
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [st, panels]);

    return (
        // 🔴 하단 안전 영역(아이폰 홈 바·안드로이드 제스처 바)만큼 띄운다 — 안 띄우면 마지막 줄이 가려진다
        <div className="h-full flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <TopBar narrow={narrow} panels={panels} />
            {st.hasAutosave && <ResumeBanner />}
            {st.report && <ReportBanner />}
            <div className="flex-1 min-h-0 flex">
                <SidePanel
                    side="left" title="탐색기" narrow={narrow}
                    open={panels.state.leftOpen} width={panels.state.leftW}
                    onWidth={(w) => panels.setWidth('left', w)}
                    onToggle={(o) => panels.toggle('left', o)}
                >
                    {/* 좁은 화면에선 표를 고르면 서랍이 닫힌다 — 안 닫으면 고른 표가 서랍에 가려 안 보인다 */}
                    <Explorer narrow={narrow} onPick={narrow ? () => panels.toggle('left', false) : undefined} />
                </SidePanel>

                <main className="flex-1 min-w-0 bg-bg p-1.5">
                    <EditorArea narrow={narrow} />
                </main>

                <SidePanel
                    side="right" title="속성" narrow={narrow}
                    open={panels.state.rightOpen} width={panels.state.rightW}
                    onWidth={(w) => panels.setWidth('right', w)}
                    onToggle={(o) => panels.toggle('right', o)}
                >
                    <Properties />
                </SidePanel>
            </div>
            <Notices />
        </div>
    );
}

const iconBtn = 'w-8 h-8 grid place-items-center rounded text-muted hover:text-text hover:bg-panel2 shrink-0';

function TopBar({ narrow, panels }: { narrow: boolean; panels: Panels }) {
    const st = useV2();
    const [theme, setTheme] = useState<Theme>(getTheme());
    const [menu, setMenu] = useState(false);

    // 좁은 화면에선 자주 안 쓰는 것(새로·열기·테마)을 ⋮ 안으로 접는다 — 폰 머리줄에 다 못 선다
    return (
        <header className="shrink-0 relative bg-panel border-b border-line flex items-center gap-1 px-2 sm:px-3 h-11">
            <button className={iconBtn} title={`탐색기 접기/펴기 (${MOD}+B)`}
                onClick={() => panels.toggle('left', !panels.state.leftOpen)}>
                <Icon name={narrow ? 'menu' : 'panelLeft'} size={16} />
            </button>

            {!narrow && (
                <span className="font-semibold text-[14px] flex items-center gap-2 shrink-0">
                    <Icon name="table" size={17} /> 시간표 짜기
                </span>
            )}
            <span className="text-[12px] text-muted ml-1 truncate min-w-0">
                {st.project.name || '제목 없는 학교'} {st.project.term && `· ${st.project.term}`}
            </span>

            <div className="ml-auto flex items-center gap-1 shrink-0">
                {!narrow && (
                    <>
                        <button className="px-2.5 py-1.5 rounded-md text-[13px] text-muted hover:text-text hover:bg-panel2" onClick={st.newProject} title="새 프로젝트">
                            새로
                        </button>
                        <button className="px-2.5 py-1.5 rounded-md text-[13px] text-muted hover:text-text hover:bg-panel2 inline-flex items-center gap-1.5"
                            onClick={() => void st.openFile()} title="파일 열기 (v1 파일도 열립니다)">
                            <Icon name="upload" size={14} /> 열기
                        </button>
                        <div className="w-px h-5 bg-line mx-1" />
                    </>
                )}
                <button className={`${iconBtn} disabled:opacity-40`}
                    onClick={st.undo} disabled={!st.canUndo} title={`되돌리기 (${MOD}+Z)`}><Icon name="undo" size={15} /></button>
                <button className={`${iconBtn} disabled:opacity-40`}
                    onClick={st.redo} disabled={!st.canRedo} title={`다시하기 (${MOD}+Y)`}><Icon name="redo" size={15} /></button>
                <button className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium bg-accent hover:bg-accenth text-white shrink-0"
                    onClick={() => void st.saveFile()} title={`다른 이름으로 저장 (${MOD}+S)`}>
                    <Icon name="download" size={15} />
                    {!narrow && '저장'}
                    {st.dirty && <span className="text-white/80" title="저장 안 한 변경">●</span>}
                </button>

                {narrow ? (
                    <button className={iconBtn} onClick={() => setMenu((v) => !v)} title="더 보기">
                        <Icon name="dots" size={16} />
                    </button>
                ) : (
                    <button className={iconBtn}
                        onClick={() => setTheme(toggleTheme())} title="밝게/어둡게">
                        <Icon name={theme === 'light' ? 'moon' : 'sun'} size={15} />
                    </button>
                )}

                <button className={iconBtn} title={`속성 접기/펴기 (${MOD}+Alt+B)`}
                    onClick={() => panels.toggle('right', !panels.state.rightOpen)}>
                    <Icon name={narrow ? 'gear' : 'panelRight'} size={16} />
                </button>
            </div>

            {menu && narrow && (
                <OverflowMenu
                    theme={theme}
                    onClose={() => setMenu(false)}
                    onNew={() => { setMenu(false); st.newProject(); }}
                    onOpen={() => { setMenu(false); void st.openFile(); }}
                    onTheme={() => setTheme(toggleTheme())}
                />
            )}
        </header>
    );
}

function OverflowMenu({
    theme, onClose, onNew, onOpen, onTheme,
}: { theme: Theme; onClose: () => void; onNew: () => void; onOpen: () => void; onTheme: () => void }) {
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const h = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
        // 다음 틱부터 듣는다 — 메뉴를 연 그 누름이 바로 닫지 않게
        const t = setTimeout(() => document.addEventListener('pointerdown', h), 0);
        return () => { clearTimeout(t); document.removeEventListener('pointerdown', h); };
    }, [onClose]);

    const item = 'w-full flex items-center gap-2 px-3 py-2.5 text-[13.5px] text-text hover:bg-panel2 text-left';
    return (
        <div ref={ref} className="absolute right-2 top-11 z-[160] w-44 rounded-md border border-line bg-panel shadow-xl py-1">
            <button className={item} onClick={onNew}><Icon name="plus" size={15} /> 새 프로젝트</button>
            <button className={item} onClick={onOpen}><Icon name="upload" size={15} /> 파일 열기</button>
            <div className="h-px bg-line my-1" />
            <button className={item} onClick={onTheme}>
                <Icon name={theme === 'light' ? 'moon' : 'sun'} size={15} /> {theme === 'light' ? '어둡게' : '밝게'}
            </button>
        </div>
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
        <div className="fixed right-3 z-[200] w-80 max-w-[calc(100vw-1.5rem)] space-y-2"
            style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
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
