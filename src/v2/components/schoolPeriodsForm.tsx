/** 속성 폼 — 「학교 수업 시간」. 순수 로직은 schoolPeriods.ts(이 파일은 컴포넌트만 내보낸다) */
import type { ComponentFormProps } from './types';
import type { SchoolPeriodsProps } from './schoolPeriods';

const numCls = 'w-full px-2 py-1 bg-panel text-text border border-line rounded text-[12.5px] focus:border-accent outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="block text-[11px] text-muted mb-1">{label}</span>
            {children}
        </label>
    );
}

export function SchoolPeriodsForm({ props, onChange }: ComponentFormProps<SchoolPeriodsProps>) {
    const useLunch = props.lunchAfter != null && props.lunchAfter > 0;
    return (
        <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
                <Field label="시작 시각">
                    <input type="time" className={numCls} value={props.start}
                        onChange={(e) => onChange({ start: e.target.value })} />
                </Field>
                <Field label="줄 수">
                    <input type="number" min={0} max={20} className={numCls} value={props.rows}
                        onChange={(e) => onChange({ rows: Number(e.target.value) || 0 })} />
                </Field>
                <Field label="수업 길이(분)">
                    <input type="number" min={1} max={240} className={numCls} value={props.lessonMinutes}
                        onChange={(e) => onChange({ lessonMinutes: Number(e.target.value) || 1 })} />
                </Field>
                <Field label="쉬는 시간(분)">
                    <input type="number" min={0} max={120} className={numCls} value={props.breakMinutes}
                        onChange={(e) => onChange({ breakMinutes: Number(e.target.value) || 0 })} />
                </Field>
            </div>
            <label className="flex items-center gap-2 text-[12px] text-text">
                <input type="checkbox" checked={useLunch} className="accent-accent"
                    onChange={(e) => onChange({ lunchAfter: e.target.checked ? (props.lunchAfter || 4) : null })} />
                점심 넣기
            </label>
            {useLunch && (
                <div className="grid grid-cols-2 gap-2 pl-1">
                    <Field label="몇 번째 줄 뒤에">
                        <input type="number" min={1} max={20} className={numCls} value={props.lunchAfter ?? 4}
                            onChange={(e) => onChange({ lunchAfter: Number(e.target.value) || 1 })} />
                    </Field>
                    <Field label="점심 길이(분)">
                        <input type="number" min={1} max={180} className={numCls} value={props.lunchMinutes}
                            onChange={(e) => onChange({ lunchMinutes: Number(e.target.value) || 1 })} />
                    </Field>
                </div>
            )}
        </div>
    );
}
