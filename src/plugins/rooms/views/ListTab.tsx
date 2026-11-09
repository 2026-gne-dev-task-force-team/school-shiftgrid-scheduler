/**
 * 방 목록 화면 — 한 줄 = 한 방, 칸은 **이름·메모 둘뿐**(요구명세). 표는 직접 그리지 않고 「표 자리」(table-slot)를 거친다.
 *   🔴 데이터는 노드 다리(nodes.ts)에서만 — 목록·방은 노드고 저장·휴지통은 노드 시스템이 쥔다.
 *   지우기 = 휴지통 · 순서 바꾸기 · 들여/내어쓰기(방 안에 방) · 붙여 넣기(엑셀·한글 표) 는 전부 다리의 조작으로 내려간다.
 *   ⛔ 예약·수용 수 같은 쓰임새는 없다(요구명세: 위층이 증축한다).
 *
 * 🔴 방 안에 방 표시 — tree.ts 가 parentId 사슬을 깊이 우선으로 펼쳐 depth 를 준다. 표는 그 depth 만큼 첫 칸을 들여쓴다(indent).
 *    부모 방을 지우면 자식은 최상위로 올라온다(effectiveParentId 가 최상위로 돌린다).
 */
import { useMemo, useSyncExternalStore } from 'react';
import { Icon, IconPicker, TitleField } from '../../../pane-ui-system';
import { useActiveList, setActiveList } from '../store';
import {
    subscribeNodes, getListNodes, inTrash, roomsIn,
    addRoom, updateRoom, removeRoom, nudgeRoom, indentRoom, outdentRoom, pasteRooms, roomOf, colsOf, setCol, listFieldsOf, setListFields, listIconOf, setListIcon, getNodesApi,
} from '../nodes';
import { buildRoomTree } from '../tree';
import { TableSlot, type TableColumn, type TableRow } from './table-slot';
import type { RecordViewApi, RecordField } from '../../record-view/contracts/record-view';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import { StartScreen } from './StartScreen';

const COLUMNS: TableColumn[] = [
    { key: 'name', title: '이름' },
    { key: 'memo', title: '메모' },
];

export function ListTab({ host }: { host?: PluginHost }) {
    // 레코드 뷰가 켜져 있으면 그 목록 화면으로(supports: record-view) — 없으면 간이 표
    const rv = host?.modules.use<RecordViewApi>('record-view') ?? null;
    const activeId = useActiveList();
    // 노드가 바뀔 때만 다시 그린다(목록 이름·방 줄). 스냅샷은 recompute 때만 새 배열이 된다.
    const listNodes = useSyncExternalStore(subscribeNodes, getListNodes, getListNodes);

    const list = useMemo(() => listNodes.find((n) => n.id === activeId) ?? null, [listNodes, activeId]);
    const rows = useMemo<TableRow[]>(() => {
        if (!activeId) return [];
        // tree.ts 가 parentId 로 「방 안에 방」을 깊이 우선 펼쳐 depth 를 준다 → 첫 칸 들여쓰기(indent).
        return buildRoomTree(roomsIn(activeId)).map(({ room, depth }) => ({
            id: room.id,
            cells: { name: room.name, memo: room.memo ?? '' },
            values: colsOf(room.id),
            indent: depth,
        }));
        // roomsIn 은 매 호출 새로 읽지만, 이 useMemo 는 listNodes(= 노드 스냅샷)·activeId 가 바뀔 때만 돈다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [listNodes, activeId]);

    // 열 = 고정(이름·메모) + 사용자 열(목록 노드 data.fields)
    const columns: TableColumn[] = activeId ? [...COLUMNS, ...(listFieldsOf(activeId) as RecordField[]).map((f) => ({ key: f.key, title: f.label, field: f }))] : COLUMNS;

    // 보고 있는 목록이 없으면(리본으로 처음 열기 · 휴지통으로 감) 시작 화면 — 새로 만들기 + 목록.
    if (!activeId || !list || inTrash(activeId)) return <StartScreen />;

    const btn = 'flex items-center gap-1 h-btn px-2 rounded border border-line text-[12px] text-muted hover:text-text hover:bg-text/[0.04] disabled:opacity-40 disabled:hover:bg-transparent';

    return (
        <div className="h-full flex flex-col overflow-auto select-none">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
                <button type="button" className={btn} title="방 목록" onClick={() => { setActiveList(null); }}>
                    <Icon name="left" size={12} /> 목록
                </button>
                {/* 아이콘·제목 — 탭 안에서 바로 바꾼다(페이지와 같은 결 · 쥔님 2026-11-09) */}
                <IconPicker icon={listIconOf(activeId)} onSetIcon={(i) => setListIcon(activeId, i)} fallback={<Icon name="door" size={15} className="text-muted" />} sizeClass="text-[16px]" />
                <TitleField value={list.name} onRename={(n) => getNodesApi()?.rename(activeId, n)} className="font-medium text-[14px] flex-1 max-w-xs" />
                <span className="text-[12px] text-muted tabular-nums">· {rows.length}개</span>
            </div>
            <TableSlot
                rv={rv}
                viewKey="rooms.list"
                columns={columns}
                rows={rows}
                onCellChange={(rowId, key, value) => {
                    if (key === 'name') updateRoom(rowId, { name: String(value ?? '') });
                    else if (key === 'memo') updateRoom(rowId, { memo: String(value ?? '') });
                    else setCol(rowId, key, value);
                }}
                onAddRow={() => addRoom(activeId, { name: '' })}
                onDeleteRow={(rowId) => removeRoom(rowId)}
                onMoveRow={(rowId, dir) => nudgeRoom(rowId, dir)}
                onIndentRow={(rowId) => indentRoom(rowId)}
                onOutdentRow={(rowId) => outdentRoom(rowId)}
                parentOf={(rowId) => roomOf(rowId)?.parentId ?? null}
                onPaste={(text) => pasteRooms(activeId, text)}
                onFieldsChange={(fields) => setListFields(activeId, fields.filter((f) => f.key !== 'name' && f.key !== 'memo'))}
                emptyHint="아직 아무 방도 없다. 「줄 추가」로 더하거나 엑셀·한글 표를 붙여 넣는다(첫 칸 이름·둘째 칸 메모). → 로 방 안에 방."
            />
        </div>
    );
}
