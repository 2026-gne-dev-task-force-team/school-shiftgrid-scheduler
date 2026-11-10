/**
 * 롤업 칸(rollup) — 이 목록의 관계 칸 하나를 따라가 대상 줄의 한 칸을 모아 보인다(원래 값 나열 · 개수 · 합). 노션 롤업.
 *   🔴 값은 저장하지 않는다 — 그릴 때 계산(읽기 전용). 따라가는 길은 resolveRelationTargets(follow.ts)라 반을 넣은 칸도 방의 값을 읽는다.
 *   형제 칸 목록(fields)을 Cell·Config 가 받는다 — 어느 관계 칸을 어느 대상으로 따라갈지 칸 설정만으로 정해진다.
 */
import { useSyncExternalStore } from 'react';
import { Field, Pill, Select } from '../../../pane-ui-system';
import type { FieldCellProps, RecordField } from '../contracts/collection';
import { getDbRev, getNodesApi, subscribeDb } from '../nodes';
import { TITLE_KEY, rollupConfig, rollupOf, targetFields, type RollupHow } from './follow';

const HOW: { value: RollupHow; label: string }[] = [
    { value: 'list', label: '원래 값 나열' }, { value: 'count', label: '개수' }, { value: 'sum', label: '합' },
];
const relationFieldsOf = (fields: readonly RecordField[] | undefined) =>
    (fields ?? []).filter((f) => f.type === 'relation' && (f.config as { target?: { kind?: string } } | undefined)?.target?.kind === 'db');

export function RollupCell({ row, config, fields }: FieldCellProps) {
    useSyncExternalStore(subscribeDb, getDbRev);   // 대상 줄이 바뀌면 다시 계산한다
    const look = getNodesApi();
    const r = look ? rollupOf(look, fields ?? [], row, config) : { texts: [], count: 0, sum: 0 };
    const how = rollupConfig(config).how;
    return (
        <div data-rv-cell="rollup" data-rv-rollup className="w-full h-full flex items-center gap-1 px-2 overflow-hidden">
            {how === 'count' ? <span className="text-body text-text">{r.count}</span>
                : how === 'sum' ? <span className="text-body text-text">{r.sum}</span>
                : r.texts.length === 0 ? <span className="text-small text-muted">—</span>
                : r.texts.map((t, i) => <Pill key={i} color="gray">{t}</Pill>)}
        </div>
    );
}

export function RollupConfigEditor({ field, onChange, fields }: { field: RecordField; onChange: (f: RecordField) => void; fields?: RecordField[] }) {
    useSyncExternalStore(subscribeDb, getDbRev);
    const cfg = rollupConfig(field.config);
    const rels = relationFieldsOf(fields);
    const rel = rels.find((f) => f.key === cfg.relationKey);
    const t = (rel?.config as { target?: { nodeId?: string } } | undefined)?.target;
    const cols = t?.nodeId ? targetFields(getNodesApi(), t.nodeId) : [];
    const set = (patch: Partial<typeof cfg>) => onChange({ ...field, config: { ...cfg, ...patch } });
    return (
        <div className="flex flex-col gap-1.5 px-2 py-1" data-rv-rollup-config={field.key}>
            <Field label="따라갈 관계 칸">
                <Select value={cfg.relationKey ?? ''} data-rv-rollup-relation
                    onChange={(e) => set({ relationKey: e.target.value || undefined, targetKey: TITLE_KEY })}
                    options={[{ value: '', label: '— 고르기 —' }, ...rels.map((f) => ({ value: f.key, label: f.label }))]} />
            </Field>
            <Field label="대상의 칸">
                <Select value={cfg.targetKey ?? TITLE_KEY} data-rv-rollup-target
                    onChange={(e) => set({ targetKey: e.target.value })}
                    options={cols.map((c) => ({ value: c.key, label: c.label }))} />
            </Field>
            <Field label="모으기">
                <Select value={cfg.how} data-rv-rollup-how onChange={(e) => set({ how: e.target.value as RollupHow })} options={HOW} />
            </Field>
        </div>
    );
}
