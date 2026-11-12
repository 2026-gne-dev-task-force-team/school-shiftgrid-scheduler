/** 기초자료 — 학교·시간 틀·반·교사·과목·특별실·시수표. 오른쪽에 배정/필요 현황(sticky) */
import { useRef, useState } from 'react';
import { useStore } from '../../store/store';
import { uid } from '../../store/ids';
import { colorFor } from '../../store/doc-ops';
import type { MakeSpecInput } from '../../engine/api';
import { makeSpec } from '../../engine/api';
import type { Agent, Activity, Resource, Track, TimetableSpec } from '../../types/schema';
import { assignableSlots, lessonCountForDay, activeDays, DAY_LABEL } from '../lib';
import { L } from '../help/terms';
import { RICH } from '../help/richContent';
import type { InfoKey } from '../help/rich';
import { Button, Card, ConfirmButton, Field, Info, TextInput, Mark, Modal } from '../parts/ui';
import Sheet, { type SheetColumn, type SheetRow, type SheetApi } from '../parts/Sheet';
import DemandStatusPanel from './basic/DemandStatusPanel';
import DemandTable from './basic/DemandTable';
import ExcelBar from './basic/ExcelBar';

// ── 시트 위 공용 툴바 ─────────────────────────────────────────
function SheetToolbar({ title, api, helpKey }: { title: string; api: SheetApi | null; helpKey: InfoKey }) {
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <div className="text-[13px] font-medium mr-1">{title}</div>
            <Button icon="plus" onClick={() => api?.addRow()}>행 추가</Button>
            <Button icon="trash" onClick={() => api?.deleteSelectedRows()}>선택 행 삭제</Button>
            <Info help={RICH[helpKey]} />
        </div>
    );
}
const undoRedo = (st: ReturnType<typeof useStore>) => ({ onUndo: st.undo, onRedo: st.redo });

type Sub = 'school' | 'specs' | 'tracks' | 'agents' | 'activities' | 'resources' | 'demands';
const SUBS: { id: Sub; label: string }[] = [
    { id: 'school', label: '학교' }, { id: 'specs', label: L.spec }, { id: 'tracks', label: L.track },
    { id: 'agents', label: L.agent }, { id: 'activities', label: L.activity }, { id: 'resources', label: L.resource },
    { id: 'demands', label: L.demandTable },
];

export default function BasicScreen() {
    const st = useStore();
    const [sub, setSub] = useState<Sub>('school');
    const [showDemand, setShowDemand] = useState(false);
    const placed = st.demand.reduce((s, d) => s + d.placed, 0);
    const need = st.demand.reduce((s, d) => s + d.need, 0);
    return (
        <div className="flex h-full min-h-0">
            <div className="flex-1 min-w-0 flex flex-col">
                {/* 폰: 소절을 가로 스크롤 칩으로 */}
                <div data-tour="basic-subtabs" className="md:hidden flex items-center gap-1.5 px-3 pt-3 pb-2 border-b border-line overflow-x-auto">
                    {SUBS.map((s) => (
                        <button key={s.id} onClick={() => setSub(s.id)}
                            data-tour={s.id === 'demands' ? 'basic-demands' : undefined}
                            className={`shrink-0 min-h-[44px] flex items-center px-3 rounded-md text-[13px] whitespace-nowrap ${sub === s.id ? 'bg-accent text-white' : 'text-muted hover:text-text hover:bg-panel2'}`}>
                            {s.label}
                        </button>
                    ))}
                </div>
                <div className="md:hidden px-3 pb-2 border-b border-line"><ExcelBar /></div>

                {/* 데스크톱: 기존 한 줄 그대로 */}
                <div data-tour="basic-subtabs" className="hidden md:flex items-center gap-1 px-4 pt-3 pb-2 border-b border-line flex-wrap">
                    {SUBS.map((s) => (
                        <button key={s.id} onClick={() => setSub(s.id)}
                            data-tour={s.id === 'demands' ? 'basic-demands' : undefined}
                            className={`px-2.5 py-1 rounded-md text-[13px] ${sub === s.id ? 'bg-accent text-white' : 'text-muted hover:text-text hover:bg-panel2'}`}>
                            {s.label}
                        </button>
                    ))}
                    <div className="ml-auto"><ExcelBar /></div>
                </div>
                <div className="flex-1 overflow-auto p-3 md:p-4">
                    {sub === 'school' && <SchoolSection />}
                    {sub === 'specs' && <SpecsSection />}
                    {sub === 'tracks' && <TracksSection />}
                    {sub === 'agents' && <AgentsSection />}
                    {sub === 'activities' && <ActivitiesSection />}
                    {sub === 'resources' && <ResourcesSection />}
                    {sub === 'demands' && <DemandTable />}
                </div>
                {/* 폰(+태블릿): sticky 패널 대신 버튼 → 시트 */}
                <div className="lg:hidden shrink-0 border-t border-line p-2">
                    <button onClick={() => setShowDemand(true)}
                        className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-md bg-panel2 border border-line text-[13px] text-text">
                        배정 현황 {placed}/{need}
                    </button>
                </div>
            </div>
            <aside className="w-72 shrink-0 border-l border-line overflow-auto p-3 hidden lg:block">
                <DemandStatusPanel />
            </aside>
            {showDemand && (
                <Modal title="배정 / 필요" onClose={() => setShowDemand(false)}>
                    <DemandStatusPanel />
                </Modal>
            )}
        </div>
    );
}

function SchoolSection() {
    const st = useStore();
    return (
        <div className="max-w-md space-y-3">
            <Field label="학교 이름">
                <TextInput value={st.doc.meta.name} onChange={(e) => st.act.setMeta({ name: e.target.value })} placeholder="예: 샘플초등학교" className="w-full" />
            </Field>
            <Field label="학기">
                <TextInput value={st.doc.meta.term} onChange={(e) => st.act.setMeta({ term: e.target.value })} placeholder="예: 2026학년도 2학기" className="w-full" />
            </Field>
            <p className="text-[12px] text-muted">파일 하나가 학교 하나입니다.</p>
        </div>
    );
}

// ── 시간 틀 ───────────────────────────────────────────────────
function SpecsSection() {
    const st = useStore();
    const [form, setForm] = useState({ name: '', periods: 6, lunchAfter: 4, dayStart: '09:00', lessonMin: 40, breakMin: 10, lunchMin: 50 });
    const [grades, setGrades] = useState<Set<number>>(new Set());
    const [perDay, setPerDay] = useState<Record<number, string>>({ 0: '', 1: '', 2: '', 3: '', 4: '' });
    const [preview, setPreview] = useState<TimetableSpec | null>(null);

    const buildLessonsPerDay = (): Record<number, number> | undefined => {
        const map: Record<number, number> = {};
        for (let d = 0; d < 5; d++) {
            const raw = perDay[d];
            if (raw === '' || raw == null) continue;      // 비우면 「교시 수」 값을 씀
            const n = parseInt(raw, 10);
            if (!Number.isFinite(n) || n === form.periods) continue; // 교시 수와 같으면 생략
            map[d] = n;
        }
        return Object.keys(map).length ? map : undefined;
    };

    const buildInput = (): MakeSpecInput => ({
        id: uid('spec'), name: form.name || '새 시간 틀', periods: form.periods, lunchAfter: form.lunchAfter,
        dayStart: form.dayStart, lessonMin: form.lessonMin, breakMin: form.breakMin, lunchMin: form.lunchMin,
        grades: grades.size ? [...grades].sort((a, b) => a - b) : undefined,
        lessonsPerDay: buildLessonsPerDay(),
    });

    const doPreview = () => {
        const s = st.runEngine('시간 틀 미리보기', () => makeSpec(buildInput()));
        setPreview(s ?? null);
    };

    const toggleGrade = (g: number) => setGrades((prev) => { const n = new Set(prev); if (n.has(g)) n.delete(g); else n.add(g); return n; });

    return (
        <div className="space-y-4">
            <Card className="p-3 max-w-2xl">
                <div className="flex items-center gap-1.5 mb-2 text-[13px] font-medium">
                    학년군 시간 틀 만들기
                    <Info help={RICH.specForm} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Field label="시간 틀 이름"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="1·2학년 시간 틀" className="w-full" /></Field>
                    <Field label="교시 수"><TextInput type="number" value={form.periods} onChange={(e) => setForm({ ...form, periods: +e.target.value })} className="w-full" /></Field>
                    <Field label="점심 위치" hint="몇 교시 뒤"><TextInput type="number" value={form.lunchAfter} onChange={(e) => setForm({ ...form, lunchAfter: +e.target.value })} className="w-full" /></Field>
                    <Field label="시작 시각"><TextInput value={form.dayStart} onChange={(e) => setForm({ ...form, dayStart: e.target.value })} className="w-full" /></Field>
                    <Field label="수업(분)"><TextInput type="number" value={form.lessonMin} onChange={(e) => setForm({ ...form, lessonMin: +e.target.value })} className="w-full" /></Field>
                    <Field label="쉬는(분)"><TextInput type="number" value={form.breakMin} onChange={(e) => setForm({ ...form, breakMin: +e.target.value })} className="w-full" /></Field>
                    <Field label="점심(분)"><TextInput type="number" value={form.lunchMin} onChange={(e) => setForm({ ...form, lunchMin: +e.target.value })} className="w-full" /></Field>
                </div>

                {/* 적용 학년 (#16) */}
                <div className="mt-3">
                    <div className="flex items-center gap-1.5 text-[12px] text-muted mb-1">
                        {L.grades}
                        <Info help={RICH.specGrades} />
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                        {[1, 2, 3, 4, 5, 6].map((g) => (
                            <button key={g} type="button" onClick={() => toggleGrade(g)}
                                className={`min-h-[36px] px-3 rounded-md text-[13px] border ${grades.has(g) ? 'bg-accent text-white border-accent' : 'bg-panel2 text-muted border-line hover:text-text'}`}>
                                {g}학년
                            </button>
                        ))}
                    </div>
                </div>

                {/* 요일별 교시 수 (#15) */}
                <div className="mt-3">
                    <div className="flex items-center gap-1.5 text-[12px] text-muted mb-1">
                        요일별 교시 수
                        <Info help={RICH.specPerDay} />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {[0, 1, 2, 3, 4].map((d) => (
                            <label key={d} className="text-[11px] text-muted">{DAY_LABEL[d]}<br />
                                <TextInput type="number" value={perDay[d]} placeholder={String(form.periods)}
                                    onChange={(e) => setPerDay({ ...perDay, [d]: e.target.value })} className="w-14" />
                            </label>
                        ))}
                    </div>
                </div>

                <div className="flex gap-2 mt-3">
                    <Button icon="search" onClick={doPreview}>미리보기</Button>
                    <Button variant="primary" icon="plus" onClick={() => st.act.addSpec(buildInput())}>시간 틀 추가</Button>
                </div>
                {preview && <SlotTable spec={preview} caption="미리보기" />}
            </Card>

            <div className="space-y-2">
                {st.doc.specs.length === 0 && <p className="text-[13px] text-muted">아직 시간 틀이 없습니다. 위에서 학년군별로 하나씩 만드세요.</p>}
                {st.doc.specs.map((s) => (
                    <Card key={s.id} className="p-3">
                        <div className="flex items-center justify-between">
                            <div className="font-medium text-[13px]">{s.name}
                                <span className="text-muted font-normal"> · 수업 {assignableSlots(s).length}칸 · {s.activeDays.length}일
                                    {s.grades?.length ? ` · 적용 학년 ${s.grades.join('·')}` : ''}</span>
                            </div>
                            <ConfirmButton question="이 시간 틀과 그 틀을 쓰는 반·배치를 지울까요?" onConfirm={() => st.act.removeSpec(s.id)} />
                        </div>
                        <SlotTable spec={s} />
                    </Card>
                ))}
            </div>
        </div>
    );
}

function SlotTable({ spec, caption }: { spec: TimetableSpec; caption?: string }) {
    const lessons = spec.slots.filter((sl) => sl.assignable);
    const days = activeDays(spec);
    const hasPerDay = spec.lessonsPerDay && Object.keys(spec.lessonsPerDay).length > 0;
    return (
        <div className="mt-2 overflow-auto">
            {caption && <div className="text-[11px] text-muted mb-1">{caption}</div>}
            <table className="text-[12px] border-collapse">
                <tbody>
                    <tr>{spec.slots.map((sl) => (
                        <td key={sl.index} className={`border border-line px-2 py-1 text-center ${sl.assignable ? '' : 'bg-panel2 text-muted'}`}>
                            <div>{sl.label}</div>
                            <div className="text-[10px] text-muted">{sl.start}~{sl.end}</div>
                        </td>
                    ))}</tr>
                </tbody>
            </table>
            {hasPerDay && (
                <table className="text-[11px] border-collapse mt-2">
                    <tbody>
                        {days.map((d) => {
                            const count = lessonCountForDay(spec, d);
                            return (
                                <tr key={d}>
                                    <td className="border border-line px-2 py-0.5 text-muted bg-panel2 whitespace-nowrap">{DAY_LABEL[d]}</td>
                                    {lessons.map((sl, i) => (
                                        <td key={sl.index} className={`border border-line px-2 py-0.5 text-center ${i < count ? '' : 'bg-panel2 text-muted/40'}`}>
                                            {i < count ? sl.label.replace('교시', '') : '·'}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );
}

// ── 반 ────────────────────────────────────────────────────────
function TracksSection() {
    const st = useStore();
    const specs = st.doc.specs;
    const [api, setApi] = useState<SheetApi | null>(null);
    const apiCb = useRef((a: SheetApi) => setApi(a)).current;
    const specNames = specs.map((s) => s.name);

    const specForGrade = (grade: number): TimetableSpec | undefined =>
        specs.find((s) => s.grades?.includes(grade)) ?? specs.find((s) => !s.grades || s.grades.length === 0) ?? specs[0];

    const rows: SheetRow[] = st.doc.tracks
        .slice().sort((a, b) => (a.grade ?? 0) - (b.grade ?? 0) || ((a.attr?.classNum as number) ?? 0) - ((b.attr?.classNum as number) ?? 0))
        .map((t) => ({
            _id: t.id,
            grade: t.grade ?? '',
            cls: (t.attr?.classNum as number | undefined) ?? (Number(t.name.split('-')[1]) || ''),
            name: t.name,
            homeroom: t.homeroomName ?? '',
            spec: specs.find((s) => s.id === t.specId)?.name ?? '',
        }));

    const columns: SheetColumn[] = [
        { key: 'grade', title: '학년', type: 'number', width: 70, sortable: true, validate: (v) => (v === '' ? '학년을 적어 주세요' : (Number(v) < 1 || Number(v) > 6 ? '1~6 사이' : undefined)) },
        { key: 'cls', title: '반', type: 'number', width: 70, validate: (v) => (v === '' ? '반 번호를 적어 주세요' : undefined) },
        { key: 'name', title: '이름(자동)', type: 'text', width: 100, readOnly: true, compute: (row) => `${row.grade ?? ''}-${row.cls ?? ''}` },
        { key: 'homeroom', title: L.homeroomName, type: 'text', width: 120, placeholder: '(선택)' },
        {
            key: 'spec', title: L.spec, type: 'select', options: specNames, width: 170,
            validate: (v, row) => {
                if (!v) return undefined;   // 비우면 저장 때 학년에 맞는 틀로 자동 채운다
                const spec = specs.find((s) => s.name === v);
                if (spec?.grades?.length && !spec.grades.includes(Number(row.grade))) return `이 시간 틀은 ${spec.grades.join('·')}학년용입니다`;
                return undefined;
            },
        },
    ];

    const commit = (next: SheetRow[]) => {
        const specByName = new Map(specs.map((s) => [s.name, s.id]));
        const tracks: Track[] = next.map((r) => {
            const ex = st.doc.tracks.find((t) => t.id === r._id);
            const grade = r.grade === '' ? undefined : Number(r.grade);
            const cls = r.cls === '' ? undefined : Number(r.cls);
            const chosen = specByName.get(String(r.spec));
            const auto = grade != null ? specForGrade(grade)?.id : undefined;   // 비었으면 학년에 맞는 틀
            const homeroomName = String(r.homeroom ?? '').trim() || undefined;
            return {
                kind: 'track', id: r._id,
                name: `${grade ?? ''}-${cls ?? ''}`,
                grade, specId: chosen ?? auto ?? ex?.specId,
                homeroomName,
                attr: { ...ex?.attr, classNum: cls },
            };
        });
        st.act.syncTracks(tracks);
    };

    const newRow = (): SheetRow => ({ _id: uid('t'), grade: '', cls: '', name: '', homeroom: '', spec: '' });

    return (
        <div className="space-y-3">
            {specs.length === 0 && <p className="text-[13px] text-warn"><Mark kind="warn" /> 먼저 「시간 틀」에서 시간 틀을 만들어야 반에 연결할 수 있습니다.</p>}
            <SheetToolbar title={L.track} api={api} helpKey="sheetTracks" />
            <BulkTracks specForGrade={specForGrade} />
            <Sheet columns={columns} rows={rows} onCommit={commit} newRow={newRow} onApi={apiCb} minWidth={600} {...undoRedo(st)} />
        </div>
    );
}

// 학년별 반 수로 한 번에 만들기 (학년마다 맞는 시간 틀을 고른다 · #16)
function BulkTracks({ specForGrade }: { specForGrade: (grade: number) => TimetableSpec | undefined }) {
    const st = useStore();
    const [counts, setCounts] = useState<Record<number, string>>({ 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' });
    const [warn, setWarn] = useState('');
    const make = () => {
        const add: Track[] = [];
        const noSpec: number[] = [];
        for (const g of [1, 2, 3, 4, 5, 6]) {
            const n = parseInt(counts[g], 10);
            if (!Number.isFinite(n) || n <= 0) continue;
            const spec = specForGrade(g);
            if (!spec) { noSpec.push(g); continue; }
            const matched = spec.grades?.includes(g);
            if (!matched) noSpec.push(g);   // 학년에 맞는 틀이 없어 첫 틀로 넣음
            for (let cls = 1; cls <= n; cls++) {
                const exists = [...st.doc.tracks, ...add].some((t) => t.grade === g && ((t.attr?.classNum as number | undefined) === cls || t.name === `${g}-${cls}`));
                if (exists) continue;
                add.push({ kind: 'track', id: uid('t'), name: `${g}-${cls}`, grade: g, specId: spec.id, attr: { classNum: cls } });
            }
        }
        if (add.length) st.act.syncTracks([...st.doc.tracks, ...add]);
        setWarn(noSpec.length ? `${noSpec.join('·')}학년은 맞는 시간 틀이 없어 첫 시간 틀로 넣었습니다. 「시간 틀」에서 적용 학년을 지정해 주세요.` : '');
        setCounts({ 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' });
    };
    return (
        <Card className="p-2.5 space-y-2">
            <div className="flex items-end gap-2 flex-wrap">
                <div className="text-[12px] text-muted mr-1">학년별 반 수로 한 번에 만들기</div>
                {[1, 2, 3, 4, 5, 6].map((g) => (
                    <label key={g} className="text-[11px] text-muted">{g}학년<br />
                        <TextInput type="number" value={counts[g]} placeholder="0" onChange={(e) => setCounts({ ...counts, [g]: e.target.value })} className="w-14" />
                    </label>
                ))}
                <Button variant="primary" icon="plus" onClick={make}>만들기</Button>
                <span className="text-[11px] text-muted">이미 있는 반은 건너뜁니다.</span>
            </div>
            {warn && <p className="text-[11px] text-warn"><Mark kind="warn" /> {warn}</p>}
        </Card>
    );
}

// ── 교사 (담임 모델) ──────────────────────────────────────────
function AgentsSection() {
    const st = useStore();
    const [api, setApi] = useState<SheetApi | null>(null);
    const apiCb = useRef((a: SheetApi) => setApi(a)).current;
    const trackNames = st.doc.tracks.map((t) => t.name);
    const specNames = st.doc.specs.map((s) => s.name);
    const ROLE_OPTS = [L.roles.special, L.roles.nonSubject, L.roles.homeroomPlus];
    const TIER_OPTS = [L.tierOptions[1], L.tierOptions[2], L.tierOptions[3]];
    const tierByLabel: Record<string, 1 | 2 | 3> = { [L.tierOptions[1]]: 1, [L.tierOptions[2]]: 2, [L.tierOptions[3]]: 3 };

    const roleOf = (a: Agent): string => (a.role === L.roles.special || a.role === L.roles.nonSubject || a.role === L.roles.homeroomPlus) ? a.role : L.roles.special;

    const rows: SheetRow[] = st.doc.agents.map((a) => ({
        _id: a.id,
        name: a.name,
        role: roleOf(a),
        tier: L.tierOptions[(a.tier ?? 2) as 1 | 2 | 3],
        homeroom: roleOf(a) === L.roles.homeroomPlus
            ? (a.homeroomTrackIds ?? []).map((id) => st.doc.tracks.find((t) => t.id === id)?.name ?? '').filter(Boolean)
            : [],
        lunch: st.doc.specs.find((s) => s.id === a.lunchSpecId)?.name ?? '',
    }));

    const columns: SheetColumn[] = [
        { key: 'name', title: '이름', type: 'text', width: 120, sortable: true, validate: (v) => (!String(v).trim() ? '이름을 적어 주세요' : undefined) },
        { key: 'role', title: L.role, type: 'select', options: ROLE_OPTS, width: 120 },
        { key: 'tier', title: L.tier, type: 'select', options: TIER_OPTS, width: 130 },
        {
            key: 'homeroom', title: L.homeroomTracks, type: 'multiselect', width: 150,
            optionsOf: (row) => (row.role === L.roles.homeroomPlus ? trackNames : []),
            placeholder: '「담임 겸 전담」만',
        },
        { key: 'lunch', title: L.lunchSpec, type: 'select', options: specNames, allowEmpty: true, width: 130 },
    ];

    const commit = (next: SheetRow[]) => {
        const trackByName = new Map(st.doc.tracks.map((t) => [t.name, t.id]));
        const specByName = new Map(st.doc.specs.map((s) => [s.name, s.id]));
        const agents: Agent[] = next.map((r, i) => {
            const ex = st.doc.agents.find((a) => a.id === r._id);
            const role = (r.role === L.roles.special || r.role === L.roles.nonSubject || r.role === L.roles.homeroomPlus)
                ? (r.role as Agent['role']) : undefined;
            const tier = tierByLabel[String(r.tier)] ?? 2;
            const homeroomTrackIds = role === L.roles.homeroomPlus
                ? (Array.isArray(r.homeroom) ? r.homeroom.map((n) => trackByName.get(n)).filter((x): x is string => !!x) : [])
                : undefined;
            const lunchSpecId = specByName.get(String(r.lunch)) || undefined;
            return {
                kind: 'agent', id: r._id, name: String(r.name ?? ''),
                attr: ex?.attr ?? { color: colorFor(i) },
                role, tier,
                homeroomTrackIds: homeroomTrackIds && homeroomTrackIds.length ? homeroomTrackIds : undefined,
                lunchSpecId,
            };
        });
        st.act.syncAgents(agents);
    };

    const newRow = (): SheetRow => ({ _id: uid('a'), name: '', role: L.roles.special, tier: L.tierOptions[2], homeroom: [], lunch: '' });

    return (
        <div className="space-y-3">
            <SheetToolbar title={L.agent} api={api} helpKey="sheetAgents" />
            <p className="text-[12px] text-muted rounded-md bg-panel2 border border-line px-2.5 py-1.5">
                담임은 여기 넣지 않습니다. 시수표의 교사 칸에서 「담임」을 고르세요. 전담·강사의 담당 반은 시수표에서 정합니다.
            </p>
            <Sheet columns={columns} rows={rows} onCommit={commit} newRow={newRow} onApi={apiCb} minWidth={660} {...undoRedo(st)} />
        </div>
    );
}

// ── 과목 ──────────────────────────────────────────────────────
function ActivitiesSection() {
    const st = useStore();
    const [api, setApi] = useState<SheetApi | null>(null);
    const apiCb = useRef((a: SheetApi) => setApi(a)).current;

    const rows: SheetRow[] = st.doc.activities.map((a) => ({
        _id: a.id, name: a.name, color: (a.attr?.color as string | undefined) ?? '',
    }));
    const columns: SheetColumn[] = [
        { key: 'name', title: '이름', type: 'text', width: 160, validate: (v) => (!String(v).trim() ? '과목 이름을 적어 주세요' : undefined) },
        { key: 'color', title: '색(옵션)', type: 'text', width: 120, placeholder: '#5b8def' },
    ];
    const commit = (next: SheetRow[]) => {
        const activities: Activity[] = next.map((r, i) => {
            const ex = st.doc.activities.find((a) => a.id === r._id);
            return { kind: 'activity', id: r._id, name: String(r.name ?? ''), attr: { ...ex?.attr, color: String(r.color) || (ex?.attr?.color as string) || colorFor(i) } };
        });
        st.act.syncActivities(activities);
    };
    const newRow = (): SheetRow => ({ _id: uid('act'), name: '', color: '' });

    return (
        <div className="space-y-3">
            <SheetToolbar title={L.activity} api={api} helpKey="sheetActivities" />
            <Sheet columns={columns} rows={rows} onCommit={commit} newRow={newRow} onApi={apiCb} minWidth={320} {...undoRedo(st)} />
        </div>
    );
}

// ── 특별실 ────────────────────────────────────────────────────
function ResourcesSection() {
    const st = useStore();
    const [api, setApi] = useState<SheetApi | null>(null);
    const apiCb = useRef((a: SheetApi) => setApi(a)).current;
    const actNames = st.doc.activities.map((a) => a.name);

    const rows: SheetRow[] = st.doc.resources.map((r) => ({
        _id: r.id, name: r.name, cap: r.capacity ?? 1,
        acts: (r.activityIds ?? []).map((id) => st.doc.activities.find((a) => a.id === id)?.name ?? id),
    }));
    const columns: SheetColumn[] = [
        { key: 'name', title: '이름', type: 'text', width: 150, validate: (v) => (!String(v).trim() ? '특별실 이름을 적어 주세요' : undefined) },
        { key: 'cap', title: L.capacity, type: 'number', width: 90, help: '같은 시각에 들어갈 수 있는 반의 수입니다(과학실이 2개면 2).' },
        {
            key: 'acts', title: L.activity, type: 'multiselect', options: actNames, width: 260, placeholder: '과목을 고르세요',
            validate: (v) => { const bad = (Array.isArray(v) ? v : []).filter((n) => !actNames.includes(n)); return bad.length ? `과목 목록에 없음: ${bad.join(', ')}` : undefined; },
        },
    ];
    const commit = (next: SheetRow[]) => {
        const actByName = new Map(st.doc.activities.map((a) => [a.name, a.id]));
        const resources: Resource[] = next.map((r, i) => {
            const ex = st.doc.resources.find((x) => x.id === r._id);
            const ids = (Array.isArray(r.acts) ? r.acts : []).map((n) => actByName.get(n)).filter((x): x is string => !!x);
            return { kind: 'resource', id: r._id, name: String(r.name ?? ''), capacity: Number(r.cap) || 1, attr: ex?.attr ?? { color: colorFor(i) }, activityIds: ids.length ? ids : undefined };
        });
        st.act.syncResources(resources);
    };
    const newRow = (): SheetRow => ({ _id: uid('r'), name: '', cap: 1, acts: [] });

    return (
        <div className="space-y-3">
            <SheetToolbar title={L.resource} api={api} helpKey="sheetResources" />
            <Sheet columns={columns} rows={rows} onCommit={commit} newRow={newRow} onApi={apiCb} minWidth={520} {...undoRedo(st)} />
        </div>
    );
}
