/**
 * 표 노드의 속성 칸 — 오른쪽 「속성」 패널에서 표 스타일·머리 행/열·꼬리 행을 고친다(넘버스의 「표」 서식 패널 자리).
 *   🔴 칸은 표 주인(이 꾸러미)이 낸다(contributes.properties · target = TABLE_TYPE). 저장은 기존 다리(writeDoc) 그대로.
 *   표 손잡이 우클릭 메뉴와 같은 값을 만진다 — 한쪽에서 바꾸면 다른 쪽이 따라온다.
 */
import { useSyncExternalStore } from 'react';
import { Field, Segmented, Toggle } from '../../../pane-ui-system';
import type { PropertiesPaneProps } from '../../../pane-ui-system/plugin';
import type { TableStylePreset } from '../contracts/table';
import { docOf, getTableRev, subscribeTableNodes, tableNodeOf, writeDoc } from '../nodes';

const STYLES: [TableStylePreset, string][] = [['basic', '기본'], ['lined', '가로선'], ['striped', '줄무늬'], ['headed', '머리 강조']];

export function TableProps({ target }: PropertiesPaneProps) {
    useSyncExternalStore(subscribeTableNodes, getTableRev);   // 표에서 고쳐도 칸이 따라온다
    if (!tableNodeOf(target.id)) return null;
    const doc = docOf(target.id);
    const set = (patch: Partial<typeof doc>): void => writeDoc(target.id, { ...docOf(target.id), ...patch });
    const preset = doc.style ?? 'basic';
    const row = (label: string, on: boolean, onToggle: (v: boolean) => void) => (
        <Field label={label} layout="row"><Toggle checked={on} label={label} onChange={onToggle} /></Field>
    );
    return (
        <div className="flex flex-col gap-3">
            <Segmented label="표 스타일" value={preset} onChange={(p) => set({ style: p })}
                options={STYLES.map(([value, label]) => ({ value, label }))} />
            {row('머리 행', !!doc.headerRow, (v) => set({ headerRow: v }))}
            {row('머리 열', !!doc.headerCol, (v) => set({ headerCol: v }))}
            {row('열 머리(A·B·C…) 늘 보이기', !!doc.colTabs, (v) => set({ colTabs: v }))}
            {row('꼬리 행', !!doc.footerRow, (v) => set({ footerRow: v }))}
            <p className="text-small text-muted select-none">행 {doc.rows.length} · 열 {doc.cols.length}</p>
        </div>
    );
}
