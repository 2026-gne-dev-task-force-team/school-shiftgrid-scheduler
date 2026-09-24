/** 판 — 저장·목록·불러오기·공개본·비교. 자동 스냅샷도 여기서 복원 */
import { useMemo, useState } from 'react';
import { useStore } from '../../store/store';
import type { Board, Assignment } from '../../types/schema';
import { cellKey } from '../lib';
import { Button, Card, TextInput, ConfirmButton, Mark, Pill, Info } from '../parts/ui';

export default function BoardsScreen() {
    const st = useStore();
    const { doc } = st;
    const [name, setName] = useState('');
    const [cmp, setCmp] = useState<[string, string]>(['', '']);

    const unplacedOf = (b: Board) => {
        let miss = 0;
        for (const d of doc.demands) {
            const placed = b.assignments.filter((a) => a.demandId === d.id).length;
            miss += Math.max(0, d.count - placed);
        }
        return miss;
    };

    const boards = doc.boards.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const save = () => { st.act.saveBoard(name.trim() || `판 ${new Date().toLocaleString('ko-KR')}`); setName(''); };

    const pickCmp = (id: string) => {
        setCmp(([a, b]) => a === id ? ['', b] : b === id ? [a, ''] : !a ? [id, b] : !b ? [a, id] : [b, id]);
    };
    const both = cmp[0] && cmp[1] ? [doc.boards.find((x) => x.id === cmp[0]), doc.boards.find((x) => x.id === cmp[1])] as [Board?, Board?] : null;

    return (
        <div className="p-4 space-y-4 max-w-4xl">
            <div className="flex items-end gap-2">
                <label className="text-[12px] text-muted">판 이름<br />
                    <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 1차 시안" className="w-56" /></label>
                <Button variant="primary" icon="save" onClick={save}>판 저장</Button>
                <Info lines={[
                    '지금 배치 전부를 이름 붙여 박제합니다 (컴시간의 작업저장).',
                    '여러 판을 놓고 비교한 뒤 하나를 공개본으로 고릅니다. 자동 스냅샷은 큰 변경마다 저절로 쌓입니다.',
                    '되돌리려면 판을 불러오거나 스냅샷을 복원합니다.',
                ]} />
            </div>

            {boards.length === 0 && <p className="text-[13px] text-muted">아직 저장한 판이 없습니다.</p>}

            {boards.length > 0 && (
                <div className="overflow-auto">
                    <table className="text-[12px] border-collapse w-full">
                        <thead><tr className="text-muted text-left">{['', '이름', '시각', '하드', '소프트', '미배정', '자동', '공개본', ''].map((h) => <th key={h} className="border-b border-line px-2 py-1.5 font-medium">{h}</th>)}</tr></thead>
                        <tbody>
                            {boards.map((b) => (
                                <tr key={b.id} className="hover:bg-panel2/50">
                                    <td className="border-b border-line/50 px-2 py-1.5">
                                        <input type="checkbox" checked={cmp.includes(b.id)} onChange={() => pickCmp(b.id)} title="비교에 넣기" />
                                    </td>
                                    <td className="border-b border-line/50 px-2 py-1.5">{b.name}</td>
                                    <td className="border-b border-line/50 px-2 py-1.5 text-muted">{new Date(b.createdAt).toLocaleString('ko-KR')}</td>
                                    <td className="border-b border-line/50 px-2 py-1.5">{b.score ? <span className={b.score.hard > 0 ? 'text-bad' : 'text-ok'}>{b.score.hard}</span> : '-'}</td>
                                    <td className="border-b border-line/50 px-2 py-1.5">{b.score ? b.score.soft.toLocaleString() : '-'}</td>
                                    <td className="border-b border-line/50 px-2 py-1.5">{unplacedOf(b)}</td>
                                    <td className="border-b border-line/50 px-2 py-1.5">{b.auto ? <Pill>자동</Pill> : ''}</td>
                                    <td className="border-b border-line/50 px-2 py-1.5">{b.published && <Mark kind="ok" />}</td>
                                    <td className="border-b border-line/50 px-2 py-1.5 whitespace-nowrap">
                                        <ConfirmButton variant="ghost" icon="undo" label="불러오기" question="지금 배치를 이 판으로 되돌릴까요?" onConfirm={() => st.act.restoreBoard(b.id)} />
                                        <Button variant="soft" onClick={() => st.act.publishBoard(b.id)}>공개본으로</Button>
                                        {!b.published && <ConfirmButton iconOnly onConfirm={() => st.act.deleteBoard(b.id)} question="이 판을 지울까요?" />}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {both && both[0] && both[1] && <Compare a={both[0]} b={both[1]} />}
        </div>
    );
}

function Compare({ a, b }: { a: Board; b: Board }) {
    const diff = useMemo(() => cellDiff(a.assignments, b.assignments), [a, b]);
    return (
        <Card className="p-3">
            <div className="text-[13px] font-medium mb-2">비교 — 「{a.name}」 ↔ 「{b.name}」</div>
            <div className="grid grid-cols-3 gap-2 text-[12px]">
                <div className="bg-panel2 rounded-md p-2 text-center"><div className="text-[18px] font-semibold">{diff}</div><div className="text-muted">다른 칸 수</div></div>
                <ScoreCol title={a.name} s={a.score} />
                <ScoreCol title={b.name} s={b.score} />
            </div>
        </Card>
    );
}
function ScoreCol({ title, s }: { title: string; s?: { hard: number; soft: number } }) {
    return (
        <div className="bg-panel2 rounded-md p-2">
            <div className="text-muted truncate mb-1">{title}</div>
            <div>하드 <span className={(s?.hard ?? 0) > 0 ? 'text-bad' : 'text-ok'}>{s?.hard ?? '-'}</span></div>
            <div>소프트 {s ? s.soft.toLocaleString() : '-'}</div>
        </div>
    );
}

function cellDiff(a: Assignment[], b: Assignment[]): number {
    const sig = (x: Assignment) => `${x.activityId ?? ''}|${x.agentId ?? ''}|${x.resourceId ?? ''}|${x.label ?? ''}`;
    const ma = new Map<string, string>(); const mb = new Map<string, string>();
    for (const x of a) ma.set(cellKey(x.trackId, x.dayIndex, x.slotIndex), sig(x));
    for (const x of b) mb.set(cellKey(x.trackId, x.dayIndex, x.slotIndex), sig(x));
    const keys = new Set([...ma.keys(), ...mb.keys()]);
    let n = 0;
    for (const k of keys) if ((ma.get(k) ?? '') !== (mb.get(k) ?? '')) n += 1;
    return n;
}
