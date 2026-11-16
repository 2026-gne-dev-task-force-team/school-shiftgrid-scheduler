/**
 * 과목 정리 — 과목 탭을 없앤 자리(R105 ③④).
 *   · 이름 고치기: 과목 이름을 바꾸면 시수표·특별실·배치가 id 로 따라온다. 다른 과목과 같은 이름은 막는다(두 벌 방지).
 *   · 안 쓰는 과목 정리: 시수표·배치(고정 수업 포함)·특별실 과목·저장한 판 어디에도 안 쓰인 과목만 미리 보여 주고 지운다.
 *  ⛔ 저장할 때 자동으로 정리하지 않는다 — 사람이 이 단추를 눌렀을 때만.
 */
import { useState } from 'react';
import { useStore } from '../../../store/store';
import { unusedActivities } from '../../../store/doc-ops';
import { Button, ConfirmButton, Modal, TextInput } from '../../parts/ui';

export default function ActivitiesTidy() {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button icon="edit" onClick={() => setOpen(true)} title="과목 이름 고치기 · 안 쓰는 과목 지우기">과목 정리</Button>
            {open && <TidyModal onClose={() => setOpen(false)} />}
        </>
    );
}

function TidyModal({ onClose }: { onClose: () => void }) {
    const st = useStore();
    const { doc } = st;
    const unused = unusedActivities(doc);
    const unusedIds = new Set(unused.map((a) => a.id));
    const [drafts, setDrafts] = useState<Record<string, string>>({});

    const problemOf = (id: string, text: string): string | undefined => {
        const n = text.trim();
        if (!n) return '이름을 적어 주세요';
        if (doc.activities.some((a) => a.id !== id && a.name === n)) return '같은 이름의 과목이 있습니다';
        return undefined;
    };
    const commitName = (id: string) => {
        const text = drafts[id];
        if (text == null) return;
        if (!problemOf(id, text)) st.act.renameActivity(id, text);
        setDrafts((m) => { const next = { ...m }; delete next[id]; return next; });
    };

    return (
        <Modal title="과목 정리" onClose={onClose}>
            <div className="space-y-4 text-[13px]">
                <section className="space-y-1.5">
                    <div className="font-medium">이름 고치기</div>
                    <p className="text-[12px] text-muted">이름을 바꾸면 시수표·특별실·시간표에 그대로 따라 바뀝니다. 새 과목은 시수표나 특별실의 과목 칸에 이름을 치면 생깁니다.</p>
                    {doc.activities.length === 0 && <p className="text-muted">과목이 아직 없습니다.</p>}
                    <ul className="space-y-1">
                        {doc.activities.map((a) => {
                            const text = drafts[a.id] ?? a.name;
                            const problem = drafts[a.id] != null ? problemOf(a.id, text) : undefined;
                            return (
                                <li key={a.id} className="flex items-center gap-2" data-testid="tidy-row">
                                    <TextInput value={text} aria-label={`${a.name} 이름`}
                                        onChange={(e) => setDrafts((m) => ({ ...m, [a.id]: e.target.value }))}
                                        onBlur={() => commitName(a.id)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') commitName(a.id); }}
                                        className={`w-40 ${problem ? 'border-bad' : ''}`} />
                                    {problem && <span className="text-[12px] text-bad">{problem}</span>}
                                    {!problem && unusedIds.has(a.id) && <span className="text-[12px] text-muted">안 쓰임</span>}
                                </li>
                            );
                        })}
                    </ul>
                </section>
                <section className="space-y-1.5 border-t border-line pt-3">
                    <div className="font-medium">안 쓰는 과목 정리</div>
                    <p className="text-[12px] text-muted">시수표·시간표(고정 수업 포함)·특별실·저장한 판 어디에도 안 쓰인 과목만 지웁니다. 쓰이는 과목은 지우지 않습니다.</p>
                    {unused.length === 0
                        ? <p className="text-muted">지울 과목이 없습니다.</p>
                        : (
                            <>
                                <p data-testid="tidy-preview">지울 과목 {unused.length}개: {unused.map((a) => a.name).join(', ')}</p>
                                <ConfirmButton label={`${unused.length}개 지우기`} question={`안 쓰는 과목 ${unused.length}개를 지울까요?`}
                                    onConfirm={() => st.act.removeUnusedActivities(unused.map((a) => a.id))} />
                            </>
                        )}
                </section>
            </div>
        </Modal>
    );
}
