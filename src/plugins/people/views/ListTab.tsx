/**
 * 명단 화면 — 한 줄 = 한 사람, 칸은 **이름·메모 둘뿐**(요구명세). 표는 직접 그리지 않고 「표 자리」(table-slot)를 거친다.
 *   🔴 데이터는 노드 다리(nodes.ts)에서만 — 명단·사람은 노드고 저장·휴지통은 노드 시스템이 쥔다.
 *   지우기 = 휴지통 · 순서 바꾸기 · 붙여 넣기(엑셀·한글 표) 는 전부 다리의 조작으로 내려간다.
 *   ⛔ 뽑기·조 나누기 같은 쓰임새는 없다(요구명세: *"기능은 아직 없다. 명단만 관리"*).
 *
 * 🔴 표 갈아끼우기 자리(지금 구현 ⛔): 나중에 host.modules 에 표 편집기 모듈이 오면 여기서 그걸 쓰고, 없으면 SimpleTable 로 떨어진다.
 *    아직 그 약속이 없어 분기를 안 만든다(간이 표 하나) — table-slot.tsx 머리의 「요구서」가 그 세션에 건넬 꼴이다.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { Icon } from '../../../pane-ui-system';
import { useActiveList, setActiveList } from '../store';
import { subscribeNodes, getListNodes, inTrash, peopleIn, addPerson, updatePerson, removePerson, nudgePerson, pastePeople } from '../nodes';
import { TableSlot, type TableColumn, type TableRow } from './table-slot';
import type { TableApi } from '../../table-editor/contracts/table';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import { StartScreen } from './StartScreen';

const COLUMNS: TableColumn[] = [
    { key: 'name', title: '이름' },
    { key: 'memo', title: '메모' },
];

export function ListTab({ host }: { host?: PluginHost }) {
    // 표 편집기가 켜져 있으면 그 표로(supports: table) — 없으면 간이 표
    const table = host?.modules.use<TableApi>('table') ?? null;
    const activeId = useActiveList();
    // 노드가 바뀔 때만 다시 그린다(명단 이름·사람 줄). 스냅샷은 recompute 때만 새 배열이 된다.
    const listNodes = useSyncExternalStore(subscribeNodes, getListNodes, getListNodes);

    const list = useMemo(() => listNodes.find((n) => n.id === activeId) ?? null, [listNodes, activeId]);
    const rows = useMemo<TableRow[]>(() => {
        if (!activeId) return [];
        return peopleIn(activeId).map((p) => ({ id: p.id, cells: { name: p.name, memo: p.memo ?? '' } }));
        // peopleIn 은 매 호출 새로 읽지만, 이 useMemo 는 listNodes(= 노드 스냅샷)·activeId 가 바뀔 때만 돈다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [listNodes, activeId]);

    // 보고 있는 명단이 없으면(리본으로 처음 열기 · 휴지통으로 감) 시작 화면 — 새로 만들기 + 목록.
    if (!activeId || !list || inTrash(activeId)) return <StartScreen />;

    const btn = 'flex items-center gap-1 h-btn px-2 rounded border border-line text-[12px] text-muted hover:text-text hover:bg-text/[0.04] disabled:opacity-40 disabled:hover:bg-transparent';

    return (
        <div className="h-full flex flex-col overflow-auto select-none">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
                <button type="button" className={btn} title="명단 목록" onClick={() => { setActiveList(null); }}>
                    <Icon name="left" size={12} /> 목록
                </button>
                <Icon name="users" size={15} className="text-muted" />
                <span className="font-medium text-text truncate">{list.name}</span>
                <span className="text-[12px] text-muted tabular-nums">· {rows.length}명</span>
            </div>
            <TableSlot
                table={table}
                columns={COLUMNS}
                rows={rows}
                onCellChange={(rowId, key, value) => {
                    if (key === 'name') updatePerson(rowId, { name: value });
                    else if (key === 'memo') updatePerson(rowId, { memo: value });
                }}
                onAddRow={() => addPerson(activeId, { name: '' })}
                onDeleteRow={(rowId) => removePerson(rowId)}
                onMoveRow={(rowId, dir) => nudgePerson(rowId, dir)}
                onPaste={(text) => pastePeople(activeId, text)}
                emptyHint="아직 아무도 없다. 「줄 추가」로 더하거나 엑셀·한글 표를 붙여 넣는다(첫 칸 이름·둘째 칸 메모)."
            />
        </div>
    );
}
