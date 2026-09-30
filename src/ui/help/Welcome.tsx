/**
 * 환영 화면 — 처음 켰을 때(자료도 자동 보관본도 없고 welcomed 표시도 없을 때) 홈 위에 뜨는 단계별 걸음 안내.
 *   0장   이 프로그램은 세 걸음입니다 (전체 흐름 그림 · 데모 없음)
 *   1~8장 각 단계가 무엇을 하나 (단계마다 움직이는 사용법 하나 + 「여기서 하는 일」)
 *          — 기초자료는 「기초자료」와 「시수표」 두 장으로 나눈다
 *   9장   시작하기 (샘플 둘러보기 · 새 학교 · 파일 열기)
 * ←/→ 로 넘기고 Esc 로 건너뛴다. 도움말 서랍에서 다시 열 수 있다. 저장: localStorage['shiftgrid.welcomed'].
 */
import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../../store/store';
import { useHelp } from './HelpContext';
import { Icon } from '../parts/Icon';
import { Demo } from './demos/Demo';
import { Figure } from './figures/Figure';
import type { DemoId, FigureId } from './rich';

const WELCOMED_KEY = 'shiftgrid.welcomed';
export function hasWelcomed(): boolean {
    try { return localStorage.getItem(WELCOMED_KEY) === '1'; } catch { return false; }
}
function markWelcomed(): void {
    try { localStorage.setItem(WELCOMED_KEY, '1'); } catch { /* 무시 */ }
}

interface WPage {
    title: string;
    lead: string;
    figure?: FigureId;
    demo?: DemoId;
    bullets?: string[];
}

/**
 * 설명 장(0~8). 마지막 「시작하기」 장은 PageStart 가 따로 그린다.
 * 글은 처음 켠 초등 교무 선생님이 읽는다는 전제 — 「~합니다」 격식체 · 화면 요소는 「」 ·
 * 각 장 첫 문장은 「왜 이 단계가 있나」를 말한다. 개발 낱말·비유를 쓰지 않는다.
 */
const PAGES: WPage[] = [
    {
        title: '이 프로그램은 세 걸음입니다',
        lead: '초등학교 전담 시간표를, 처음부터 끝까지 세 걸음으로 만듭니다.',
        figure: 'flow',
        bullets: [
            '첫째, 우리 학교의 교사·과목·반과 주마다 필요한 수업 횟수를 적습니다.',
            '둘째, 「자동 배정 시작」을 누르면 규칙을 지키는 시간표가 저절로 만들어집니다.',
            '셋째, 마음에 안 드는 곳을 손으로 다듬은 뒤 인쇄하거나 파일로 내보냅니다.',
        ],
    },
    {
        title: '1단계 · 기초자료',
        lead: '학년마다 교시 수와 점심 시각이 달라서, 먼저 우리 학교의 하루 모양과 교사·과목을 적어 둡니다. 담임은 명부에 넣지 않고 반의 속성으로 두는 것이 이 프로그램의 특징입니다.',
        demo: 'homeroom-fill',
        bullets: [
            '「시간 틀」에서 학년별 교시 수와 점심 시각을 정합니다.',
            '「반」·「교사」·「과목」·「특별실」을 채웁니다.',
            '담임을 따로 넣지 않으면, 전담 수업을 뺀 빈 칸이 모두 담임 수업이 됩니다.',
        ],
    },
    {
        title: '1단계 (이어서) · 시수표',
        lead: '누가 어느 반에서 무슨 과목을 주에 몇 번 하는지 정해야 시간표를 짤 수 있어서, 「시수표」에 그 횟수를 적습니다.',
        demo: 'demand-to-grid',
        bullets: [
            '교사·과목·반마다 「주당 시수」(주에 필요한 수업 횟수)를 적습니다.',
            '엑셀에서 표를 복사해 「시수표」 첫 칸에 붙일 수도 있습니다.',
            '오른쪽 「배정/필요」에서 아직 배정하지 못한 「남음」을 확인합니다.',
        ],
    },
    {
        title: '2단계 · 고정·금지',
        lead: '특정 시각에 수업을 넣으면 안 되거나 반드시 넣어야 하는 사정이 있어서, 자동 배정 전에 그런 칸을 먼저 정해 둡니다.',
        demo: 'block-cycle',
        bullets: [
            '칸을 누르면 「배정 불가」·「되도록 피함」·「임시 불가」가 차례로 바뀝니다.',
            '「배정 불가」는 절대 넣지 않고, 「되도록 피함」은 되도록 피하기만 합니다.',
            '미리 정해진 수업은 「고정 수업」으로 그 칸에 못박아 둡니다.',
        ],
    },
    {
        title: '3단계 · 자동 배정',
        lead: '규칙을 모두 지키며 손으로 시간표를 짜기는 어려워서, 프로그램이 시간표 후보 여럿을 대신 만들어 줍니다.',
        demo: 'pick-candidate',
        bullets: [
            '「자동 배정 시작」을 누르면 시간표 후보 여러 장이 만들어집니다.',
            '후보마다 「필수 위반」 건수와 「권장 점수」를 견줍니다.',
            '가장 나은 후보의 「이 후보로 진행」을 눌러 시간표에 적용합니다.',
        ],
    },
    {
        title: '4단계 · 점검',
        lead: '자동으로 만든 시간표에도 아쉬운 곳이 남을 수 있어서, 규칙별로 문제가 몇 건인지 살펴봅니다.',
        demo: 'diagnose-fix',
        bullets: [
            '규칙마다 어긋난 건수를 한눈에 봅니다.',
            '행을 누르면 어느 칸이 문제인지 목록이 열립니다.',
            '「자동 개선」을 누르면 프로그램이 문제 건수를 줄여 줍니다.',
        ],
    },
    {
        title: '5단계 · 직접 조정',
        lead: '자동 배정이 미처 모르는 우리 학교 사정이 있어서, 마지막으로 칸을 손으로 옮겨 다듬습니다.',
        demo: 'move-lesson',
        bullets: [
            '옮길 수업 칸을 누르면 갈 수 있는 칸이 색으로 켜집니다.',
            '초록 칸을 누르면 「이동 미리보기」로 전·후를 견줍니다.',
            '「이동」을 누르면 수업이 그 자리로 옮겨집니다.',
        ],
    },
    {
        title: '6단계 · 시안',
        lead: '여러 안을 만들어 견주고 싶을 때가 있어서, 지금 시간표를 「시안」으로 보관해 둡니다.',
        demo: 'save-board',
        bullets: [
            '이름을 붙여 「시안 저장」으로 지금 시간표를 보관합니다.',
            '여러 시안을 나란히 두고 견줍니다.',
            '배부할 안을 「확정본으로 지정」합니다.',
        ],
    },
    {
        title: '7단계 · 인쇄·내보내기',
        lead: '완성한 시간표를 나눠 주어야 해서, 보기 좋게 인쇄하거나 파일로 내보냅니다.',
        demo: 'print-export',
        bullets: [
            '「반별」·「교사별」·「특별실별」로 보기를 바꿉니다.',
            '「인쇄」로 흑백 표를 뽑습니다.',
            '「엑셀로 내보내기」와 작업 파일로 저장해 둡니다.',
        ],
    },
];

const N = PAGES.length + 1;   // 설명 장 + 시작하기 장

export function Welcome() {
    const st = useStore();
    const help = useHelp();
    const [page, setPage] = useState(0);
    const isStart = page === PAGES.length;

    const close = useCallback(() => { markWelcomed(); help.closeWelcome(); }, [help]);
    const startSample = () => { markWelcomed(); st.loadSample(); help.startTour(); };
    const startNew = () => { markWelcomed(); st.newDoc(); help.closeWelcome(); };
    const openFile = () => { markWelcomed(); help.closeWelcome(); void st.openFile(); };

    // 키보드 ←/→ 로 넘기고 Esc 로 건너뛴다
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') setPage((p) => Math.min(N - 1, p + 1));
            else if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1));
            else if (e.key === 'Escape') close();
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [close]);

    return (
        <div className="fixed inset-0 z-[250] bg-black/55 flex items-end md:items-center justify-center p-0 md:p-4 no-print" onMouseDown={close}>
            <div data-welcome className="bg-panel border border-line rounded-t-2xl md:rounded-xl shadow-2xl w-full md:w-[620px] max-w-full max-h-[94vh] overflow-auto"
                onMouseDown={(e) => e.stopPropagation()}>
                {/* 머리 — 오른쪽에 n / N */}
                <div className="flex items-center justify-end px-5 md:px-6 pt-3.5">
                    <span className="text-[12px] text-muted tabular-nums">{page + 1} / {N}</span>
                </div>
                <div className="px-5 md:px-6 pb-2 pt-1">
                    {isStart
                        ? <PageStart onSample={startSample} onNew={startNew} onOpen={openFile} />
                        : <PageContent p={PAGES[page]} />}
                </div>
                <div className="flex items-center gap-2 px-5 md:px-6 py-3 border-t border-line">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {Array.from({ length: N }, (_, i) => (
                            <span key={i} className={`w-2 h-2 rounded-full ${i === page ? 'bg-accent' : 'bg-line'}`} />
                        ))}
                    </div>
                    <button onClick={close} className="ml-auto text-[13px] text-muted hover:text-text px-2 py-1.5">건너뛰기</button>
                    {page > 0 && (
                        <button onClick={() => setPage(page - 1)} className="text-[13px] text-muted hover:text-text px-2 py-1.5">이전</button>
                    )}
                    {page < N - 1 && (
                        <button onClick={() => setPage(page + 1)} className="text-[13px] font-medium bg-accent hover:bg-accenth text-white rounded-md px-3.5 py-1.5">다음</button>
                    )}
                </div>
            </div>
        </div>
    );
}

/** 설명 한 장 — 제목 · 왜 이 단계가 있나 · (그림 또는 움직이는 사용법) · 여기서 하는 일 */
function PageContent({ p }: { p: WPage }) {
    return (
        <div>
            <h2 className="text-[18px] font-semibold mb-1.5">{p.title}</h2>
            <p className="text-[13px] text-muted mb-3 leading-relaxed">{p.lead}</p>
            {p.figure && <Figure id={p.figure} className="rounded-md border border-line bg-panel2 p-2" />}
            {p.demo && <Demo id={p.demo} autoplay className="rounded-md border border-line bg-panel2 p-2" />}
            {p.bullets && p.bullets.length > 0 && (
                <div className="mt-3.5">
                    {p.demo && <div className="text-[12.5px] font-medium mb-1.5">여기서 하는 일</div>}
                    <ul className="list-disc ml-5 space-y-1 text-[13px] text-text">
                        {p.bullets.map((b, i) => <li key={i} className="leading-relaxed">{b}</li>)}
                    </ul>
                </div>
            )}
        </div>
    );
}

function PageStart({ onSample, onNew, onOpen }: { onSample: () => void; onNew: () => void; onOpen: () => void }) {
    return (
        <div>
            <h2 className="text-[18px] font-semibold mb-1.5">어떻게 시작할까요?</h2>
            <p className="text-[13px] text-muted mb-4 leading-relaxed">처음이라면 샘플 학교로 전체 흐름을 먼저 둘러보시길 권합니다.</p>
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
