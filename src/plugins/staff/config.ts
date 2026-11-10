/**
 * 교직원 명단 = 컬렉션 설정 한 장 — 목록 노드(staff.list) + 그 안의 교직원 노드(staff.member).
 *   기본 칸(잠금)은 이름 하나 · 나머지는 새 명단에 심는 칸(substitute 와 같은 방식 — 메모를 끝으로 보내 칸 순서를 맞춘다).
 *   칸 순서 = 이름 · 구분 · 티어 · 담당 학년 · 담당 과목 · 담임 반 · 사람 · 메모.
 *   🔴 구분 value 는 보결 명단(substitute)과 똑같다 — 나중에 보결 명단을 이 명단으로 갈아 낄 때 값 이사가 없게.
 *   ⛔ 사람(people) 명단과는 별개 컬렉션 — 「사람」 칸으로 사람 명단의 사람을 **선택적으로** 가리킬 뿐이다.
 */
import type { CollectionConfig, RecordField } from '../collection/contracts/collection';

export const LIST_TYPE = 'staff.list';
export const MEMBER_TYPE = 'staff.member';

/** 새 명단에 심는 칸 — 부를 때마다 새 객체(명단끼리 공유하지 않게). locked = 칸 지우기·타입 바꾸기 금지(이름표·선택지는 고친다). */
export const newListFields = (): RecordField[] => [
    {
        key: 'f_kind', label: '구분', type: 'select', locked: true,
        description: '이 선생님·직원이 어떤 일을 맡는지 가르는 구분입니다. 선택지는 이 명단 안에서 고치거나 더할 수 있습니다.',
        options: [
            { value: 'homeroom', label: '담임', color: 'blue' },
            { value: 'subject', label: '전담', color: 'green' },
            { value: 'nonteaching', label: '비교과', color: 'orange' },
            { value: 'assistant', label: '보조인력', color: 'gray' },
        ],
    },
    {
        key: 'f_tier', label: '티어', type: 'select',
        description: '보직 부장은 1, 일반 선생님은 2, 지원인력은 3으로 나눕니다. 선택지는 고칠 수 있습니다.',
        options: [
            { value: '1', label: '1 보직(부장)', color: 'red' },
            { value: '2', label: '2 일반', color: 'blue' },
            { value: '3', label: '3 지원인력', color: 'gray' },
        ],
    },
    {
        key: 'f_grades', label: '담당 학년', type: 'multi',
        description: '맡은 학년입니다. 여러 학년을 고를 수 있습니다.',
        options: [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n}학년` })),
    },
    {
        key: 'f_subjects', label: '담당 과목', type: 'relation', config: { many: true },
        description: '맡은 과목입니다. 칸 설정에서 과목 목록을 고르면 그 목록의 과목을 여럿 고를 수 있습니다.',
    },
    {
        key: 'f_homeroom', label: '담임 반', type: 'relation',
        description: '담임을 맡은 반입니다. 칸 설정에서 학년도를 고르면 그 학년도의 반을 고를 수 있습니다.',
    },
    {
        key: 'f_person', label: '사람', type: 'relation',
        description: '사람 명단의 같은 사람을 가리킵니다. 칸 설정에서 사람 명단을 고릅니다. 비워 둬도 됩니다.',
    },
    { key: 'memo', label: '메모', type: 'text', locked: true, description: '이 선생님·직원에 대한 자유 메모입니다.' },
];

export const STAFF_CONFIG: CollectionConfig = {
    listType: LIST_TYPE,
    itemType: MEMBER_TYPE,
    // 🔴 viewId 접두사 = 플러그인 id(host 가 'staff.' 를 붙인다).
    viewId: 'staff.sheet',
    openCommandId: 'staff.openList',
    viewKey: 'staff.list',
    listLabel: '교직원 명단',
    listIcon: 'shieldCheck',
    itemIcon: 'user',
    baseFields: [
        { key: 'name', label: '이름', type: 'text', locked: true, description: '명단에서 이 선생님·직원을 가리키는 이름입니다. 탐색기 줄 이름과 같습니다.' },
    ],
    newListFields,
    description: '학교 교원·직원을 모아 두는 명단입니다. 구분·학년·과목·담임 반을 적어 둡니다.',
    unit: '명',
    text: { startDescription: '새로 만들거나, 만들어 둔 교직원 명단을 고르세요.', startHint: '이름·구분·티어·학년·과목·담임 반·사람·메모 칸이 든 빈 명단이 바로 열립니다' },
};
