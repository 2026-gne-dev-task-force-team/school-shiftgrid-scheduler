/**
 * 생성 폼 3종 — 폼 자체가 저장 스키마의 구조를 그대로 드러낸다.
 *
 *  · 규격(TimetableSpec): 스키마가 정의하는 네 가지를 전부 묻는다
 *      ① 며칠마다 반복(cycleDays) ② 그중 일하는 날(activeDays)
 *      ③ 하루 시작(dayStart) ④ 칸 나누기(slots — 교시 수·수업/쉬는 시간)
 *      → 아래에 생성될 슬롯 미리보기.
 *  · 교사/교과/시설(Entity): 공통 골격 그대로 — 이름 + 자유 속성(attr).
 *      색과 담당 과목도 attr에 들어가는 자유 속성일 뿐이다.
 *  · 학반(Track): 이름 + 자유 속성 (담임·학년 등).
 */
import { useMemo, useState, type KeyboardEvent } from 'react';
import { Overlay } from './CombinedView';
import { useStore, type EntityFamily } from '../../store/store';
import { periods } from '../../model/seed';
import { PALETTE } from './ui';

const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];

const field = 'w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-400';
const label = 'block text-[11px] font-semibold text-slate-500 mb-1';

/** 자유 속성(attr) 편집 줄들 — "학교마다 다른 정보를 자유롭게" 그 자체 */
function AttrRows({ rows, setRows, hint }: {
    rows: { k: string; v: string }[];
    setRows: (r: { k: string; v: string }[]) => void;
    hint: string;
}) {
    return (
        <div>
            <span className={label}>자유 속성 (attr) <span className="font-normal text-slate-400">— {hint}</span></span>
            <div className="space-y-1">
                {rows.map((row, i) => (
                    <div key={i} className="flex items-center gap-1">
                        <input
                            value={row.k} placeholder="이름 (예: 직급)"
                            onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, k: e.target.value } : r)))}
                            className={`${field} !w-28`}
                        />
                        <span className="text-slate-300 text-xs">=</span>
                        <input
                            value={row.v} placeholder="값 (예: 부장)"
                            onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, v: e.target.value } : r)))}
                            className={field}
                        />
                        <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 text-xs px-1">×</button>
                    </div>
                ))}
            </div>
            <button
                onClick={() => setRows([...rows, { k: '', v: '' }])}
                className="mt-1 text-[11px] text-blue-600 hover:text-blue-700"
            >＋ 속성 추가</button>
        </div>
    );
}

/** rows → attr 객체 (빈 이름은 버림) */
const rowsToAttr = (rows: { k: string; v: string }[]): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    rows.forEach(({ k, v }) => { if (k.trim()) out[k.trim()] = v; });
    return out;
};

/** 색 고르기 스와치 */
function ColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
    return (
        <div>
            <span className={label}>색 <span className="font-normal text-slate-400">— 표시용 자유 속성(attr.color)</span></span>
            <div className="flex gap-1.5">
                {PALETTE.map((c) => (
                    <button
                        key={c}
                        onClick={() => onChange(c)}
                        className={`w-6 h-6 rounded-full transition-transform ${value === c ? 'ring-2 ring-offset-1 ring-blue-500 scale-110' : 'hover:scale-110'}`}
                        style={{ backgroundColor: c }}
                    />
                ))}
            </div>
        </div>
    );
}

const submitOnEnter = (submit: () => void) => (e: KeyboardEvent) => { if (e.key === 'Enter') submit(); };

// ══════════════════════════════════════════════════════════════
//  교사 / 교과 / 시설 — Entity 공통 골격 (이름 + attr)
// ══════════════════════════════════════════════════════════════
export function EntityCreateModal({ family, onClose }: { family: EntityFamily; onClose: () => void }) {
    const { doc, dispatch } = useStore();
    const noun = family === 'agents' ? '교사' : family === 'activities' ? '교과' : '시설';
    const [name, setName] = useState('');
    const [color, setColor] = useState(PALETTE[doc[family].length % PALETTE.length]);
    const [subject, setSubject] = useState('');
    const [rows, setRows] = useState<{ k: string; v: string }[]>([]);

    const submit = () => {
        if (!name.trim()) return;
        const attr: Record<string, unknown> = { color, ...rowsToAttr(rows) };
        if (family === 'agents' && subject.trim()) attr.subject = subject.trim();
        dispatch({ type: 'ADD_ENTITY', family, name: name.trim(), attr });
        onClose();
    };

    return (
        <Overlay title={`새 ${noun}`} onClose={onClose} size="md">
            <div className="space-y-3">
                <div>
                    <span className={label}>이름</span>
                    <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={submitOnEnter(submit)}
                        placeholder={family === 'agents' ? '예: 홍길동' : family === 'activities' ? '예: 도덕' : '예: 도서관'} className={field} />
                </div>
                {family === 'agents' && (
                    <div>
                        <span className={label}>담당 과목 <span className="font-normal text-slate-400">— attr.subject</span></span>
                        <input value={subject} onChange={(e) => setSubject(e.target.value)} onKeyDown={submitOnEnter(submit)}
                            placeholder="예: 도덕 (비워도 됨)" className={field} />
                    </div>
                )}
                <ColorSwatches value={color} onChange={setColor} />
                <AttrRows rows={rows} setRows={setRows}
                    hint={family === 'agents' ? '예: 직급=부장, 최대시수=20' : family === 'resources' ? '예: 수용인원=30, 위치=본관2층' : '예: 주당기준=4'} />
                <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-2">
                    네 엔티티(교사·학반·시설·교과)는 모두 같은 골격 — <b>이름 + 자유 속성(attr)</b>. 종류 이름표(kind)로만 구분된다.
                </p>
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="text-xs px-3 py-1.5 rounded text-slate-500 hover:text-slate-700">취소</button>
                    <button onClick={submit} disabled={!name.trim()}
                        className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">만들기</button>
                </div>
            </div>
        </Overlay>
    );
}

// ══════════════════════════════════════════════════════════════
//  학반(Track) — 이름 + 자유 속성
// ══════════════════════════════════════════════════════════════
export function TrackCreateModal({ specId, onClose }: { specId: string; onClose: () => void }) {
    const { doc, dispatch, setUI } = useStore();
    const spec = doc.specs.find((s) => s.id === specId);
    const [name, setName] = useState('');
    const [rows, setRows] = useState<{ k: string; v: string }[]>([]);

    const submit = () => {
        if (!name.trim()) return;
        dispatch({ type: 'ADD_TRACK', specId, name: name.trim(), attr: rowsToAttr(rows) });
        setUI({ leftTab: 'timetable' });
        onClose();
    };

    return (
        <Overlay title={`새 학반 — ${spec?.name ?? ''}`} onClose={onClose} size="md">
            <div className="space-y-3">
                <div>
                    <span className={label}>이름</span>
                    <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={submitOnEnter(submit)}
                        placeholder="예: 3-3반, 5병동, 당직 A조" className={field} />
                </div>
                <AttrRows rows={rows} setRows={setRows} hint="예: 담임=김민준, 학생수=24" />
                <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-2">
                    학반(Track)은 <b>자기 시간표를 갖는 한 줄(레인)</b>. 이 학반은 '{spec?.name}' 규격의 격자를 쓴다.
                </p>
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="text-xs px-3 py-1.5 rounded text-slate-500 hover:text-slate-700">취소</button>
                    <button onClick={submit} disabled={!name.trim()}
                        className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">만들기</button>
                </div>
            </div>
        </Overlay>
    );
}

// ══════════════════════════════════════════════════════════════
//  규격(TimetableSpec) — 스키마의 네 가지 정의를 전부
// ══════════════════════════════════════════════════════════════
export function SpecCreateModal({ onClose }: { onClose: () => void }) {
    const { dispatch } = useStore();
    const [name, setName] = useState('');
    const [cycleDays, setCycleDays] = useState(7);
    const [activeDays, setActiveDays] = useState<number[]>([0, 1, 2, 3, 4]);
    const [dayStart, setDayStart] = useState('09:00');
    const [periodCount, setPeriodCount] = useState(6);
    const [periodMin, setPeriodMin] = useState(40);
    const [breakMin, setBreakMin] = useState(10);

    // ④ 칸 나누기 미리보기 — 입력이 바뀌면 즉시 다시 계산
    const slots = useMemo(
        () => periods(periodCount, dayStart, periodMin, breakMin),
        [periodCount, dayStart, periodMin, breakMin],
    );

    const toggleDay = (d: number) =>
        setActiveDays((xs) => (xs.includes(d) ? xs.filter((x) => x !== d) : [...xs, d].sort((a, b) => a - b)));

    const setCycle = (n: number) => {
        const c = Math.max(1, Math.min(28, n));
        setCycleDays(c);
        setActiveDays((xs) => xs.filter((d) => d < c));
    };

    const submit = () => {
        if (!name.trim() || activeDays.length === 0 || slots.length === 0) return;
        dispatch({
            type: 'ADD_SPEC',
            spec: {
                name: name.trim(), cycleDays, activeDays,
                dayStart, dayEnd: slots[slots.length - 1].end, slots,
            },
        });
        onClose();
    };

    const dayLabel = (d: number) => (cycleDays === 7 ? DAY_NAMES[d] : `${d + 1}`);

    return (
        <Overlay title="새 시간표 규격 — 빈 격자 틀 정의" onClose={onClose} size="md">
            <div className="space-y-3">
                <div>
                    <span className={label}>이름</span>
                    <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={submitOnEnter(submit)}
                        placeholder="예: 병설유치원 규격, 간호 2교대" className={field} />
                </div>

                <div>
                    <span className={label}>① 며칠마다 반복되나 (cycleDays)</span>
                    <div className="flex items-center gap-2">
                        <input type="number" min={1} max={28} value={cycleDays}
                            onChange={(e) => setCycle(Number(e.target.value))} className={`${field} !w-20`} />
                        <span className="text-[11px] text-slate-400">일 주기 {cycleDays === 7 ? '(한 주)' : cycleDays === 14 ? '(2주)' : ''}</span>
                    </div>
                </div>

                <div>
                    <span className={label}>② 그중 일하는 날 (activeDays)</span>
                    <div className="flex flex-wrap gap-1">
                        {Array.from({ length: cycleDays }, (_, d) => (
                            <button
                                key={d}
                                onClick={() => toggleDay(d)}
                                className={`w-7 h-7 rounded text-xs font-medium transition-colors
                                    ${activeDays.includes(d) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                            >{dayLabel(d)}</button>
                        ))}
                    </div>
                </div>

                <div className="flex gap-3">
                    <div>
                        <span className={label}>③ 하루 시작 (dayStart)</span>
                        <input type="time" value={dayStart} onChange={(e) => setDayStart(e.target.value)} className={field} />
                    </div>
                    <div className="flex-1">
                        <span className={label}>④ 칸 나누기 (slots)</span>
                        <div className="flex items-center gap-1.5">
                            <select value={periodCount} onChange={(e) => setPeriodCount(Number(e.target.value))} className={`${field} !w-auto`}>
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}칸</option>)}
                            </select>
                            <input type="number" min={5} max={480} value={periodMin} onChange={(e) => setPeriodMin(Number(e.target.value))}
                                className={`${field} !w-16`} title="한 칸 길이(분)" />
                            <span className="text-[11px] text-slate-400 whitespace-nowrap">분 +</span>
                            <input type="number" min={0} max={120} value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value))}
                                className={`${field} !w-14`} title="쉬는 시간(분)" />
                            <span className="text-[11px] text-slate-400 whitespace-nowrap">분 휴식</span>
                        </div>
                    </div>
                </div>

                {/* 미리보기 — 위 정의로 만들어질 슬롯들 */}
                <div className="bg-slate-50 border border-slate-100 rounded p-2 max-h-24 overflow-y-auto">
                    <p className="text-[10px] text-slate-400 mb-1">만들어질 칸 (하루 {slots[0]?.start}~{slots[slots.length - 1]?.end})</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {slots.map((s) => (
                            <span key={s.index} className="text-[11px] text-slate-600 whitespace-nowrap">
                                {s.label} <span className="text-slate-400">{s.start}–{s.end}</span>
                            </span>
                        ))}
                    </div>
                </div>

                <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-2">
                    규격은 <b>아직 배치가 없는 격자 '틀'</b>. 만들면 이 틀을 학기 기간에 적용한 <b>기본표</b>가 함께 생기고,
                    특별표는 나중에 더 좁은 기간 + 높은 우선순위로 얹는다.
                </p>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="text-xs px-3 py-1.5 rounded text-slate-500 hover:text-slate-700">취소</button>
                    <button onClick={submit} disabled={!name.trim() || activeDays.length === 0}
                        className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">만들기</button>
                </div>
            </div>
        </Overlay>
    );
}
