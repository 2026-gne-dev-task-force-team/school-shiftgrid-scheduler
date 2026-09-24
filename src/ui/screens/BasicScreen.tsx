/** 기초자료 — 학교·시간 틀·반·교사·과목·특별실·시수표. 오른쪽에 배정/필요 현황(sticky) */
import { useRef, useState } from 'react';
import { useStore } from '../../store/store';
import { uid } from '../../store/ids';
import { colorFor } from '../../store/doc-ops';
import type { MakeSpecInput } from '../../engine/api';
import { makeSpec } from '../../engine/api';
import type { Agent, Activity, Resource, Track, TimetableSpec } from '../../types/schema';
import { assignableSlots } from '../lib';
import { Button, Card, ConfirmButton, Field, Info, TextInput, Mark, Modal } from '../parts/ui';
import Sheet, { type SheetColumn, type SheetRow, type SheetApi } from '../parts/Sheet';
import DemandStatusPanel from './basic/DemandStatusPanel';
import DemandTable from './basic/DemandTable';
import ExcelBar from './basic/ExcelBar';

// ── 시트 위 공용 툴바 ─────────────────────────────────────────
function SheetToolbar({ title, api, hint }: { title: string; api: SheetApi | null; hint: [string, string, string] }) {
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <div className="text-[13px] font-medium mr-1">{title}</div>
            <Button icon="plus" onClick={() => api?.addRow()}>행 추가</Button>
            <Button icon="trash" onClick={() => api?.deleteSelectedRows()}>선택 행 삭제</Button>
            <Info lines={hint} />
        </div>
    );
}
const undoRedo = (st: ReturnType<typeof useStore>) => ({ onUndo: st.undo, onRedo: st.redo });

type Sub = 'school' | 'specs' | 'tracks' | 'agents' | 'activities' | 'resources' | 'demands';
const SUBS: { id: Sub; label: string }[] = [
    { id: 'school', label: '학교' }, { id: 'specs', label: '시간 틀' }, { id: 'tracks', label: '반' },
    { id: 'agents', label: '교사' }, { id: 'activities', label: '과목' }, { id: 'resources', label: '특별실' },
    { id: 'demands', label: '시수표' },
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
                <div className="md:hidden flex items-center gap-1.5 px-3 pt-3 pb-2 border-b border-line overflow-x-auto">
                    {SUBS.map((s) => (
                        <button key={s.id} onClick={() => setSub(s.id)}
                            className={`shrink-0 min-h-[44px] flex items-center px-3 rounded-md text-[13px] whitespace-nowrap ${sub === s.id ? 'bg-accent text-white' : 'text-muted hover:text-text hover:bg-panel2'}`}>
                            {s.label}
                        </button>
                    ))}
                </div>
                <div className="md:hidden px-3 pb-2 border-b border-line"><ExcelBar /></div>

                {/* 데스크톱: 기존 한 줄 그대로 */}
                <div className="hidden md:flex items-center gap-1 px-4 pt-3 pb-2 border-b border-line flex-wrap">
                    {SUBS.map((s) => (
                        <button key={s.id} onClick={() => setSub(s.id)}
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

// ── 시간 틀 (규격) ────────────────────────────────────────────
function SpecsSection() {
    const st = useStore();
    const [form, setForm] = useState({ name: '', periods: 6, lunchAfter: 4, dayStart: '09:00', lessonMin: 40, breakMin: 10, lunchMin: 50 });
    const [preview, setPreview] = useState<TimetableSpec | null>(null);

    const buildInput = (): MakeSpecInput => ({
        id: uid('spec'), name: form.name || '새 규격', periods: form.periods, lunchAfter: form.lunchAfter,
        dayStart: form.dayStart, lessonMin: form.lessonMin, breakMin: form.breakMin, lunchMin: form.lunchMin,
    });

    const doPreview = () => {
        const s = st.runEngine('규격 미리보기', () => makeSpec(buildInput()));
        setPreview(s ?? null);
    };

    return (
        <div className="space-y-4">
            <Card className="p-3 max-w-2xl">
                <div className="flex items-center gap-1.5 mb-2 text-[13px] font-medium">
                    학년군 규격 만들기
                    <Info lines={[
                        '학년마다 교시 수·점심 위치가 달라 규격을 따로 둡니다 (1·2학년 / 3·4 / 5·6).',
                        '교사·특별실 겹침은 교시 번호가 아니라 시각으로 봐야 해서 규격이 시각을 만듭니다.',
                        '값을 바꾼 뒤 「미리보기」로 슬롯 표를 확인하고 「추가」합니다.',
                    ]} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Field label="규격 이름"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="1·2학년 규격" className="w-full" /></Field>
                    <Field label="교시 수"><TextInput type="number" value={form.periods} onChange={(e) => setForm({ ...form, periods: +e.target.value })} className="w-full" /></Field>
                    <Field label="점심 위치" hint="몇 교시 뒤"><TextInput type="number" value={form.lunchAfter} onChange={(e) => setForm({ ...form, lunchAfter: +e.target.value })} className="w-full" /></Field>
                    <Field label="시작 시각"><TextInput value={form.dayStart} onChange={(e) => setForm({ ...form, dayStart: e.target.value })} className="w-full" /></Field>
                    <Field label="수업(분)"><TextInput type="number" value={form.lessonMin} onChange={(e) => setForm({ ...form, lessonMin: +e.target.value })} className="w-full" /></Field>
                    <Field label="쉬는(분)"><TextInput type="number" value={form.breakMin} onChange={(e) => setForm({ ...form, breakMin: +e.target.value })} className="w-full" /></Field>
                    <Field label="점심(분)"><TextInput type="number" value={form.lunchMin} onChange={(e) => setForm({ ...form, lunchMin: +e.target.value })} className="w-full" /></Field>
                </div>
                <div className="flex gap-2 mt-2">
                    <Button icon="search" onClick={doPreview}>미리보기</Button>
                    <Button variant="primary" icon="plus" onClick={() => st.act.addSpec(buildInput())}>규격 추가</Button>
                </div>
                {preview && <SlotTable spec={preview} caption="미리보기" />}
            </Card>

            <div className="space-y-2">
                {st.doc.specs.length === 0 && <p className="text-[13px] text-muted">아직 규격이 없습니다. 위에서 학년군별로 하나씩 만드세요.</p>}
                {st.doc.specs.map((s) => (
                    <Card key={s.id} className="p-3">
                        <div className="flex items-center justify-between">
                            <div className="font-medium text-[13px]">{s.name} <span className="text-muted font-normal">· 수업 {assignableSlots(s).length}칸 · {s.activeDays.length}일</span></div>
                            <ConfirmButton question="이 규격과 그 규격을 쓰는 반·배치를 지울까요?" onConfirm={() => st.act.removeSpec(s.id)} />
                        </div>
                        <SlotTable spec={s} />
                    </Card>
                ))}
            </div>
        </div>
    );
}

function SlotTable({ spec, caption }: { spec: TimetableSpec; caption?: string }) {
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

    const rows: SheetRow[] = st.doc.tracks
        .slice().sort((a, b) => (a.grade ?? 0) - (b.grade ?? 0) || ((a.attr?.classNum as number) ?? 0) - ((b.attr?.classNum as number) ?? 0))
        .map((t) => ({
            _id: t.id,
            grade: t.grade ?? '',
            cls: (t.attr?.classNum as number | undefined) ?? (Number(t.name.split('-')[1]) || ''),
            name: t.name,
            spec: specs.find((s) => s.id === t.specId)?.name ?? '',
        }));

    const columns: SheetColumn[] = [
        { key: 'grade', title: '학년', type: 'number', width: 70, validate: (v) => (v === '' ? '학년을 적어 주세요' : (Number(v) < 1 || Number(v) > 6 ? '1~6 사이' : undefined)) },
        { key: 'cls', title: '반', type: 'number', width: 70, validate: (v) => (v === '' ? '반 번호를 적어 주세요' : undefined) },
        { key: 'name', title: '이름(자동)', type: 'text', width: 110, readOnly: true, compute: (row) => `${row.grade ?? ''}-${row.cls ?? ''}` },
        { key: 'spec', title: '규격', type: 'select', options: specNames, width: 170, validate: (v) => (!v ? '규격을 고르세요' : undefined) },
    ];

    const commit = (next: SheetRow[]) => {
        const specByName = new Map(specs.map((s) => [s.name, s.id]));
        const tracks: Track[] = next.map((r) => {
            const ex = st.doc.tracks.find((t) => t.id === r._id);
            const grade = r.grade === '' ? undefined : Number(r.grade);
            const cls = r.cls === '' ? undefined : Number(r.cls);
            return {
                kind: 'track', id: r._id,
                name: `${grade ?? ''}-${cls ?? ''}`,
                grade, specId: specByName.get(String(r.spec)) ?? ex?.specId,
                attr: { ...ex?.attr, classNum: cls },
            };
        });
        st.act.syncTracks(tracks);
    };

    const newRow = (): SheetRow => ({ _id: uid('t'), grade: '', cls: '', name: '', spec: specNames[0] ?? '' });

    return (
        <div className="space-y-3">
            {specs.length === 0 && <p className="text-[13px] text-warn"><Mark kind="warn" /> 먼저 「시간 틀」에서 규격을 만들어야 반에 규격을 줄 수 있습니다.</p>}
            <SheetToolbar title="반" api={api} hint={[
                '한 반이 한 줄입니다. 학년·반을 넣으면 이름은 자동으로 「학년-반」이 됩니다.',
                '엑셀에서 학년·반을 복사해 붙일 수 있고, 마지막 줄에서 Enter 로 계속 내려갑니다.',
                '규격은 「시간 틀」에서 만든 것 중 고릅니다.',
            ]} />
            <BulkTracks />
            <Sheet columns={columns} rows={rows} onCommit={commit} newRow={newRow} onApi={apiCb} minWidth={520} {...undoRedo(st)} />
        </div>
    );
}

// 학년별 반 수로 한 번에 만들기
function BulkTracks() {
    const st = useStore();
    const [counts, setCounts] = useState<Record<number, string>>({ 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' });
    const make = () => {
        const c: Record<number, number> = {};
        for (const g of [1, 2, 3, 4, 5, 6]) { const n = parseInt(counts[g], 10); if (Number.isFinite(n) && n > 0) c[g] = n; }
        if (Object.keys(c).length === 0) return;
        st.act.makeTracksByGrade(c, st.doc.specs[0]?.id ?? '');
        setCounts({ 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' });
    };
    return (
        <Card className="p-2.5 flex items-end gap-2 flex-wrap">
            <div className="text-[12px] text-muted mr-1">학년별 반 수로 한 번에 만들기</div>
            {[1, 2, 3, 4, 5, 6].map((g) => (
                <label key={g} className="text-[11px] text-muted">{g}학년<br />
                    <TextInput type="number" value={counts[g]} placeholder="0" onChange={(e) => setCounts({ ...counts, [g]: e.target.value })} className="w-14" />
                </label>
            ))}
            <Button variant="primary" icon="plus" onClick={make}>만들기</Button>
            <span className="text-[11px] text-muted">이미 있는 반은 건너뜁니다.</span>
        </Card>
    );
}

// ── 교사 ──────────────────────────────────────────────────────
function AgentsSection() {
    const st = useStore();
    const [api, setApi] = useState<SheetApi | null>(null);
    const apiCb = useRef((a: SheetApi) => setApi(a)).current;
    const trackNames = st.doc.tracks.map((t) => t.name);

    const rows: SheetRow[] = st.doc.agents.map((a) => ({
        _id: a.id,
        name: a.name,
        role: a.role ?? '전담',
        tier: a.tier ? String(a.tier) : '2',
        coteach: !!a.coteach,
        homeroom: st.doc.tracks.find((t) => t.id === a.homeroomTrackId)?.name ?? '',
    }));

    const columns: SheetColumn[] = [
        { key: 'name', title: '이름', type: 'text', width: 130, validate: (v) => (!String(v).trim() ? '이름을 적어 주세요' : undefined) },
        { key: 'role', title: '역할', type: 'select', options: ['담임', '전담', '비교과'], width: 100 },
        { key: 'tier', title: '티어', type: 'select', options: ['1', '2', '3'], width: 80 },
        { key: 'coteach', title: '보조인력', type: 'bool', width: 90 },
        { key: 'homeroom', title: '담임반', type: 'select', options: trackNames, allowEmpty: true, width: 120 },
    ];

    const commit = (next: SheetRow[]) => {
        const trackByName = new Map(st.doc.tracks.map((t) => [t.name, t.id]));
        const agents: Agent[] = next.map((r, i) => {
            const ex = st.doc.agents.find((a) => a.id === r._id);
            const tierN = Number(r.tier);
            return {
                kind: 'agent', id: r._id, name: String(r.name ?? ''),
                attr: ex?.attr ?? { color: colorFor(i) },
                role: (r.role as Agent['role']) || undefined,
                tier: tierN === 1 || tierN === 2 || tierN === 3 ? (tierN as 1 | 2 | 3) : undefined,
                coteach: r.coteach ? true : undefined,
                homeroomTrackId: trackByName.get(String(r.homeroom)) || undefined,
            };
        });
        st.act.syncAgents(agents);
    };

    const newRow = (): SheetRow => ({ _id: uid('a'), name: '', role: '전담', tier: '2', coteach: false, homeroom: '' });

    return (
        <div className="space-y-3">
            <SheetToolbar title="교사" api={api} hint={[
                '담임·전담·보조인력을 모두 한 줄씩 넣습니다.',
                '티어·보조인력은 소프트 규칙(회피 등)의 가중치에만 씁니다.',
                '엑셀에서 이름 목록을 복사해 「이름」 칸에 붙이면 한꺼번에 들어갑니다.',
            ]} />
            <Sheet columns={columns} rows={rows} onCommit={commit} newRow={newRow} onApi={apiCb} minWidth={560} {...undoRedo(st)} />
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
            <SheetToolbar title="과목" api={api} hint={[
                '과목 이름을 한 줄씩 넣습니다. 색은 비워 두면 자동으로 정해집니다.',
                '엑셀에서 과목 목록을 복사해 붙일 수 있습니다.',
                '특별실·시수표에서 이 과목 이름을 씁니다.',
            ]} />
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
        { key: 'cap', title: '수용 수', type: 'number', width: 90 },
        {
            key: 'acts', title: '과목들 (쉼표로)', type: 'list', suggest: actNames, width: 260, placeholder: '예: 과학, 실험',
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
            <SheetToolbar title="특별실" api={api} hint={[
                '과학실·체육관처럼 여러 반이 나눠 쓰는 시설을 넣습니다.',
                '수용 수는 같은 시각에 몇 반까지 들어가나입니다(과학실 2개면 2).',
                '과목들은 쉼표로 여러 개 — 타이핑하면 과목 이름이 자동완성됩니다. 비우면 아무 과목이나.',
            ]} />
            <Sheet columns={columns} rows={rows} onCommit={commit} newRow={newRow} onApi={apiCb} minWidth={520} {...undoRedo(st)} />
        </div>
    );
}
