/**
 * 오른쪽 속성 패널 — 고른 것의 속성이 뜬다.
 *   표를 고르면: 이름 · 크기(요일·교시 수) · 주기(수업 요일) · 시간 설정(규칙 생성 + 교시별 수동 보정)
 *   아무것도 안 고르면(프로젝트): 학교 이름 · 학기
 * ⭐ 항목 구성은 v1 의 「시간 틀」(TimetableSpec/Slot) 이 보여주던 것과 같게 한다 — 쥔님 「이전 것처럼」.
 *
 * 🔴 모듈 1.1 — 쥔님 불편 4건 중 ②③:
 *   ② 시간 설정을 두 층으로 — 「규칙 생성」(한 번에 다시 만들기)을 얹고, 아래에 교시별 수동 보정을 둔다.
 *      손으로 고친 교시엔 「손봄」 표시. [적용]은 손본 값을 덮으므로 미리 「N개가 덮입니다」확인을 받는다.
 *      시각을 손으로 바꾸면 「뒤 교시도 같이 밀기」(기본 켬)로 뒤를 따라 민다.
 *   ③ 교시 수는 숫자 타이핑 대신 [−] N교시 [+] 스테퍼로.
 */
import { useState } from 'react';
import { useV2 } from '../store';
import type { Slot } from '../../types/schema';
import { DAY_LABEL } from '../../ui/lib';
import { defaultSlotRule, type SlotRule } from '../defaults';

const FULL_DAYS = [0, 1, 2, 3, 4, 5, 6]; // 월~일

export function Properties() {
    const st = useV2();
    if (st.selection.kind === 'project') return <ProjectProps />;
    return <SheetProps sheetId={st.selection.id} />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="block text-[11.5px] text-muted mb-1">{label}</span>
            {children}
        </label>
    );
}

const inputCls = 'w-full px-2 py-1.5 bg-panel text-text border border-line rounded text-[13px] focus:border-accent outline-none';

function ProjectProps() {
    const st = useV2();
    return (
        <div className="p-3 space-y-4">
            <h2 className="text-[13px] font-semibold text-text flex items-center gap-1.5">프로젝트 속성</h2>
            <Field label="학교 이름">
                <input className={inputCls} value={st.project.name}
                    placeholder="예: 고성초등학교"
                    onChange={(e) => st.setProjectMeta({ name: e.target.value })} />
            </Field>
            <Field label="학기">
                <input className={inputCls} value={st.project.term}
                    placeholder="예: 2026학년도 2학기"
                    onChange={(e) => st.setProjectMeta({ term: e.target.value })} />
            </Field>
            <p className="text-[11.5px] text-muted leading-relaxed pt-2 border-t border-line">
                왼쪽에서 표를 고르면 그 표의 속성(크기·시간 설정)이 여기 뜹니다.
            </p>
        </div>
    );
}

function SheetProps({ sheetId }: { sheetId: string }) {
    const st = useV2();
    const sheet = st.getSheet(sheetId);
    if (!sheet) return <div className="p-3 text-[13px] text-muted">표를 찾을 수 없습니다.</div>;
    const spec = sheet.spec;
    const activeDays = spec.activeDays ?? [];
    const periods = spec.slots.length;

    const toggleDay = (d: number) => {
        const next = activeDays.includes(d) ? activeDays.filter((x) => x !== d) : [...activeDays, d].sort((a, b) => a - b);
        st.updateSheetSpec(sheetId, { ...spec, activeDays: next });
    };

    return (
        <div className="p-3 space-y-4">
            <h2 className="text-[13px] font-semibold text-text">표 속성</h2>

            <Field label="이름">
                <input className={inputCls} value={sheet.name}
                    onChange={(e) => st.renameSheet(sheetId, e.target.value)} />
            </Field>

            {/* 크기 — 교시 수 스테퍼(③) */}
            <div className="space-y-2">
                <span className="block text-[11.5px] text-muted">크기 — 요일 {activeDays.length}개 · 교시 {periods}개</span>
                <div>
                    <span className="block text-[11.5px] text-muted mb-1">교시 수</span>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => st.stepPeriods(sheetId, -1)} disabled={periods <= 0}
                            className="w-8 h-8 grid place-items-center rounded border border-line bg-panel text-text text-[16px] leading-none hover:bg-panel2 disabled:opacity-40"
                            title="교시 줄이기">−</button>
                        <span className="min-w-[56px] text-center text-[13px] text-text tabular-nums">{periods}교시</span>
                        <button type="button" onClick={() => st.stepPeriods(sheetId, +1)} disabled={periods >= 20}
                            className="w-8 h-8 grid place-items-center rounded border border-line bg-panel text-text text-[16px] leading-none hover:bg-panel2 disabled:opacity-40"
                            title="교시 늘리기">+</button>
                    </div>
                    <p className="text-[11px] text-muted/80 mt-1 leading-relaxed">
                        늘리면 앞 교시 끝에 이어 붙습니다. 줄이면 격자 밖 칸 글자는 지워집니다.
                    </p>
                </div>
            </div>

            {/* 주기 — 수업 요일 */}
            <div>
                <span className="block text-[11.5px] text-muted mb-1.5">주기 — 수업하는 요일</span>
                <div className="flex flex-wrap gap-1">
                    {FULL_DAYS.map((d) => {
                        const on = activeDays.includes(d);
                        return (
                            <button key={d} onClick={() => toggleDay(d)}
                                className={`w-8 h-8 rounded text-[12.5px] border ${on ? 'bg-accent text-white border-accent' : 'bg-panel text-muted border-line hover:text-text'}`}>
                                {DAY_LABEL[d]}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 규칙 생성(②) — 한 번에 다시 만들기 */}
            <RuleGen key={sheetId} sheetId={sheetId} manualCount={(sheet.manualSlots ?? []).length} seed={defaultSlotRule(spec)} />

            {/* 시간 설정 — 교시별 수동 보정(②) */}
            <SlotEditor sheetId={sheetId} slots={spec.slots} manualSlots={sheet.manualSlots ?? []} />
        </div>
    );
}

/** 규칙 생성 — 받은 값으로 교시 목록을 한 번에 다시 만든다. 손본 값이 있으면 덮기 전에 확인을 받는다 */
function RuleGen({ sheetId, manualCount, seed }: { sheetId: string; manualCount: number; seed: SlotRule }) {
    const st = useV2();
    const [open, setOpen] = useState(false);
    const [r, setR] = useState<SlotRule>(seed);
    const [useLunch, setUseLunch] = useState<boolean>(seed.lunchAfter != null && seed.lunchAfter > 0);

    const numCls = 'w-full px-2 py-1 bg-panel text-text border border-line rounded text-[12.5px] focus:border-accent outline-none';
    const set = (patch: Partial<SlotRule>) => setR((x) => ({ ...x, ...patch }));

    const apply = () => {
        if (manualCount > 0) {
            const ok = window.confirm(`손본 교시 ${manualCount}개가 덮입니다. 규칙으로 다시 만들까요?`);
            if (!ok) return;
        }
        st.applySlotRule(sheetId, { ...r, lunchAfter: useLunch ? r.lunchAfter ?? 1 : null });
    };

    return (
        <div className="border border-line rounded">
            <button type="button" onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between px-2.5 py-2 text-[12px] font-medium text-text hover:bg-panel2">
                <span>규칙으로 한 번에 만들기</span>
                <span className="text-muted">{open ? '▾' : '▸'}</span>
            </button>
            {open && (
                <div className="px-2.5 pb-2.5 pt-1 space-y-2 border-t border-line">
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="시작 시각">
                            <input type="time" className={numCls} value={r.start} onChange={(e) => set({ start: e.target.value })} />
                        </Field>
                        <Field label="교시 수">
                            <input type="number" min={0} max={20} className={numCls} value={r.periods}
                                onChange={(e) => set({ periods: Number(e.target.value) || 0 })} />
                        </Field>
                        <Field label="수업 길이(분)">
                            <input type="number" min={1} max={240} className={numCls} value={r.lessonMinutes}
                                onChange={(e) => set({ lessonMinutes: Number(e.target.value) || 1 })} />
                        </Field>
                        <Field label="쉬는 시간(분)">
                            <input type="number" min={0} max={120} className={numCls} value={r.breakMinutes}
                                onChange={(e) => set({ breakMinutes: Number(e.target.value) || 0 })} />
                        </Field>
                    </div>

                    <label className="flex items-center gap-2 text-[12px] text-text">
                        <input type="checkbox" checked={useLunch} onChange={(e) => setUseLunch(e.target.checked)} className="accent-accent" />
                        점심 넣기
                    </label>
                    {useLunch && (
                        <div className="grid grid-cols-2 gap-2 pl-1">
                            <Field label="몇 교시 뒤에">
                                <input type="number" min={1} max={20} className={numCls} value={r.lunchAfter ?? 1}
                                    onChange={(e) => set({ lunchAfter: Number(e.target.value) || 1 })} />
                            </Field>
                            <Field label="점심 길이(분)">
                                <input type="number" min={1} max={180} className={numCls} value={r.lunchMinutes ?? 50}
                                    onChange={(e) => set({ lunchMinutes: Number(e.target.value) || 1 })} />
                            </Field>
                        </div>
                    )}

                    <button type="button" onClick={apply}
                        className="w-full px-2 py-1.5 rounded bg-accent hover:bg-accenth text-white text-[12.5px] font-medium">
                        적용 — 교시 다시 만들기
                    </button>
                    {manualCount > 0 && (
                        <p className="text-[11px] text-bad/90 leading-relaxed">⚠️ 손본 교시 {manualCount}개가 있습니다. 적용하면 덮어집니다.</p>
                    )}
                </div>
            )}
        </div>
    );
}

/** 교시별 수동 보정 — 라벨·시작·끝·종류. 시각은 「뒤 교시도 같이 밀기」로 뒤를 따라 민다 */
function SlotEditor({ sheetId, slots, manualSlots }: { sheetId: string; slots: Slot[]; manualSlots: number[] }) {
    const [push, setPush] = useState(true); // 기본 켬
    const manual = new Set(manualSlots);
    return (
        <div>
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11.5px] text-muted">시간 설정 — 교시마다</span>
            </div>
            <label className="flex items-center gap-2 text-[11.5px] text-muted mb-2">
                <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} className="accent-accent" />
                뒤 교시도 같이 밀기
            </label>
            <div className="space-y-1.5">
                {slots.map((s) => (
                    <SlotRow key={s.index} sheetId={sheetId} slot={s} manual={manual.has(s.index)} pushFollowing={push} />
                ))}
                {slots.length === 0 && <p className="text-[12px] text-muted">교시가 없습니다. 위에서 교시 수를 늘리세요.</p>}
            </div>
        </div>
    );
}

function SlotRow({ sheetId, slot, manual, pushFollowing }: { sheetId: string; slot: Slot; manual: boolean; pushFollowing: boolean }) {
    const st = useV2();
    const kind = slot.kind ?? (slot.assignable ? 'lesson' : 'other');
    const setKind = (k: string) => {
        st.updateSlot(sheetId, slot.index, { kind: k as Slot['kind'], assignable: k === 'lesson' });
    };
    return (
        <div className="flex items-center gap-1 text-[12px]">
            <input className="w-12 px-1.5 py-1 bg-panel text-text border border-line rounded" value={slot.label}
                onChange={(e) => st.updateSlot(sheetId, slot.index, { label: e.target.value })} title="라벨" />
            <input type="time" className="w-[78px] px-1 py-1 bg-panel text-text border border-line rounded" value={slot.start}
                onChange={(e) => st.editSlotTime(sheetId, slot.index, { start: e.target.value }, pushFollowing)} title="시작" />
            <input type="time" className="w-[78px] px-1 py-1 bg-panel text-text border border-line rounded" value={slot.end}
                onChange={(e) => st.editSlotTime(sheetId, slot.index, { end: e.target.value }, pushFollowing)} title="끝" />
            <select className="flex-1 min-w-0 px-1 py-1 bg-panel text-text border border-line rounded" value={kind} onChange={(e) => setKind(e.target.value)} title="종류">
                <option value="lesson">수업</option>
                <option value="lunch">점심</option>
                <option value="break">쉬는 시간</option>
                <option value="other">기타</option>
            </select>
            {manual && <span className="shrink-0 text-[9.5px] text-accent border border-accent/40 rounded px-1 py-0.5 leading-none" title="손으로 고친 교시">손봄</span>}
        </div>
    );
}
