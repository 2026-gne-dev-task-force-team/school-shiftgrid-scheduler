/** 속성 폼 — 「열 머리」. 순수 로직은 colHeads.ts(이 파일은 컴포넌트만 내보낸다) */
import type { ComponentFormProps } from './types';
import type { ColHeadsProps, ColHeadsStyle } from './colHeads';

const inputCls = 'w-full px-2 py-1 bg-panel text-text border border-line rounded text-[12.5px] focus:border-accent outline-none';

export function ColHeadsForm({ props, onChange }: ComponentFormProps<ColHeadsProps>) {
    return (
        <div className="space-y-2">
            <label className="block">
                <span className="block text-[11px] text-muted mb-1">꼴</span>
                <select className={inputCls} value={props.style}
                    onChange={(e) => onChange({ style: e.target.value as ColHeadsStyle })}>
                    <option value="weekday">요일(월~금…)</option>
                    <option value="cycle">N일차</option>
                    <option value="custom">직접 입력</option>
                </select>
            </label>
            <label className="block">
                <span className="block text-[11px] text-muted mb-1">열 수</span>
                <input type="number" min={1} max={14} className={inputCls} value={props.count}
                    onChange={(e) => onChange({ count: Number(e.target.value) || 1 })} />
            </label>
            {props.style === 'custom' && (
                <label className="block">
                    <span className="block text-[11px] text-muted mb-1">라벨(쉼표로 구분)</span>
                    <input className={inputCls} value={props.customLabels}
                        placeholder="예: 1모둠, 2모둠, 3모둠"
                        onChange={(e) => onChange({ customLabels: e.target.value })} />
                </label>
            )}
        </div>
    );
}
