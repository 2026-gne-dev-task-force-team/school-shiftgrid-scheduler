/** 기초자료 — 학교·시간 틀·반·교사·과목·특별실·시수표. 오른쪽에 배정/필요 현황(sticky) */
import { useState } from 'react';
import { useStore } from '../../store/store';
import { uid } from '../../store/ids';
import type { MakeSpecInput } from '../../engine/api';
import { makeSpec } from '../../engine/api';
import type { TimetableSpec } from '../../types/schema';
import { indexBy, assignableSlots } from '../lib';
import { Button, Card, ConfirmButton, Field, Info, Select, TextInput, Pill, Mark } from '../parts/ui';
import { Icon } from '../parts/Icon';
import DemandStatusPanel from './basic/DemandStatusPanel';
import DemandTable from './basic/DemandTable';
import ExcelBar from './basic/ExcelBar';

type Sub = 'school' | 'specs' | 'tracks' | 'agents' | 'activities' | 'resources' | 'demands';
const SUBS: { id: Sub; label: string }[] = [
    { id: 'school', label: '학교' }, { id: 'specs', label: '시간 틀' }, { id: 'tracks', label: '반' },
    { id: 'agents', label: '교사' }, { id: 'activities', label: '과목' }, { id: 'resources', label: '특별실' },
    { id: 'demands', label: '시수표' },
];

export default function BasicScreen() {
    const [sub, setSub] = useState<Sub>('school');
    return (
        <div className="flex h-full min-h-0">
            <div className="flex-1 min-w-0 flex flex-col">
                <div className="flex items-center gap-1 px-4 pt-3 pb-2 border-b border-line flex-wrap">
                    {SUBS.map((s) => (
                        <button key={s.id} onClick={() => setSub(s.id)}
                            className={`px-2.5 py-1 rounded-md text-[13px] ${sub === s.id ? 'bg-accent text-white' : 'text-muted hover:text-text hover:bg-panel2'}`}>
                            {s.label}
                        </button>
                    ))}
                    <div className="ml-auto"><ExcelBar /></div>
                </div>
                <div className="flex-1 overflow-auto p-4">
                    {sub === 'school' && <SchoolSection />}
                    {sub === 'specs' && <SpecsSection />}
                    {sub === 'tracks' && <TracksSection />}
                    {sub === 'agents' && <AgentsSection />}
                    {sub === 'activities' && <ActivitiesSection />}
                    {sub === 'resources' && <ResourcesSection />}
                    {sub === 'demands' && <DemandTable />}
                </div>
            </div>
            <aside className="w-72 shrink-0 border-l border-line overflow-auto p-3 hidden lg:block">
                <DemandStatusPanel />
            </aside>
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
    const [name, setName] = useState('');
    const [grade, setGrade] = useState(3);
    const [specId, setSpecId] = useState('');
    const specs = st.doc.specs;
    const chosenSpec = specId || specs[0]?.id || '';

    const add = () => {
        if (!name.trim() || !chosenSpec) return;
        st.act.addTrack(name.trim(), chosenSpec, grade);
        setName('');
    };

    return (
        <div className="space-y-3 max-w-2xl">
            {specs.length === 0 && <p className="text-[13px] text-warn"><Mark kind="warn" /> 먼저 「시간 틀」에서 규격을 만들어야 반에 규격을 줄 수 있습니다.</p>}
            <div className="flex items-end gap-2 flex-wrap">
                <Field label="반 이름"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 3-1" /></Field>
                <Field label="학년"><TextInput type="number" value={grade} onChange={(e) => setGrade(+e.target.value)} className="w-16" /></Field>
                <Field label="규격">
                    <Select value={chosenSpec} onChange={setSpecId}>
                        {specs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                </Field>
                <Button variant="primary" icon="plus" onClick={add} disabled={specs.length === 0}>반 추가</Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {st.doc.tracks.slice().sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0)).map((t) => (
                    <Card key={t.id} className="p-2.5 flex items-center gap-2">
                        <div className="flex-1">
                            <div className="font-medium text-[13px]">{t.name}</div>
                            <div className="text-[11px] text-muted">{t.grade}학년 · {specs.find((s) => s.id === t.specId)?.name ?? '규격 없음'}</div>
                        </div>
                        <ConfirmButton onConfirm={() => st.act.removeTrack(t.id)} iconOnly />
                    </Card>
                ))}
            </div>
        </div>
    );
}

// ── 교사 ──────────────────────────────────────────────────────
function AgentsSection() {
    const st = useStore();
    const [name, setName] = useState('');
    const tracks = indexBy(st.doc.tracks);
    return (
        <div className="space-y-3 max-w-3xl">
            <div className="flex items-end gap-2">
                <Field label="교사 이름"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="지어낸 이름만" /></Field>
                <Button variant="primary" icon="plus" onClick={() => { if (name.trim()) { st.act.addAgent(name.trim()); setName(''); } }}>교사 추가</Button>
                <Info lines={['담임·전담·보조인력을 모두 넣습니다.', 'tier·보조인력은 소프트 규칙(회피 등)의 가중치에만 씁니다.', '역할·담임반은 오른쪽에서 고칩니다.']} />
            </div>
            <div className="space-y-1.5">
                {st.doc.agents.map((a) => (
                    <Card key={a.id} className="p-2 flex items-center gap-2 flex-wrap">
                        <TextInput value={a.name} onChange={(e) => st.act.updateAgent(a.id, { name: e.target.value })} className="w-28" />
                        <Select value={a.role ?? '전담'} onChange={(v) => st.act.updateAgent(a.id, { role: v as never })}>
                            {['담임', '전담', '비교과'].map((r) => <option key={r} value={r}>{r}</option>)}
                        </Select>
                        <Select value={String(a.tier ?? 2)} onChange={(v) => st.act.updateAgent(a.id, { tier: +v as never })}>
                            <option value="1">tier 1 (보직)</option><option value="2">tier 2 (일반)</option><option value="3">tier 3 (지원)</option>
                        </Select>
                        <label className="text-[12px] text-muted flex items-center gap-1">
                            <input type="checkbox" checked={!!a.coteach} onChange={(e) => st.act.updateAgent(a.id, { coteach: e.target.checked })} /> 보조인력
                        </label>
                        <Select value={a.homeroomTrackId ?? ''} onChange={(v) => st.act.updateAgent(a.id, { homeroomTrackId: v || undefined })}>
                            <option value="">담임반 없음</option>
                            {[...tracks.values()].map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </Select>
                        <div className="ml-auto"><ConfirmButton onConfirm={() => st.act.removeAgent(a.id)} iconOnly /></div>
                    </Card>
                ))}
                {st.doc.agents.length === 0 && <p className="text-[13px] text-muted">아직 교사가 없습니다.</p>}
            </div>
        </div>
    );
}

// ── 과목 ──────────────────────────────────────────────────────
function ActivitiesSection() {
    const st = useStore();
    const [name, setName] = useState('');
    return (
        <div className="space-y-3 max-w-xl">
            <div className="flex items-end gap-2">
                <Field label="과목 이름"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 과학" /></Field>
                <Button variant="primary" icon="plus" onClick={() => { if (name.trim()) { st.act.addActivity(name.trim()); setName(''); } }}>과목 추가</Button>
            </div>
            <div className="flex flex-wrap gap-2">
                {st.doc.activities.map((a) => (
                    <span key={a.id} className="inline-flex items-center gap-1.5 bg-panel2 border border-line rounded-md pl-2 pr-1 py-1 text-[13px]">
                        {a.name}
                        <button className="text-muted hover:text-bad" onClick={() => st.act.removeActivity(a.id)} aria-label="삭제"><Icon name="x" size={13} /></button>
                    </span>
                ))}
                {st.doc.activities.length === 0 && <p className="text-[13px] text-muted">아직 과목이 없습니다.</p>}
            </div>
        </div>
    );
}

// ── 특별실 ────────────────────────────────────────────────────
function ResourcesSection() {
    const st = useStore();
    const [name, setName] = useState('');
    return (
        <div className="space-y-3 max-w-3xl">
            <div className="flex items-end gap-2">
                <Field label="특별실 이름"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 과학실" /></Field>
                <Button variant="primary" icon="plus" onClick={() => { if (name.trim()) { st.act.addResource(name.trim()); setName(''); } }}>특별실 추가</Button>
            </div>
            <div className="space-y-1.5">
                {st.doc.resources.map((r) => (
                    <Card key={r.id} className="p-2 flex items-center gap-2 flex-wrap">
                        <TextInput value={r.name} onChange={(e) => st.act.updateResource(r.id, { name: e.target.value })} className="w-32" />
                        <label className="text-[12px] text-muted flex items-center gap-1">수용
                            <TextInput type="number" value={r.capacity ?? 1} onChange={(e) => st.act.updateResource(r.id, { capacity: +e.target.value })} className="w-14" /> 반
                        </label>
                        <div className="flex flex-wrap gap-1 items-center">
                            <span className="text-[11px] text-muted">과목:</span>
                            {st.doc.activities.map((a) => {
                                const on = r.activityIds?.includes(a.id);
                                return (
                                    <button key={a.id} onClick={() => {
                                        const cur = r.activityIds ?? [];
                                        st.act.updateResource(r.id, { activityIds: on ? cur.filter((x) => x !== a.id) : [...cur, a.id] });
                                    }} className={`text-[11px] px-1.5 py-0.5 rounded ${on ? 'bg-accent/25 text-accenth' : 'bg-panel2 text-muted'}`}>{a.name}</button>
                                );
                            })}
                            {st.doc.activities.length === 0 && <span className="text-[11px] text-muted/60">과목을 먼저 만드세요</span>}
                        </div>
                        {(!r.activityIds || r.activityIds.length === 0) && <Pill>아무 과목</Pill>}
                        <div className="ml-auto"><ConfirmButton onConfirm={() => st.act.removeResource(r.id)} iconOnly /></div>
                    </Card>
                ))}
                {st.doc.resources.length === 0 && <p className="text-[13px] text-muted">아직 특별실이 없습니다.</p>}
            </div>
        </div>
    );
}
