/**
 * 오른쪽 속성 패널 — 고른 것의 속성이 뜬다.
 *   표를 고르면: 이름 · 크기(요일·교시 수) · 주기(수업 요일) · 시간 설정(교시마다 라벨·시작·끝·종류)
 *   아무것도 안 고르면(프로젝트): 학교 이름 · 학기
 * ⭐ 항목 구성은 v1 의 「시간 틀」(TimetableSpec/Slot) 이 보여주던 것과 같게 한다 — 쥔님 「이전 것처럼」.
 */
import { useV2 } from '../store';
import type { Slot } from '../../types/schema';
import { DAY_LABEL } from '../../ui/lib';

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

            {/* 크기 */}
            <div className="space-y-2">
                <span className="block text-[11.5px] text-muted">크기 — 요일 {activeDays.length}개 · 교시 {periods}개</span>
                <Field label="교시 수">
                    <input type="number" min={0} max={20} className={inputCls} value={periods}
                        onChange={(e) => st.setPeriods(sheetId, Number(e.target.value) || 0)} />
                </Field>
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

            {/* 시간 설정 */}
            <div>
                <span className="block text-[11.5px] text-muted mb-1.5">시간 설정 — 교시마다</span>
                <div className="space-y-1.5">
                    {spec.slots.map((s) => (
                        <SlotRow key={s.index} sheetId={sheetId} slot={s} />
                    ))}
                    {spec.slots.length === 0 && <p className="text-[12px] text-muted">교시가 없습니다. 위에서 교시 수를 늘리세요.</p>}
                </div>
            </div>

            <p className="text-[11px] text-muted/80 leading-relaxed pt-2 border-t border-line">
                교시를 줄이면 격자 밖으로 나간 칸 글자는 지워집니다.
            </p>
        </div>
    );
}

function SlotRow({ sheetId, slot }: { sheetId: string; slot: Slot }) {
    const st = useV2();
    const kind = slot.kind ?? (slot.assignable ? 'lesson' : 'other');
    const setKind = (k: string) => {
        st.updateSlot(sheetId, slot.index, { kind: k as Slot['kind'], assignable: k === 'lesson' });
    };
    return (
        <div className="flex items-center gap-1 text-[12px]">
            <input className="w-14 px-1.5 py-1 bg-panel text-text border border-line rounded" value={slot.label}
                onChange={(e) => st.updateSlot(sheetId, slot.index, { label: e.target.value })} title="라벨" />
            <input type="time" className="w-[88px] px-1 py-1 bg-panel text-text border border-line rounded" value={slot.start}
                onChange={(e) => st.updateSlot(sheetId, slot.index, { start: e.target.value })} title="시작" />
            <input type="time" className="w-[88px] px-1 py-1 bg-panel text-text border border-line rounded" value={slot.end}
                onChange={(e) => st.updateSlot(sheetId, slot.index, { end: e.target.value })} title="끝" />
            <select className="flex-1 min-w-0 px-1 py-1 bg-panel text-text border border-line rounded" value={kind} onChange={(e) => setKind(e.target.value)} title="종류">
                <option value="lesson">수업</option>
                <option value="lunch">점심</option>
                <option value="break">쉬는 시간</option>
                <option value="other">기타</option>
            </select>
        </div>
    );
}
