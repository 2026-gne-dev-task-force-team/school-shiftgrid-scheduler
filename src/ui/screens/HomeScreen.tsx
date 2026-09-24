/** 홈 — 아이콘 격자 7칸 + 파일 시작 버튼. ⛔ 첫 화면을 진단표로 채우지 않는다 */
import { useStore } from '../../store/store';
import { SCREENS } from '../screens';
import { Icon } from '../parts/Icon';
import { Button, Card, ConfirmButton } from '../parts/ui';

export default function HomeScreen() {
    const st = useStore();
    const empty = st.doc.tracks.length === 0 && st.doc.agents.length === 0;

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="mb-5">
                <h1 className="text-[20px] font-semibold">시간표 짜기</h1>
                <p className="text-[13px] text-muted mt-1">규칙을 데이터로 받는 초등 시간표 도구입니다. 아래 순서대로 진행합니다.</p>
            </div>

            {st.hasAutosave && (
                <Card className="mb-4 p-3 flex items-center gap-3 border-accent/40">
                    <Icon name="undo" size={18} className="text-accenth" />
                    <div className="flex-1 text-[13px]">
                        <div className="font-medium">지난 작업본이 남아 있습니다.</div>
                        <div className="text-muted">이어서 하시겠습니까? 새로 시작하면 이 보관본은 덮어써집니다.</div>
                    </div>
                    <Button variant="primary" icon="play" onClick={st.resume}>이어 하기</Button>
                    <Button variant="soft" onClick={st.dismissResume}>닫기</Button>
                </Card>
            )}

            {empty && !st.hasAutosave && (
                <Card className="mb-4 p-4 text-center">
                    <p className="text-[13px] text-muted">아직 학교 자료가 없습니다. 샘플 학교를 불러와 「이렇게 생겼습니다」를 먼저 보거나, 새 학교로 시작하세요.</p>
                </Card>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {SCREENS.map((s, i) => (
                    <button key={s.id} onClick={() => st.setScreen(s.id)}
                        className="group text-left bg-panel border border-line rounded-lg p-4 hover:border-accent hover:bg-panel2 transition-colors">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="w-8 h-8 rounded-md bg-panel2 border border-line grid place-items-center text-accenth group-hover:text-accent">
                                <Icon name={s.icon} size={18} />
                            </span>
                            <span className="text-[11px] text-muted">{i + 1}단계</span>
                        </div>
                        <div className="font-medium text-[14px]">{s.title}</div>
                        <div className="text-[12px] text-muted mt-0.5 leading-snug">{s.desc}</div>
                    </button>
                ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
                <Button variant="primary" icon="folder" onClick={() => void st.openFile()}>파일 열기</Button>
                <Button icon="file" onClick={st.newDoc}>새 학교</Button>
                {empty
                    ? <Button icon="download" onClick={st.loadSample}>샘플 학교 불러오기</Button>
                    : <ConfirmButton variant="ghost" icon="download" label="샘플 학교 불러오기"
                        question="지금 자료를 덮고 샘플을 불러올까요?" onConfirm={st.loadSample} />}
            </div>
        </div>
    );
}
