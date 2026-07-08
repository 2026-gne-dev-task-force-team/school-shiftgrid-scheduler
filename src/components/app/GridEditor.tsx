/**
 * 가운데 = 시간표 편집 (엑셀식).
 *  - 셀을 클릭/드래그해 범위 선택, 복사(⌘C)·붙여넣기(⌘V)·삭제(Del), 되돌리기(⌘Z)
 *  - 셀 더블클릭 또는 타이핑 → 검색해서 교사·교과·시설을 칩으로 추가
 *  - 왼쪽 패널에서 항목을 끌어와 칸에 넣기 (여러 칸 선택 상태면 한꺼번에)
 * 한 칸 = 배치(Assignment) 한 줄. 칩들은 그 줄의 교과·교사·시설 값이다.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useStore, type CellField, type CellPos } from '../../store/store';
import { useGridOps } from '../../store/ops';
import { indexBy, colorOf, cellKey } from '../../logic/logic';
import { Chip, FIELD_OF, decodeDrag, type DragKind } from './ui';
import type { Assignment } from '../../types/schema';

const DAY_LABEL = ['월', '화', '수', '목', '금', '토', '일'];

export default function GridEditor() {
    const { doc, ui, setUI, dispatch, conflicts, undo, redo } = useStore();
    const { copy, paste, clear } = useGridOps();
    const dragging = useRef(false);
    const [editing, setEditing] = useState<{ slotIndex: number; dayIndex: number; query: string } | null>(null);

    const track = doc.tracks.find((t) => t.id === ui.selectedTrackId);
    const spec = doc.specs.find((s) => s.id === track?.attr?.specId);

    useEffect(() => {
        const up = () => { dragging.current = false; };
        window.addEventListener('mouseup', up);
        return () => window.removeEventListener('mouseup', up);
    }, []);

    if (!track || !spec) {
        return <main className="flex-1 grid place-items-center text-slate-400 text-sm">왼쪽에서 학반을 선택하세요</main>;
    }

    const cells = doc.assignments; // 전체 (충돌 하이라이트용)
    const cellMap = new Map<string, Assignment>();
    for (const a of cells) cellMap.set(cellKey(a.trackId, a.dayIndex, a.slotIndex), a);

    const agents = indexBy(doc.agents);
    const activities = indexBy(doc.activities);
    const resources = indexBy(doc.resources);
    const conflictIds = new Set(conflicts.flatMap((cf) => cf.assignmentIds));
    const days = spec.activeDays;
    // 한 주(7일) 주기면 요일 이름, 아니면 'N일차'로 (간호 2교대 같은 비주간 주기 대비)
    const dayName = (d: number) => (spec.cycleDays === 7 ? `${DAY_LABEL[d]}요일` : `${d + 1}일차`);

    // 선택 판정
    const sel = ui.selection && ui.selection.trackId === track.id ? ui.selection : null;
    const inSel = (r: number, cCol: number) =>
        sel != null &&
        r >= Math.min(sel.r1, sel.r2) && r <= Math.max(sel.r1, sel.r2) &&
        cCol >= Math.min(sel.c1, sel.c2) && cCol <= Math.max(sel.c1, sel.c2);

    const startSel = (r: number, cCol: number) => {
        dragging.current = true;
        setUI({ selection: { trackId: track.id, r1: r, c1: cCol, r2: r, c2: cCol } });
    };
    const extendSel = (r: number, cCol: number) => {
        if (!dragging.current || !sel) return;
        setUI({ selection: { ...sel, r2: r, c2: cCol } });
    };

    const setField = (pos: CellPos, field: CellField, value?: string) =>
        dispatch({ type: 'SET_CELL', pos, patch: { [field]: value } });

    // 드롭: 선택 범위 안에 떨어뜨리면 선택된 모든 칸에, 아니면 그 칸에만
    const onDropCell = (r: number, cCol: number, raw: string) => {
        const d = decodeDrag(raw);
        if (!d) return;
        const field = FIELD_OF[d.kind];
        const targets: CellPos[] = inSel(r, cCol) && sel
            ? rangeCells(track.id, sel)
            : [{ trackId: track.id, slotIndex: r, dayIndex: cCol }];
        for (const pos of targets) setField(pos, field, d.id);
    };

    const onKey = (e: KeyboardEvent) => {
        const meta = e.metaKey || e.ctrlKey;
        if (meta && e.key === 'c') { e.preventDefault(); copy(); return; }
        if (meta && e.key === 'v') { e.preventDefault(); paste(); return; }
        if (meta && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
        if (meta && e.key === 'y') { e.preventDefault(); redo(); return; }
        if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); clear(); return; }
        if (e.key === 'Escape') { setEditing(null); setUI({ selection: null }); return; }
        // 자유 타이핑 → 편집 시작 (단일 셀 선택 시)
        if (!meta && e.key.length === 1 && sel && sel.r1 === sel.r2 && sel.c1 === sel.c2 && !editing) {
            setEditing({ slotIndex: sel.r1, dayIndex: sel.c1, query: e.key });
        }
    };

    return (
        <main className="flex-1 overflow-auto p-4 outline-none" tabIndex={0} onKeyDown={onKey}>
            {/* 화면이 넓어도 표가 왼쪽에 붙지 않게 가운데 정렬 */}
            <div className="w-fit mx-auto">
            <table className="border-collapse text-sm select-none">
                <thead>
                    <tr>
                        <th className="w-12 py-2 text-xs text-slate-400 font-medium sticky left-0 bg-white" />
                        {days.map((d) => (
                            <th key={d} className="min-w-[110px] py-2 text-xs font-semibold text-slate-600 text-center">
                                {dayName(d)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {spec.slots.map((slot) => (
                        <tr key={slot.index}>
                            <td className="text-center text-[11px] text-slate-400 font-medium py-1 pr-2 sticky left-0 bg-white">
                                {slot.label}
                            </td>
                            {days.map((d) => {
                                const a = cellMap.get(cellKey(track.id, d, slot.index));
                                const bad = a && conflictIds.has(a.id);
                                const selected = inSel(slot.index, d);
                                const isEditing = editing?.slotIndex === slot.index && editing?.dayIndex === d;
                                return (
                                    <td key={d} className="p-0.5 align-top">
                                        <div
                                            className={`relative min-h-[60px] p-1 rounded border cursor-cell transition-colors
                                                ${selected ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-400' : 'border-slate-200 hover:bg-slate-50'}
                                                ${bad ? '!border-red-400 ring-1 ring-red-300 bg-red-50/50' : ''}`}
                                            onMouseDown={(e) => { (e.currentTarget.closest('main') as HTMLElement)?.focus(); startSel(slot.index, d); }}
                                            onMouseEnter={() => extendSel(slot.index, d)}
                                            onDoubleClick={() => setEditing({ slotIndex: slot.index, dayIndex: d, query: '' })}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => { e.preventDefault(); onDropCell(slot.index, d, e.dataTransfer.getData('text/plain')); }}
                                        >
                                            <div className="flex flex-col items-start gap-0.5">
                                                {a?.activityId && activities.get(a.activityId) && (
                                                    <Chip name={activities.get(a.activityId)!.name} color={colorOf(activities.get(a.activityId))}
                                                        onRemove={() => setField({ trackId: track.id, slotIndex: slot.index, dayIndex: d }, 'activityId', undefined)} />
                                                )}
                                                {a?.agentId && agents.get(a.agentId) && (
                                                    <Chip name={agents.get(a.agentId)!.name} color={colorOf(agents.get(a.agentId))}
                                                        onRemove={() => setField({ trackId: track.id, slotIndex: slot.index, dayIndex: d }, 'agentId', undefined)} />
                                                )}
                                                {a?.resourceId && resources.get(a.resourceId) && (
                                                    <Chip name={resources.get(a.resourceId)!.name} color={colorOf(resources.get(a.resourceId))}
                                                        onRemove={() => setField({ trackId: track.id, slotIndex: slot.index, dayIndex: d }, 'resourceId', undefined)} />
                                                )}
                                            </div>

                                            {isEditing && (
                                                <CellEditor
                                                    initialQuery={editing!.query}
                                                    onClose={() => setEditing(null)}
                                                    onPick={(kind, id) => setField({ trackId: track.id, slotIndex: slot.index, dayIndex: d }, FIELD_OF[kind], id)}
                                                />
                                            )}
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="mt-3 text-[11px] text-slate-400">
                범위 드래그 · ⌘C 복사 · ⌘V 붙여넣기 · Del 지우기 · 더블클릭/타이핑으로 입력 · 왼쪽에서 드래그해 넣기
            </p>
            </div>
        </main>
    );
}

function rangeCells(trackId: string, sel: { r1: number; c1: number; r2: number; c2: number }): CellPos[] {
    const out: CellPos[] = [];
    for (let r = Math.min(sel.r1, sel.r2); r <= Math.max(sel.r1, sel.r2); r++)
        for (let cCol = Math.min(sel.c1, sel.c2); cCol <= Math.max(sel.c1, sel.c2); cCol++)
            out.push({ trackId, slotIndex: r, dayIndex: cCol });
    return out;
}

// ── 셀 편집 입력 + 자동완성 ──────────────────────────────────
function CellEditor({
    initialQuery, onPick, onClose,
}: { initialQuery: string; onPick: (kind: DragKind, id: string) => void; onClose: () => void }) {
    const { doc } = useStore();
    const [q, setQ] = useState(initialQuery);
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => { ref.current?.focus(); }, []);

    const query = q.trim();
    const pool: { kind: DragKind; id: string; name: string; color: string; tag: string }[] = [
        ...doc.activities.map((a) => ({ kind: 'activity' as const, id: a.id, name: a.name, color: colorOf(a), tag: '교과' })),
        ...doc.agents.map((a) => ({ kind: 'agent' as const, id: a.id, name: a.name, color: colorOf(a), tag: '교사' })),
        ...doc.resources.map((a) => ({ kind: 'resource' as const, id: a.id, name: a.name, color: colorOf(a), tag: '시설' })),
    ];
    const results = (query ? pool.filter((p) => p.name.includes(query)) : pool).slice(0, 8);

    return (
        <div className="absolute z-50 top-1 left-1 right-1" onMouseDown={(e) => e.stopPropagation()}>
            <input
                ref={ref}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && results[0]) { onPick(results[0].kind, results[0].id); setQ(''); }
                    if (e.key === 'Escape') onClose();
                }}
                onBlur={() => setTimeout(onClose, 120)}
                placeholder="교과·교사·시설 검색"
                className="w-full text-xs border border-blue-400 rounded px-2 py-1 outline-none shadow-sm"
            />
            {results.length > 0 && (
                <div className="mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                    {results.map((r) => (
                        <button
                            key={r.kind + r.id}
                            onMouseDown={(e) => { e.preventDefault(); onPick(r.kind, r.id); setQ(''); }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-slate-50 text-left"
                        >
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                            <span className="font-medium text-slate-800">{r.name}</span>
                            <span className="ml-auto text-[10px] text-slate-400">{r.tag}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
