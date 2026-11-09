/**
 * 방 노드의 속성 칸 — 오른쪽 「속성」 패널에서 이름·메모를 본다/고친다.
 *   🔴 칸 자리는 속성 패널이 주고, 칸은 방 주인(이 꾸러미)이 낸다(contributes.properties · target = ROOM_TYPE).
 *   고치기는 기존 다리(updateRoom) 그대로 — 새 저장 길 없음.
 */
import { useSyncExternalStore } from 'react';
import { PropertyField } from '../../../pane-ui-system';
import type { PropertiesPaneProps } from '../../../pane-ui-system/plugin';
import { roomOf, updateRoom, parentNameOf, subscribeNodes, getRoomNodes } from '../nodes';

export function RoomProps({ target }: PropertiesPaneProps) {
    useSyncExternalStore(subscribeNodes, getRoomNodes);   // 표에서 고쳐도 칸이 따라온다
    const it = roomOf(target.id);
    if (!it) return null;
    return (
        <div className="flex flex-col gap-2">
            <PropertyField label="이름" value={it.name} onCommit={(v) => { if (v.trim()) updateRoom(it.id, { name: v.trim() }); }} />
            <PropertyField label="메모" value={it.memo ?? ''} multiline onCommit={(v) => updateRoom(it.id, { memo: v })} />
            <PropertyField label="목록" value={parentNameOf(it.id) ?? ''} />
        </div>
    );
}
