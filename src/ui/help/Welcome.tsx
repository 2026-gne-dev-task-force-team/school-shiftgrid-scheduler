/**
 * 환영 화면 — 처음 켰을 때(자료도 자동 보관본도 없고 welcomed 표시도 없을 때) 홈 위에 뜨는 모달 3장.
 *   1장 무엇을 하는 프로그램인가 (그림)
 *   2장 7단계 흐름 (도표)
 *   3장 시작하기 (샘플 둘러보기 · 새 학교 · 파일 열기)
 * 도움말 서랍에서 다시 열 수 있다. 저장: localStorage['shiftgrid.welcomed'].
 */
import { useState } from 'react';
import { useStore } from '../../store/store';
import { useHelp } from './HelpContext';
import { SCREENS } from '../screens';
import { Icon } from '../parts/Icon';

const WELCOMED_KEY = 'shiftgrid.welcomed';
export function hasWelcomed(): boolean {
    try { return localStorage.getItem(WELCOMED_KEY) === '1'; } catch { return false; }
}
function markWelcomed(): void {
    try { localStorage.setItem(WELCOMED_KEY, '1'); } catch { /* 무시 */ }
}

export function Welcome() {
    const st = useStore();
    const help = useHelp();
    const [page, setPage] = useState(0);

    const close = () => { markWelcomed(); help.closeWelcome(); };
    const startSample = () => { markWelcomed(); st.loadSample(); help.startTour(); };
    const startNew = () => { markWelcomed(); st.newDoc(); help.closeWelcome(); };
    const openFile = () => { markWelcomed(); help.closeWelcome(); void st.openFile(); };

    return (
        <div className="fixed inset-0 z-[250] bg-black/55 flex items-end md:items-center justify-center p-0 md:p-4 no-print" onMouseDown={close}>
            <div className="bg-panel border border-line rounded-t-2xl md:rounded-xl shadow-2xl w-full md:w-[560px] max-w-full max-h-[94vh] overflow-auto"
                onMouseDown={(e) => e.stopPropagation()}>
                <div className="p-5 md:p-6">
                    {page === 0 && <PageIntro />}
                    {page === 1 && <PageFlow />}
                    {page === 2 && <PageStart onSample={startSample} onNew={startNew} onOpen={openFile} />}
                </div>
                <div className="flex items-center gap-2 px-5 md:px-6 py-3 border-t border-line">
                    <div className="flex items-center gap-1.5">
                        {[0, 1, 2].map((i) => (
                            <span key={i} className={`w-2 h-2 rounded-full ${i === page ? 'bg-accent' : 'bg-line'}`} />
                        ))}
                    </div>
                    <button onClick={close} className="ml-auto text-[13px] text-muted hover:text-text px-2 py-1.5">건너뛰기</button>
                    {page > 0 && (
                        <button onClick={() => setPage(page - 1)} className="text-[13px] text-muted hover:text-text px-2 py-1.5">이전</button>
                    )}
                    {page < 2 && (
                        <button onClick={() => setPage(page + 1)} className="text-[13px] font-medium bg-accent hover:bg-accenth text-white rounded-md px-3.5 py-1.5">다음</button>
                    )}
                </div>
            </div>
        </div>
    );
}

function PageIntro() {
    return (
        <div>
            <h2 className="text-[19px] font-semibold mb-1">시간표 짜기</h2>
            <p className="text-[13px] text-muted mb-4">초등학교 전담 시간표를 자동으로 배정하고 직접 조정하는 프로그램입니다.</p>
            <FlowSvg />
            <div className="text-[13.5px] text-text space-y-1.5 mt-4 leading-relaxed">
                <p>교사·과목·반·주당 시수를 「시수표」에 적으면, 규칙을 지키는 시간표를 자동으로 만들어 줍니다.</p>
                <p>마음에 들지 않는 칸은 손으로 옮겨 다듬고, 완성되면 인쇄하거나 파일로 내보냅니다.</p>
            </div>
        </div>
    );
}

/** 시수표 → 자동 배정 → 시간표 그림 (인라인 SVG · 색은 테마 변수) */
function FlowSvg() {
    return (
        <svg viewBox="0 0 460 120" className="w-full h-auto" role="img" aria-label="시수표에서 자동 배정을 거쳐 시간표가 됩니다">
            <g fill="none" stroke="rgb(var(--c-line))" strokeWidth="1.5">
                <rect x="12" y="24" width="110" height="72" rx="8" fill="rgb(var(--c-panel2))" />
                <rect x="188" y="24" width="84" height="72" rx="8" fill="rgb(var(--c-panel2))" />
                <rect x="338" y="24" width="110" height="72" rx="8" fill="rgb(var(--c-panel2))" />
            </g>
            {/* 시수표 */}
            <g stroke="rgb(var(--c-muted))" strokeWidth="1.2">
                <line x1="24" y1="44" x2="110" y2="44" /><line x1="24" y1="60" x2="110" y2="60" /><line x1="24" y1="76" x2="110" y2="76" />
            </g>
            {/* 자동 배정 (별) */}
            <path d="M230 44l4 11 11 4-11 4-4 11-4-11-11-4 11-4z" fill="rgb(var(--c-accent))" stroke="none" />
            {/* 시간표 격자 */}
            <g>
                {[0, 1, 2, 3].map((c) => [0, 1, 2].map((r2) => (
                    <rect key={`${c}-${r2}`} x={350 + c * 24} y={36 + r2 * 18} width="20" height="14" rx="2"
                        fill={(c + r2) % 2 === 0 ? 'rgb(var(--c-accent))' : 'rgb(var(--c-line))'} />
                )))}
            </g>
            {/* 화살표 */}
            <g stroke="rgb(var(--c-muted))" strokeWidth="1.8" fill="none">
                <path d="M132 60h44M320 60h8" markerEnd="" />
                <path d="M168 54l8 6-8 6" /><path d="M300 54l8 6-8 6" />
                <path d="M132 60h44M272 60h36" />
            </g>
            <text x="67" y="112" textAnchor="middle" fill="rgb(var(--c-muted))" fontSize="11">시수표</text>
            <text x="230" y="112" textAnchor="middle" fill="rgb(var(--c-muted))" fontSize="11">자동 배정</text>
            <text x="393" y="112" textAnchor="middle" fill="rgb(var(--c-muted))" fontSize="11">시간표</text>
        </svg>
    );
}

function PageFlow() {
    return (
        <div>
            <h2 className="text-[17px] font-semibold mb-1">일곱 단계로 완성합니다</h2>
            <p className="text-[13px] text-muted mb-4">아래 순서를 차례로 밟으면 시간표가 완성됩니다. 홈에서 다음 할 일을 짚어 드립니다.</p>
            <ol className="space-y-2">
                {SCREENS.map((s, i) => (
                    <li key={s.id} className="flex items-start gap-2.5">
                        <span className="shrink-0 w-7 h-7 rounded-md bg-panel2 border border-line grid place-items-center text-accenth">
                            <Icon name={s.icon} size={16} />
                        </span>
                        <div>
                            <span className="text-[13px] font-medium">{i + 1}. {s.title}</span>
                            <span className="block text-[12px] text-muted leading-snug">{s.desc}</span>
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    );
}

function PageStart({ onSample, onNew, onOpen }: { onSample: () => void; onNew: () => void; onOpen: () => void }) {
    return (
        <div>
            <h2 className="text-[17px] font-semibold mb-1">어떻게 시작할까요?</h2>
            <p className="text-[13px] text-muted mb-4">처음이라면 샘플 학교로 전체 흐름을 먼저 둘러보시길 권합니다.</p>
            <div className="space-y-2.5">
                <button onClick={onSample} className="w-full text-left rounded-lg border border-accent/50 bg-accent/10 hover:bg-accent/15 p-3.5 flex items-center gap-3">
                    <Icon name="download" size={20} className="text-accenth" />
                    <div>
                        <div className="text-[14px] font-medium">샘플 학교로 둘러보기</div>
                        <div className="text-[12px] text-muted">지어낸 학교로 각 화면을 안내와 함께 살펴봅니다.</div>
                    </div>
                </button>
                <button onClick={onNew} className="w-full text-left rounded-lg border border-line hover:bg-panel2 p-3.5 flex items-center gap-3">
                    <Icon name="file" size={20} className="text-muted" />
                    <div>
                        <div className="text-[14px] font-medium">새 학교 만들기</div>
                        <div className="text-[12px] text-muted">빈 자료에서 우리 학교를 새로 만듭니다.</div>
                    </div>
                </button>
                <button onClick={onOpen} className="w-full text-left rounded-lg border border-line hover:bg-panel2 p-3.5 flex items-center gap-3">
                    <Icon name="folder" size={20} className="text-muted" />
                    <div>
                        <div className="text-[14px] font-medium">파일 열기</div>
                        <div className="text-[12px] text-muted">전에 저장해 둔 작업 파일(.shiftgrid.json)을 엽니다.</div>
                    </div>
                </button>
            </div>
        </div>
    );
}
