/**
 * 사람 노드의 속성 칸 — 기본 칸(이름·메모) + 명단의 사용자 칸을 PropertyList 한 줄로. 표와 같은 Cell 이라 고르기·날짜도 여기서 고친다.
 *   🔴 칸 자리는 속성 패널이 주고, 칸은 사람 주인(이 꾸러미)이 낸다(contributes.properties · target = PERSON_TYPE).
 *   고치기는 기존 다리(updatePerson·setCol) 그대로 — 새 저장 길 없음.
 */
import { useSyncExternalStore } from 'react';
import type { PropertiesPaneProps } from '../../../pane-ui-system/plugin';
import type { RecordViewApi, RecordField, RecordCellValue } from '../../collection/contracts/collection';
import { personOf, updatePerson, parentNameOf, subscribeNodes, getPersonNodes, listFieldsOf, setListFields, colsOf, setCol } from '../nodes';
import { PERSON_BASE_FIELDS } from '../fields';

const LIST_FIELD: RecordField = { key: '_list', label: '명단', type: 'text', readOnly: true, locked: true };

export function PersonProps({ host, target }: PropertiesPaneProps) {
    useSyncExternalStore(subscribeNodes, getPersonNodes);   // 표에서 고쳐도 칸이 따라온다
    const rv = host.modules.use<RecordViewApi>('collection');
    const it = personOf(target.id);
    if (!it || !rv) return null;
    const userFields = listFieldsOf(it.listId) as RecordField[];
    const values = { name: it.name, memo: it.memo ?? '', _list: parentNameOf(it.id) ?? '', ...colsOf(it.id) } as Record<string, RecordCellValue>;
    const onChange = (key: string, v: RecordCellValue) => {
        if (key === 'name') { const n = String(v ?? '').trim(); if (n) updatePerson(it.id, { name: n }); }
        else if (key === 'memo') updatePerson(it.id, { memo: String(v ?? '') });
        else setCol(it.id, key, v);
    };
    return (
        <rv.PropertyList
            fields={[...PERSON_BASE_FIELDS, ...userFields, LIST_FIELD]}
            values={values}
            onChange={onChange}
            onOptionsChange={(key, options) => setListFields(it.listId, userFields.map((f) => (f.key === key ? { ...f, options } : f)))}
        />
    );
}
