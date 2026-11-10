/**
 * 방 목록 = 컬렉션 설정 한 장 — 목록 노드(rooms.list) + 그 안의 방 노드(rooms.room) + 기본 칸 둘(이름·메모) + 트리(방 안에 방).
 *   다리·화면·속성 패널·붙여 넣기·들여/내어쓰기는 컬렉션 바닥(collection 꾸러미 defineCollection)이 한 벌로 낸다 — 이 꾸러미는 이 설정만 쥔다.
 *   ⛔ 예약·수용 수 같은 쓰임새는 없다(요구명세: 위층이 증축한다).
 */
import type { CollectionConfig } from '../collection/contracts/collection';

export const LIST_TYPE = 'rooms.list';
export const ROOM_TYPE = 'rooms.room';

export const ROOM_CONFIG: CollectionConfig = {
    listType: LIST_TYPE,
    itemType: ROOM_TYPE,
    // 🔴 viewId 접두사 = 플러그인 id(host 가 'rooms.' 를 붙인다). 목록을 열면 여는 방 목록 화면.
    viewId: 'rooms.sheet',
    openCommandId: 'rooms.openList',
    viewKey: 'rooms.list',
    listLabel: '방 목록',
    listIcon: 'door',
    itemIcon: 'door',
    // 기본 칸 — 지우기·타입 바꾸기 금지(locked). 첫 칸이 제목(노드 이름).
    baseFields: [
        { key: 'name', label: '이름', type: 'text', locked: true, description: '이 방을 가리키는 이름입니다. 탐색기 줄 이름과 같습니다.' },
        { key: 'memo', label: '메모', type: 'text', locked: true, description: '이 방에 대한 자유 메모입니다.' },
    ],
    description: '교실·특별실 같은 방을 모아 두는 목록입니다. 방 안에 방을 들여쓰기로 넣을 수 있고, 시간표·방 예약에서 방을 고를 때 여기서 고릅니다.',
    unit: '개',
    text: { startDescription: '새로 만들거나, 만들어 둔 방 목록을 고르세요.', startHint: '빈 목록이 바로 열립니다' },
    // 🔴 방 안에 방 — 부모는 노드 부모가 아니라 data.parentId 칸(부모를 지워도 자식은 최상위로 — effectiveParentId)
    tree: { parentLabel: '부모 방' },
};
