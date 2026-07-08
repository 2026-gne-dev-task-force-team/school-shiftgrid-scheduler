/**
 * 왼쪽 패널 = '저장 세계' 탐색기.
 * 탭 4개가 곧 엔티티 4종:
 *   [시간표] 규격(폴더) → 학반(파일) 트리   [교사] [교과] [시설] 목록
 * 시간표 탭에서 학반을 클릭하면 가운데에 그 시간표가 열린다.
 * 교사·교과·시설 항목은 가운데 그리드로 드래그해 넣을 수 있다.
 * 추가/삭제는 전부 패널 안 인라인 폼으로 한다(팝업 없음 — 삭제는 되돌리기로 복구).
 */
import { useState, type KeyboardEvent } from 'react';
import { useStore, type EntityFamily, type LeftTab } from '../../store/store';
import { colorOf } from '../../logic/logic';
import { encodeDrag, type DragKind } from './ui';
import type { Agent, Activity, Resource } from '../../types/schema';

const TABS: { key: LeftTab; label: string }[] = [
    { key: 'timetable', label: '시간표' },
    { key: 'agents', label: '교사' },
    { key: 'activities', label: '교과' },
    { key: 'resources', label: '시설' },
];

const PALETTE = ['#4F7CFF', '#FF6B6B', '#2ECC71', '#9B59B6', '#F39C12', '#E91E63', '#00BCD4', '#795548', '#607D8B'];

export default function LeftPanel() {
    const { ui, setUI } = useStore();
    return (
        <aside className="w-56 flex-shrink-0 bg-slate-50 border-r border-slate-200 flex flex-col">
            {/* 탭 */}
            <div className="flex border-b border-slate-200">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setUI({ leftTab: t.key })}
                        className={`flex-1 py-2 text-xs font-semibold transition-colors
                            ${ui.leftTab === t.key ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            <div className="flex-1 overflow-y-auto">
                {ui.leftTab === 'timetable' ? <TimetableTree /> : <EntityList family={ui.leftTab} palette={PALETTE} />}
            </div>
        </aside>
    );
}

/** 인라인 추가 폼 공통 키 처리 — Enter=추가, Esc=취소 (훅 아님, 그냥 핸들러 공장) */
const makeSubmitKeys = (submit: () => void, cancel: () => void) => (e: KeyboardEvent) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') cancel();
};

// ── 시간표 탭: 규격(폴더) → 학반(파일) 트리 ───────────────────
function TimetableTree() {
    const { doc, ui, setUI, dispatch } = useStore();
    // 인라인 폼 상태: 규격 추가 / 어느 폴더에 학반 추가 중인지
    const [addingSpec, setAddingSpec] = useState(false);
    const [specName, setSpecName] = useState('');
    const [periodCount, setPeriodCount] = useState(6);
    const [addingTrackFor, setAddingTrackFor] = useState<string | null>(null);
    const [trackName, setTrackName] = useState('');

    const submitSpec = () => {
        const name = specName.trim();
        if (!name) return;
        dispatch({ type: 'ADD_SPEC', name, periodCount });
        setSpecName(''); setAddingSpec(false);
    };
    const submitTrack = (specId: string) => {
        const name = trackName.trim();
        if (!name) return;
        dispatch({ type: 'ADD_TRACK', specId, name });
        setTrackName(''); setAddingTrackFor(null);
    };

    const specKeys = makeSubmitKeys(submitSpec, () => { setAddingSpec(false); setSpecName(''); });

    const toggle = (specId: string) =>
        setUI({
            collapsedSpecs: ui.collapsedSpecs.includes(specId)
                ? ui.collapsedSpecs.filter((id) => id !== specId)
                : [...ui.collapsedSpecs, specId],
        });

    return (
        <div className="py-1">
            {doc.specs.map((spec) => {
                const collapsed = ui.collapsedSpecs.includes(spec.id);
                const tracks = doc.tracks.filter((t) => t.attr?.specId === spec.id);
                const specTables = doc.timetables.filter((tt) => tt.specId === spec.id);
                return (
                    <div key={spec.id} className="mb-1">
                        {/* 규격 폴더 헤더 */}
                        <div className="group flex items-center gap-1 px-2 py-1.5 hover:bg-slate-100">
                            <button onClick={() => toggle(spec.id)} className="text-slate-400 w-3 text-xs">
                                {collapsed ? '▸' : '▾'}
                            </button>
                            <span className="text-sm font-semibold text-slate-700 truncate flex-1" title={`${spec.slots.length}교시 · 주 ${spec.activeDays.length}일`}>
                                📁 {spec.name}
                            </span>
                            <button
                                title="학반 추가"
                                onClick={() => { setAddingTrackFor(spec.id); setTrackName(''); if (collapsed) toggle(spec.id); }}
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-600 text-sm px-1"
                            >＋</button>
                            <button
                                title="규격 삭제 (되돌리기 가능)"
                                onClick={() => dispatch({ type: 'REMOVE_SPEC', id: spec.id })}
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 text-xs px-1"
                            >🗑</button>
                        </div>

                        {!collapsed && (
                            <div className="ml-3 border-l border-slate-200">
                                {/* 적용된 시간표(기본표/특별표) — 우선순위 설명용 */}
                                {specTables.map((tt) => (
                                    <div key={tt.id} className="pl-3 py-0.5 text-[11px] text-slate-400 flex items-center gap-1">
                                        🗓 {tt.name}
                                        {tt.priority > 0 && (
                                            <span className="px-1 rounded bg-amber-100 text-amber-700" title={String(tt.attr?.note ?? '')}>
                                                우선순위 {tt.priority}
                                            </span>
                                        )}
                                    </div>
                                ))}
                                {/* 학반들 */}
                                {tracks.map((track) => (
                                    <div
                                        key={track.id}
                                        className={`group pl-3 pr-2 py-1 flex items-center gap-1 cursor-pointer text-sm
                                            ${ui.selectedTrackId === track.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                                        onClick={() => setUI({ selectedTrackId: track.id })}
                                    >
                                        <span className="flex-1 truncate">📄 {track.name}</span>
                                        <button
                                            title="학반 삭제 (되돌리기 가능)"
                                            onClick={(e) => { e.stopPropagation(); dispatch({ type: 'REMOVE_TRACK', id: track.id }); }}
                                            className={`opacity-0 group-hover:opacity-100 text-xs px-1 ${ui.selectedTrackId === track.id ? 'text-white' : 'text-slate-400 hover:text-red-500'}`}
                                        >×</button>
                                    </div>
                                ))}
                                {tracks.length === 0 && addingTrackFor !== spec.id && (
                                    <div className="pl-3 py-1 text-[11px] text-slate-300">학반 없음 — 폴더의 ＋로 추가</div>
                                )}
                                {/* 학반 추가 인라인 폼 */}
                                {addingTrackFor === spec.id && (
                                    <div className="pl-3 pr-2 py-1 flex items-center gap-1">
                                        <input
                                            autoFocus
                                            value={trackName}
                                            onChange={(e) => setTrackName(e.target.value)}
                                            onKeyDown={makeSubmitKeys(() => submitTrack(spec.id), () => setAddingTrackFor(null))}
                                            placeholder="학반 이름 (예: 3-3반)"
                                            className="flex-1 min-w-0 text-xs border border-blue-300 rounded px-1.5 py-1 outline-none"
                                        />
                                        <button onClick={() => submitTrack(spec.id)} className="text-xs px-1.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">추가</button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}

            {/* 규격 폴더 추가 — 인라인 폼 (이름 + 교시 수 정의) */}
            {addingSpec ? (
                <div className="mx-2 mt-2 p-2 border border-blue-200 rounded bg-white space-y-1.5">
                    <input
                        autoFocus
                        value={specName}
                        onChange={(e) => setSpecName(e.target.value)}
                        onKeyDown={specKeys}
                        placeholder="규격 이름 (예: 병설유치원)"
                        className="w-full text-xs border border-blue-300 rounded px-1.5 py-1 outline-none"
                    />
                    <div className="flex items-center gap-1.5">
                        <label className="text-[11px] text-slate-500 whitespace-nowrap">하루</label>
                        <select
                            value={periodCount}
                            onChange={(e) => setPeriodCount(Number(e.target.value))}
                            className="text-xs border border-slate-200 rounded px-1 py-0.5"
                        >
                            {[3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}교시</option>)}
                        </select>
                        <span className="text-[11px] text-slate-400 whitespace-nowrap">· 월~금</span>
                    </div>
                    <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => { setAddingSpec(false); setSpecName(''); }} className="text-xs px-1.5 py-1 rounded text-slate-400 hover:text-slate-600 whitespace-nowrap">취소</button>
                        <button onClick={submitSpec} className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 whitespace-nowrap">만들기</button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setAddingSpec(true)}
                    className="mx-2 mt-2 w-[calc(100%-1rem)] py-1.5 text-xs text-slate-500 border border-dashed border-slate-300 rounded hover:border-blue-400 hover:text-blue-600"
                >＋ 규격 폴더 추가</button>
            )}
        </div>
    );
}

// ── 교사/교과/시설 탭: 드래그 가능한 목록 ─────────────────────
function EntityList({ family, palette }: { family: EntityFamily; palette: string[] }) {
    const { doc, dispatch } = useStore();
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState('');
    const items = doc[family] as (Agent | Activity | Resource)[];
    const dragKind: DragKind = family === 'agents' ? 'agent' : family === 'activities' ? 'activity' : 'resource';
    const noun = family === 'agents' ? '교사' : family === 'activities' ? '교과' : '시설';

    const submit = () => {
        const n = name.trim();
        if (!n) return;
        dispatch({ type: 'ADD_ENTITY', family, name: n, color: palette[items.length % palette.length] });
        setName(''); setAdding(false);
    };
    const keys = makeSubmitKeys(submit, () => { setAdding(false); setName(''); });

    return (
        <div className="py-1">
            <p className="px-3 py-1 text-[11px] text-slate-400">칸으로 끌어다 놓으세요</p>
            {items.map((item) => (
                <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', encodeDrag(dragKind, item.id))}
                    className="group flex items-center gap-2 px-3 py-1.5 text-sm cursor-grab active:cursor-grabbing hover:bg-white border-b border-slate-100"
                >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colorOf(item) }} />
                    <span className="text-slate-700 font-medium truncate flex-1">{item.name}</span>
                    {'attr' in item && (item.attr?.subject as string) && (
                        <span className="text-[11px] text-slate-400">{item.attr!.subject as string}</span>
                    )}
                    <button
                        title="삭제 (되돌리기 가능)"
                        onClick={() => dispatch({ type: 'REMOVE_ENTITY', family, id: item.id })}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 text-xs"
                    >×</button>
                </div>
            ))}
            {adding ? (
                <div className="mx-2 mt-2 flex items-center gap-1">
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={keys}
                        placeholder={`${noun} 이름`}
                        className="flex-1 min-w-0 text-xs border border-blue-300 rounded px-1.5 py-1 outline-none"
                    />
                    <button onClick={submit} className="text-xs px-1.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">추가</button>
                </div>
            ) : (
                <button
                    onClick={() => setAdding(true)}
                    className="mx-2 mt-2 w-[calc(100%-1rem)] py-1.5 text-xs text-slate-500 border border-dashed border-slate-300 rounded hover:border-blue-400 hover:text-blue-600"
                >＋ {noun} 추가</button>
            )}
        </div>
    );
}
