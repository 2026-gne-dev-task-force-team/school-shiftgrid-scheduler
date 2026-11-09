/**
 * 방 노드의 속성 칸 — 기본 칸(이름·메모) + 목록의 사용자 칸을 PropertyList 한 줄로. 표와 같은 Cell 이라 고르기·날짜도 여기서 고친다.
 *   🔴 칸 자리는 속성 패널이 주고, 칸은 방 주인(이 꾸러미)이 낸다(contributes.properties · target = ROOM_TYPE).
 *   고치기는 기존 다리(updateRoom·setCol) 그대로 · 부모 방은 보기 전용(트리 갈아타기는 표에서).
 */
import { useSyncExternalStore } from 'react';
import type { PropertiesPaneProps } from '../../../pane-ui-system/plugin';
import type { RecordViewApi, RecordField, RecordCellValue } from '../../collection/contracts/collection';
import { roomOf, updateRoom, parentNameOf, subscribeNodes, getRoomNodes, listFieldsOf, setListFields, colsOf, setCol } from '../nodes';
import { ROOM_BASE_FIELDS } from '../fields';

const LIST_FIELD: RecordField = { key: '_list', label: '목록', type: 'text', readOnly: true, locked: true };
const PARENT_FIELD: RecordField = { key: '_parent', label: '부모 방', type: 'text', readOnly: true, locked: true };

export function RoomProps({ host, target }: PropertiesPaneProps) {
    useSyncExternalStore(subscribeNodes, getRoomNodes);   // 표에서 고쳐도 칸이 따라온다
    const rv = host.modules.use<RecordViewApi>('collection');
    const it = roomOf(target.id);
    if (!it || !rv) return null;
    const userFields = listFieldsOf(it.listId) as RecordField[];
    const values = {
        name: it.name, memo: it.memo ?? '', _list: parentNameOf(it.id) ?? '',
        _parent: (it.parentId && roomOf(it.parentId)?.name) || '', ...colsOf(it.id),
    } as Record<string, RecordCellValue>;
    const onChange = (key: string, v: RecordCellValue) => {
        if (key === 'name') { const n = String(v ?? '').trim(); if (n) updateRoom(it.id, { name: n }); }
        else if (key === 'memo') updateRoom(it.id, { memo: String(v ?? '') });
        else setCol(it.id, key, v);
    };
    return (
        <rv.PropertyList
            fields={[...ROOM_BASE_FIELDS, ...userFields, LIST_FIELD, PARENT_FIELD]}
            values={values}
            onChange={onChange}
            onOptionsChange={(key, options) => setListFields(it.listId, userFields.map((f) => (f.key === key ? { ...f, options } : f)))}
        />
    );
}
