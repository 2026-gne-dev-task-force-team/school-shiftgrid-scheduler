/**
 * 왼쪽 패널 = '저장 세계' 탐색기.
 * 탭 4개가 곧 엔티티 4종:
 *   [시간표] 규격(폴더) → 학반(파일) 트리   [교사] [교과] [시설] 목록
 * 시간표 탭에서 학반을 클릭하면 가운데에 그 시간표가 열린다.
 * 교사·교과·시설 항목은 가운데 그리드로 드래그해 넣을 수 있다.
 * 추가는 스키마 구조를 그대로 묻는 생성 폼(CreateForms)으로, 삭제는 즉시(되돌리기로 복구).
 */
import { useState } from 'react';
import { useStore, type EntityFamily, type LeftTab } from '../../store/store';
import { colorOf } from '../../logic/logic';
import { encodeDrag, type DragKind } from './ui';
import { SpecCreateModal, TrackCreateModal, EntityCreateModal } from './CreateForms';
import type { Agent, Activity, Resource } from '../../types/schema';

const TABS: { key: LeftTab; label: string }[] = [
    { key: 'timetable', label: '시간표' },
    { key: 'agents', label: '교사' },
    { key: 'activities', label: '교과' },
    { key: 'resources', label: '시설' },
];

/** 어떤 생성 폼이 열려 있는지 */
type ModalState =
    | null
    | { type: 'spec' }
    | { type: 'track'; specId: string }
    | { type: 'entity'; family: EntityFamily };

export default function LeftPanel() {
    const { ui, setUI } = useStore();
    const [modal, setModal] = useState<ModalState>(null);

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
                {ui.leftTab === 'timetable'
                    ? <TimetableTree openModal={setModal} />
                    : <EntityList family={ui.leftTab} openModal={setModal} />}
            </div>

            {/* 생성 폼 모달 */}
            {modal?.type === 'spec' && <SpecCreateModal onClose={() => setModal(null)} />}
            {modal?.type === 'track' && <TrackCreateModal specId={modal.specId} onClose={() => setModal(null)} />}
            {modal?.type === 'entity' && <EntityCreateModal family={modal.family} onClose={() => setModal(null)} />}
        </aside>
    );
}

// ── 시간표 탭: 규격(폴더) → 학반(파일) 트리 ───────────────────
function TimetableTree({ openModal }: { openModal: (m: ModalState) => void }) {
    const { doc, ui, setUI, dispatch } = useStore();

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
                            <span
                                className="text-sm font-semibold text-slate-700 truncate flex-1"
                                title={`하루 ${spec.slots.length}칸 (${spec.dayStart}~${spec.dayEnd}) · ${spec.cycleDays}일 주기 중 ${spec.activeDays.length}일`}
                            >
                                📁 {spec.name}
                            </span>
                            <button
                                title="학반 추가"
                                onClick={() => { openModal({ type: 'track', specId: spec.id }); if (collapsed) toggle(spec.id); }}
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
                                {tracks.length === 0 && (
                                    <div className="pl-3 py-1 text-[11px] text-slate-300">학반 없음 — 폴더의 ＋로 추가</div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}

            <button
                onClick={() => openModal({ type: 'spec' })}
                className="mx-2 mt-2 w-[calc(100%-1rem)] py-1.5 text-xs text-slate-500 border border-dashed border-slate-300 rounded hover:border-blue-400 hover:text-blue-600"
            >＋ 규격 폴더 추가</button>
        </div>
    );
}

// ── 교사/교과/시설 탭: 드래그 가능한 목록 ─────────────────────
function EntityList({ family, openModal }: { family: EntityFamily; openModal: (m: ModalState) => void }) {
    const { doc, dispatch } = useStore();
    const items = doc[family] as (Agent | Activity | Resource)[];
    const dragKind: DragKind = family === 'agents' ? 'agent' : family === 'activities' ? 'activity' : 'resource';
    const noun = family === 'agents' ? '교사' : family === 'activities' ? '교과' : '시설';

    /** attr에서 색·specId 빼고 나머지 자유 속성을 툴팁으로 보여준다 */
    const attrTip = (item: { attr?: Record<string, unknown> }) =>
        Object.entries(item.attr ?? {})
            .filter(([k]) => k !== 'color')
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(' · ');

    return (
        <div className="py-1">
            <p className="px-3 py-1 text-[11px] text-slate-400">칸으로 끌어다 놓으세요</p>
            {items.map((item) => (
                <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', encodeDrag(dragKind, item.id))}
                    title={attrTip(item)}
                    className="group flex items-center gap-2 px-3 py-1.5 text-sm cursor-grab active:cursor-grabbing hover:bg-white border-b border-slate-100"
                >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colorOf(item) }} />
                    <span className="text-slate-700 font-medium truncate flex-1">{item.name}</span>
                    {(item.attr?.subject as string) && (
                        <span className="text-[11px] text-slate-400">{item.attr!.subject as string}</span>
                    )}
                    <button
                        title="삭제 (되돌리기 가능)"
                        onClick={() => dispatch({ type: 'REMOVE_ENTITY', family, id: item.id })}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 text-xs"
                    >×</button>
                </div>
            ))}
            <button
                onClick={() => openModal({ type: 'entity', family })}
                className="mx-2 mt-2 w-[calc(100%-1rem)] py-1.5 text-xs text-slate-500 border border-dashed border-slate-300 rounded hover:border-blue-400 hover:text-blue-600"
            >＋ {noun} 추가</button>
        </div>
    );
}
