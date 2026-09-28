/** 홈 — 「다음 할 일」 콜아웃 + 7단계 카드(상태 배지) + 파일 시작 버튼 */
import { useStore, type ScreenId } from '../../store/store';
import { SCREENS } from '../screens';
import { Icon } from '../parts/Icon';
import { Button, Card, ConfirmButton, Pill } from '../parts/ui';
import { L } from '../help/terms';

type Status =
    | { kind: 'done' }
    | { kind: 'progress' }
    | { kind: 'todo' }
    | { kind: 'optional' }
    | { kind: 'count'; n: number };

export default function HomeScreen() {
    const st = useStore();
    const { doc } = st;
    const empty = doc.tracks.length === 0 && doc.agents.length === 0;
    const hasAssign = doc.assignments.some((a) => !a.fixed);
    const hard = st.diag.hardCount;

    const statusOf = (id: ScreenId): Status => {
        switch (id) {
            case 'basic': {
                const parts = [doc.specs.length > 0, doc.tracks.length > 0, doc.demands.length > 0];
                if (parts.every(Boolean)) return { kind: 'done' };
                if (parts.some(Boolean)) return { kind: 'progress' };
                return { kind: 'todo' };
            }
            case 'blocks': return { kind: 'optional' };
            case 'generate': return hasAssign ? { kind: 'done' } : { kind: 'todo' };
            case 'diagnose':
                if (!hasAssign) return { kind: 'todo' };
                return hard > 0 ? { kind: 'count', n: hard } : { kind: 'done' };
            case 'edit': return { kind: 'optional' };
            case 'boards': return doc.boards.length > 0 ? { kind: 'done' } : { kind: 'todo' };
            case 'export': return doc.boards.some((b) => b.published) ? { kind: 'done' } : { kind: 'todo' };
            default: return { kind: 'todo' };
        }
    };

    // 다음 할 일 — 필수 사슬(기초자료→자동 배정→점검→시안→인쇄)에서 첫 미완 단계
    const chain: { id: ScreenId; msg: string }[] = [
        { id: 'basic', msg: '시수표를 채우세요' },
        { id: 'generate', msg: '자동 배정을 실행하세요' },
        { id: 'diagnose', msg: '필수 위반을 점검하세요' },
        { id: 'boards', msg: '시안을 저장하세요' },
        { id: 'export', msg: '확정본을 인쇄하세요' },
    ];
    const nextStep = chain.find((c) => {
        const s = statusOf(c.id);
        return s.kind !== 'done';
    });

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-6">
            <div className="mb-4">
                <h1 className="text-[20px] font-semibold">{L.app}</h1>
                <p className="text-[13px] text-muted mt-1">{L.tagline} 아래 순서대로 진행합니다.</p>
            </div>

            {st.hasAutosave && (
                <Card className="mb-4 p-3 flex items-center gap-3 border-accent/40">
                    <Icon name="undo" size={18} className="text-accenth" />
                    <div className="flex-1 text-[13px]">
                        <div className="font-medium">지난 작업본이 남아 있습니다.</div>
                        <div className="text-muted">이어서 하시겠습니까? 새로 시작하면 이 보관본은 덮어써집니다.</div>
                    </div>
                    <Button variant="primary" icon="play" onClick={st.resume}>{L.resume}</Button>
                    <Button variant="soft" onClick={st.dismissResume}>닫기</Button>
                </Card>
            )}

            {/* 다음 할 일 콜아웃 */}
            {!empty && nextStep && (
                <button data-tour="home-next" onClick={() => st.setScreen(nextStep.id)}
                    className="w-full mb-4 flex items-center gap-2 rounded-lg border border-accent/50 bg-accent/10 hover:bg-accent/15 px-4 py-3 text-left transition-colors">
                    <span className="text-[13px] font-medium text-text">다음: {nextStep.msg}</span>
                    <Icon name="arrowRight" size={18} className="ml-auto text-accenth" />
                </button>
            )}

            {empty && !st.hasAutosave && (
                <Card className="mb-4 p-4 text-center">
                    <p className="text-[13px] text-muted">아직 학교 자료가 없습니다. 샘플 학교를 불러와 전체 흐름을 먼저 보거나, 새 학교로 시작하세요.</p>
                </Card>
            )}

            <div data-tour="home-steps" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {SCREENS.map((s, i) => (
                    <button key={s.id} onClick={() => st.setScreen(s.id)}
                        className="group text-left bg-panel border border-line rounded-lg p-4 hover:border-accent hover:bg-panel2 transition-colors">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="w-8 h-8 rounded-md bg-panel2 border border-line grid place-items-center text-accenth group-hover:text-accent">
                                <Icon name={s.icon} size={18} />
                            </span>
                            <span className="text-[11px] text-muted">{i + 1}단계</span>
                            <span className="ml-auto"><StatusBadge s={statusOf(s.id)} /></span>
                        </div>
                        <div className="font-medium text-[14px]">{s.title}</div>
                        <div className="text-[12px] text-muted mt-0.5 truncate md:whitespace-normal md:text-clip md:leading-snug">{s.desc}</div>
                    </button>
                ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
                <Button variant="primary" icon="folder" onClick={() => void st.openFile()}>{L.open}</Button>
                <Button icon="file" onClick={st.newDoc}>{L.newDoc}</Button>
                {empty
                    ? <Button icon="download" onClick={st.loadSample}>{L.loadSample}</Button>
                    : <ConfirmButton variant="ghost" icon="download" label={L.loadSample}
                        question="지금 자료를 덮고 샘플을 불러올까요?" onConfirm={st.loadSample} />}
            </div>
        </div>
    );
}

function StatusBadge({ s }: { s: Status }) {
    switch (s.kind) {
        case 'done': return <Pill tone="ok">완료</Pill>;
        case 'progress': return <Pill tone="accent">진행 중</Pill>;
        case 'count': return <Pill tone="bad">{s.n}건</Pill>;
        case 'optional': return <Pill tone="muted">필요할 때</Pill>;
        case 'todo':
        default: return <Pill tone="muted">대기</Pill>;
    }
}
