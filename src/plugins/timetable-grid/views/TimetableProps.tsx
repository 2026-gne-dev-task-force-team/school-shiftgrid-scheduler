/**
 * 시간표 노드의 속성 칸 — 오른쪽 「속성」 패널에서 이 시간표의 설정을 고친다(Q4 T4).
 *   범위(언제 적용되나) · 열 꼴·개수 · 그리드에 보일 시각 · 통째 복사. 칸은 시간표 주인(이 꾸러미)이 낸다(contributes.properties).
 *   저장은 화면과 같은 길(applyEdit) — 되돌리기 더미를 같이 쓴다.
 */
import { useSyncExternalStore } from 'react';
import { Button, DateField, Select, TextInput, Toggle } from '../../../pane-ui-system';
import type { PropertiesPaneProps } from '../../../pane-ui-system/plugin';
import { subscribeNodes, getSheetNodes, isSheet, sheetDataOf, applyEdit, duplicateSheet } from '../nodes';
import {
    columnCount, addColumn, removeColumn, toggleColumnKind, toggleRangeKind, setRangeSpec, setView, viewRange,
} from '../model';

const HOURS = Array.from({ length: 25 }, (_, h) => ({ value: String(h * 60), label: `${String(h).padStart(2, '0')}:00` }));

export function TimetableProps({ target }: PropertiesPaneProps) {
    useSyncExternalStore(subscribeNodes, getSheetNodes, getSheetNodes);   // 화면에서 고쳐도 칸이 따라온다
    if (!isSheet(target.id)) return null;
    const data = sheetDataOf(target.id);
    const edit = (fn: Parameters<typeof applyEdit>[1]) => applyEdit(target.id, fn);
    const view = viewRange(data);
    const row = (label: string, body: React.ReactNode) => (
        <div className="flex items-center justify-between gap-2 text-body text-text">
            <span className="shrink-0 text-muted">{label}</span>
            <div className="flex min-w-0 items-center gap-1">{body}</div>
        </div>
    );
    const field = 'rounded border border-line bg-bg px-1 py-0.5 text-text outline-none focus:border-accent';
    return (
        <div className="flex flex-col gap-3">
            {row('범위', <Button size="sm" onClick={() => edit((d) => toggleRangeKind(d))}>{data.range.kind === 'period' ? '기간' : 'N회'}</Button>)}
            {data.range.kind === 'period' ? (
                <div className="flex items-center justify-end gap-1 text-small text-muted">
                    <DateField value={data.range.start} className={field}
                        onChange={(v) => edit((d) => setRangeSpec(d, { kind: 'period', start: v, end: d.range.kind === 'period' ? d.range.end : '' }))} />
                    <span>~</span>
                    <DateField value={data.range.end} openAt={data.range.start} className={field}
                        onChange={(v) => edit((d) => setRangeSpec(d, { kind: 'period', start: d.range.kind === 'period' ? d.range.start : '', end: v }))} />
                </div>
            ) : row('반복 횟수', (
                <TextInput type="number" min={1} className="w-16" value={data.range.count}
                    onChange={(e) => edit((d) => setRangeSpec(d, { kind: 'repeat', count: Math.max(1, Number(e.target.value) || 1) }))} />
            ))}
            {row('열 꼴', <Button size="sm" onClick={() => edit((d) => toggleColumnKind(d))}>{data.columns.kind === 'weekday' ? '요일' : '일차'}</Button>)}
            {row(`열 ${columnCount(data.columns)}개`, <>
                <Button size="sm" aria-label="열 빼기" disabled={columnCount(data.columns) <= 1} onClick={() => edit((d) => removeColumn(d, columnCount(d.columns) - 1))}>−</Button>
                <Button size="sm" aria-label="열 넣기" disabled={addColumn(data) === data} onClick={() => edit((d) => addColumn(d))}>+</Button>
            </>)}
            {row('보이는 시각 자동', <Toggle on={!data.view} label="보이는 시각 자동"
                onToggle={(auto) => edit((d) => setView(d, auto ? null : viewRange(d)))} />)}
            {data.view && row('시각', <>
                <Select aria-label="보이는 시작" value={String(Math.floor(view.start / 60) * 60)} options={HOURS.slice(0, 24)}
                    onChange={(e) => edit((d) => setView(d, { start: Number(e.target.value), end: viewRange(d).end }))} />
                <span className="text-muted">~</span>
                <Select aria-label="보이는 끝" value={String(Math.ceil(view.end / 60) * 60)} options={HOURS.slice(1)}
                    onChange={(e) => edit((d) => setView(d, { start: viewRange(d).start, end: Number(e.target.value) }))} />
            </>)}
            <Button size="sm" className="self-start whitespace-nowrap" onClick={() => { duplicateSheet(target.id); }}>시간표 복사</Button>
        </div>
    );
}
