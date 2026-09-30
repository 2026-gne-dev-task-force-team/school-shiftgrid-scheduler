/**
 * 도움말 서랍 — 오른쪽 서랍(폰은 아래 시트). 탭 셋:
 *   이 화면(content.ts) · 용어(GLOSSARY 검색) · 사용 설명서(docs/사용설명서.md).
 * 아래에 「처음 안내 다시 보기」와 테마 전환.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, type ScreenId } from '../../store/store';
import { useHelp, type HelpTab } from './HelpContext';
import { HELP } from './content';
import { GLOSSARY, type GlossaryEntry } from './terms';
import { DEMOS, type DemoMeta } from './richContent';
import { Markdown, tocOf } from './Markdown';
import { Figure } from './figures/Figure';
import { Demo } from './demos/Demo';
import { Icon } from '../parts/Icon';
import { getTheme, toggleTheme, type Theme } from './theme';
import manual from '../../../docs/사용설명서.md?raw';

const SCREEN_TITLE: Record<ScreenId, string> = {
    home: '홈', basic: '기초자료', blocks: '고정·금지', generate: '자동 배정',
    diagnose: '점검', edit: '직접 조정', boards: '시안', export: '인쇄·내보내기',
};

export function HelpDrawer() {
    const st = useStore();
    const help = useHelp();
    const [theme, setThemeState] = useState<Theme>(getTheme());
    const [search, setSearch] = useState('');
    const panelRef = useRef<HTMLDivElement>(null);

    // 서랍이 열릴 때 용어 항목으로 스크롤
    useEffect(() => {
        if (help.drawerOpen && help.drawerTab === 'glossary' && help.focusTermId) {
            const t = setTimeout(() => {
                document.getElementById(`glo-${help.focusTermId}`)?.scrollIntoView({ block: 'center' });
            }, 60);
            return () => clearTimeout(t);
        }
    }, [help.drawerOpen, help.drawerTab, help.focusTermId]);

    // Esc 로 닫는다 (모달과 같은 습관). ⚠️ 훅은 early return 위에 있어야 한다
    useEffect(() => {
        if (!help.drawerOpen) return;
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); help.closeDrawer(); } };
        window.addEventListener('keydown', h, true);
        return () => window.removeEventListener('keydown', h, true);
    }, [help]);

    if (!help.drawerOpen) return null;

    const tab = help.drawerTab;
    const setTab = (t: HelpTab) => help.setDrawerTab(t);

    const flipTheme = () => { setThemeState(toggleTheme()); };

    return (
        <div className="fixed inset-0 z-[220] no-print" onMouseDown={help.closeDrawer}>
            <div className="absolute inset-0 bg-black/30" />
            <div ref={panelRef}
                className="absolute right-0 top-0 bottom-0 w-full md:w-[460px] bg-panel border-l border-line shadow-2xl flex flex-col
                           max-md:top-auto max-md:h-[85vh] max-md:rounded-t-2xl"
                onMouseDown={(e) => e.stopPropagation()}>
                {/* 머리 */}
                <div className="flex items-center gap-2 px-4 h-12 border-b border-line shrink-0">
                    <Icon name="help" size={18} className="text-accenth" />
                    <span className="text-[14px] font-semibold">도움말</span>
                    <button onClick={help.closeDrawer} className="ml-auto text-muted hover:text-text" aria-label="닫기"><Icon name="x" size={18} /></button>
                </div>

                {/* 탭 — 폰에서 넷이 들어가게 12px */}
                <div className="flex border-b border-line shrink-0 text-[12px] md:text-[13px]">
                    {([['screen', '이 화면'], ['glossary', '용어'], ['demos', '사용법'], ['manual', '사용 설명서']] as [HelpTab, string][]).map(([id, label]) => (
                        <button key={id} onClick={() => setTab(id)}
                            className={`flex-1 py-2.5 border-b-2 whitespace-nowrap ${tab === id ? 'border-accent text-text font-medium' : 'border-transparent text-muted hover:text-text'}`}>
                            {label}
                        </button>
                    ))}
                </div>

                {/* 내용 */}
                <div className="flex-1 min-h-0 overflow-auto p-4">
                    {tab === 'screen' && <ScreenTab screen={st.screen} />}
                    {tab === 'glossary' && <GlossaryTab screen={st.screen} search={search} setSearch={setSearch} focusId={help.focusTermId} />}
                    {tab === 'demos' && <DemosTab screen={st.screen} openId={help.focusTermId} />}
                    {tab === 'manual' && <ManualTab />}
                </div>

                {/* 바닥 */}
                <div className="border-t border-line p-3 flex items-center gap-2 shrink-0">
                    <button onClick={help.restartOnboarding}
                        className="text-[12.5px] flex items-center gap-1.5 bg-panel2 border border-line rounded-md px-2.5 py-2 hover:bg-line">
                        <Icon name="play" size={14} /> 처음 안내 다시 보기
                    </button>
                    <button onClick={flipTheme}
                        className="ml-auto text-[12.5px] flex items-center gap-1.5 bg-panel2 border border-line rounded-md px-2.5 py-2 hover:bg-line">
                        <Icon name={theme === 'light' ? 'moon' : 'sun'} size={14} />
                        {theme === 'light' ? '어두운 화면' : '밝은 화면'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ScreenTab({ screen }: { screen: ScreenId }) {
    const h = HELP[screen];
    const [demoOpen, setDemoOpen] = useState(false);
    return (
        <div className="space-y-4">
            {/* 무엇 */}
            <div>
                <div className="text-[14px] font-semibold mb-1">{SCREEN_TITLE[screen]}</div>
                <p className="text-[13px] text-muted leading-relaxed">{h.what}</p>
            </div>
            {/* 개념 */}
            {h.concept && (
                <div>
                    <div className="text-[13px] font-medium mb-1.5">개념</div>
                    <p className="text-[13px] text-muted leading-relaxed">{h.concept}</p>
                </div>
            )}
            {/* 그림 */}
            {h.figure && <Figure id={h.figure} className="rounded-md border border-line bg-panel2 p-2" />}
            {/* 순서 */}
            <div>
                <div className="text-[13px] font-medium mb-1.5">순서</div>
                <ol className="list-decimal ml-5 space-y-1 text-[13px] text-muted">
                    {h.steps.map((s, i) => <li key={i} className="leading-relaxed">{s}</li>)}
                </ol>
            </div>
            {/* 사용 예 */}
            {h.example && h.example.length > 0 && (
                <div>
                    <div className="text-[13px] font-medium mb-1.5">사용 예</div>
                    <ul className="list-disc ml-5 space-y-1 text-[13px] text-muted">
                        {h.example.map((s, i) => <li key={i} className="leading-relaxed">{s}</li>)}
                    </ul>
                </div>
            )}
            {/* 움직이는 사용법 */}
            {h.demo && (
                <div>
                    <button type="button" onClick={() => setDemoOpen((v) => !v)}
                        className="text-[13px] font-medium text-accenth hover:underline">
                        {demoOpen ? '▼ 움직이는 사용법 접기' : '▶ 움직이는 사용법'}
                    </button>
                    {demoOpen && <div className="mt-2"><Demo id={h.demo} autoplay /></div>}
                </div>
            )}
            {/* 자주 하는 실수 */}
            <div>
                <div className="text-[13px] font-medium mb-1.5">자주 하는 실수</div>
                <ul className="list-disc ml-5 space-y-1 text-[13px] text-muted">
                    {h.mistakes.map((s, i) => <li key={i} className="leading-relaxed">{s}</li>)}
                </ul>
            </div>
        </div>
    );
}

function GlossaryTab({ screen, search, setSearch, focusId }: {
    screen: ScreenId; search: string; setSearch: (v: string) => void; focusId?: string;
}) {
    const list = useMemo(() => {
        const q = search.trim().toLowerCase();
        const matched = GLOSSARY.filter((g) => {
            if (!q) return true;
            const hay = [g.word, g.short, g.long ?? '', ...(g.also ?? [])].join(' ').toLowerCase();
            return hay.includes(q);
        });
        // 현재 화면 관련 항목을 위로
        const rel = (g: typeof GLOSSARY[number]) => (g.screens ?? []).includes(screen as never) ? 0 : 1;
        return matched.slice().sort((a, b) => rel(a) - rel(b));
    }, [search, screen]);

    return (
        <div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="용어 검색"
                className="w-full mb-3 bg-panel2 border border-line rounded-md px-2.5 py-2 text-[13px] outline-none focus:border-accent" />
            {list.length === 0 && <p className="text-[13px] text-muted">찾는 용어가 없습니다.</p>}
            <div className="space-y-3">
                {list.map((g) => <GlossaryCard key={g.id} g={g} focus={g.id === focusId} />)}
            </div>
        </div>
    );
}

function GlossaryCard({ g, focus }: { g: GlossaryEntry; focus: boolean }) {
    const [demoOpen, setDemoOpen] = useState(false);
    const ex = g.example == null ? undefined : Array.isArray(g.example) ? g.example.join(', ') : g.example;
    return (
        <div id={`glo-${g.id}`}
            className={`rounded-md p-2.5 border ${focus ? 'border-accent bg-accent/5' : 'border-line'}`}>
            <div className="text-[13px] font-semibold mb-0.5">{g.word}</div>
            <p className="text-[12.5px] text-muted leading-relaxed">{g.short}</p>
            {g.long && <p className="text-[12.5px] text-muted leading-relaxed mt-1">{g.long}</p>}
            {ex && (
                <div className="mt-1.5 text-[12.5px] leading-relaxed">
                    <span className="text-muted mr-1">예</span><span className="text-text">{ex}</span>
                </div>
            )}
            {g.figure && <Figure id={g.figure} className="mt-2 rounded-md border border-line bg-panel2 p-1.5" />}
            {g.demo && (
                <div className="mt-2">
                    <button type="button" onClick={() => setDemoOpen((v) => !v)}
                        className="text-[12.5px] text-accenth hover:underline">
                        {demoOpen ? '▼ 움직이는 사용법 접기' : '▶ 움직이는 사용법'}
                    </button>
                    {demoOpen && <div className="mt-1.5"><Demo id={g.demo} autoplay /></div>}
                </div>
            )}
        </div>
    );
}

/** 「사용법」 탭 — DEMOS 순으로 카드(아코디언 · 한 번에 하나만 펼친다). 현재 화면 것을 위로 · 첫 것을 펼쳐 둔다 */
function DemosTab({ screen, openId }: { screen: ScreenId; openId?: string }) {
    const ordered = useMemo(() => {
        const rel = (d: DemoMeta) => (d.screen === screen ? 0 : 1);
        return DEMOS.slice().sort((a, b) => rel(a) - rel(b));
    }, [screen]);
    const initial = openId && DEMOS.some((d) => d.id === openId) ? openId : ordered[0]?.id;
    const [openId2, setOpenId2] = useState<string | undefined>(initial);
    // openDrawer('demos', demoId) 로 특정 데모를 펼쳐 열 때
    useEffect(() => { if (openId) setOpenId2(openId); }, [openId]);

    return (
        <div className="space-y-2.5">
            {ordered.map((d) => {
                const isOpen = d.id === openId2;
                return (
                    <div key={d.id} className="rounded-md border border-line">
                        <button type="button" onClick={() => setOpenId2(isOpen ? undefined : d.id)}
                            className="w-full text-left px-3 py-2.5 flex items-start gap-2">
                            <span className="text-accenth text-[12px] mt-0.5 shrink-0">{isOpen ? '▼' : '▶'}</span>
                            <span className="flex-1 min-w-0">
                                <span className="block text-[13px] font-medium">{d.title}</span>
                                <span className="block text-[12px] text-muted leading-snug">{d.desc}</span>
                            </span>
                            {d.screen && <span className="text-[11px] text-muted shrink-0">{SCREEN_TITLE[d.screen as ScreenId] ?? ''}</span>}
                        </button>
                        {isOpen && <div className="px-3 pb-3"><Demo id={d.id} autoplay /></div>}
                    </div>
                );
            })}
        </div>
    );
}

function ManualTab() {
    const toc = useMemo(() => tocOf(manual), []);
    const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    return (
        <div>
            <nav className="mb-3 rounded-md border border-line bg-panel2 p-2.5">
                <div className="text-[12px] font-medium text-muted mb-1">목차</div>
                <ul className="space-y-0.5">
                    {toc.filter((t) => t.level <= 2).map((t) => (
                        <li key={t.id}>
                            <button onClick={() => jump(t.id)}
                                className={`text-left text-[12.5px] hover:text-accenth ${t.level === 1 ? 'font-medium' : 'text-muted ml-2'}`}>
                                {t.text}
                            </button>
                        </li>
                    ))}
                </ul>
            </nav>
            <Markdown md={manual} />
        </div>
    );
}
