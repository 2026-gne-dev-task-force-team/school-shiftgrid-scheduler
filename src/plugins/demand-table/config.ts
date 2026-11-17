/**
 * 시수표 = 컬렉션 설정 한 장 — 목록 노드(demand-table.list) + 그 안의 수요 줄 노드(demand-table.row).
 *   🔴 저장하는 것 = 수요 줄 하나: 교사·반·과목(정본 항목 id 참조) + 주당 시수(숫자). 이름·반 구성·과목은 정본이 쥔다.
 *   ⚠️ 컬렉션 바닥이 「첫 칸 = 제목(노드 이름)」을 요구해 제목 칸 하나(메모)가 더 있다 — 기본 넷 열은 사용자 칸 넷(잠금)이다.
 *   칸 key 는 고정(f_teacher·f_class·f_subject·f_hours) — 뒤 조각(점검·편성 입력)이 읽는다.
 */
import type { CollectionConfig, RecordField } from '../collection/contracts/collection';

export const LIST_TYPE = 'demand-table.list';
export const ROW_TYPE = 'demand-table.row';

/** 기본 넷 열의 key — 순서가 곧 열 순서. */
export const BASE_COLUMN_KEYS = ['f_teacher', 'f_class', 'f_subject', 'f_hours'] as const;

/** 관계 칸이 가리킬 컬렉션(정본 꾸러미 약속으로 읽은 목록 id) — 없으면 undefined(칸 안내가 먼저 할 일을 말한다). */
export interface RelationTargets { teacher?: string; class?: string; subject?: string }

const pointAt = (id: string | undefined): { target?: { kind: 'db'; nodeId: string } } => (id ? { target: { kind: 'db', nodeId: id } } : {});

/** 새 시수표에 심는 기본 넷 열 — 부를 때마다 새 객체. 칸은 잠겨 못 지운다. 대상이 있으면 이어 두고, 없으면 안내에 먼저 할 일을 적는다. */
export const newListFields = (t: RelationTargets = {}): RecordField[] => [
    { key: 'f_teacher', label: '교사', type: 'relation', locked: true, config: { many: false, ...pointAt(t.teacher) },
        description: t.teacher ? '수업에 들어가는 교사입니다. 교직원 명단의 사람을 고릅니다.'
            : '수업에 들어가는 교사입니다. 먼저 교직원 명단을 만든 뒤, 칸 설정에서 그 명단을 고르세요.' },
    { key: 'f_class', label: '반', type: 'relation', locked: true, config: { many: false, ...pointAt(t.class) },
        description: t.class ? '수업을 하는 반입니다. 학교 정보의 학년도에 적어 둔 반을 고릅니다.'
            : '수업을 하는 반입니다. 먼저 학교 정보에서 학년도·반을 만드세요. 그다음 칸 설정에서 학년도를 고르면 됩니다.' },
    { key: 'f_subject', label: '과목', type: 'relation', locked: true, config: { many: false, ...pointAt(t.subject) },
        description: t.subject ? '가르치는 과목입니다. 과목 목록의 과목을 고릅니다.'
            : '가르치는 과목입니다. 먼저 과목 목록을 만든 뒤, 칸 설정에서 그 목록을 고르세요.' },
    { key: 'f_hours', label: '시수', type: 'number', locked: true,
        description: '일주일에 들어가는 시간 수(주당 시수)입니다.' },
];

export const DEMAND_CONFIG: CollectionConfig = {
    listType: LIST_TYPE,
    itemType: ROW_TYPE,
    // 🔴 viewId 접두사 = 플러그인 id(host 가 'demand-table.' 를 붙인다).
    viewId: 'demand-table.sheet',
    openCommandId: 'demand-table.openList',
    viewKey: 'demand-table.list',
    listLabel: '시수표',
    listIcon: 'table',
    itemIcon: 'file',
    baseFields: [
        { key: 'name', label: '메모', type: 'text', locked: true, description: '이 줄에 붙이는 자유 메모입니다(비워 둬도 됩니다).' },
    ],
    newListFields,
    description: '교사마다 어느 반에 무슨 과목을 주당 몇 시간 들어가는지 적는 표입니다.',
    unit: '줄',
    text: { startDescription: '새로 만들거나, 만들어 둔 시수표를 고르세요.', startHint: '교사·반·과목·시수 칸이 든 빈 시수표가 바로 열립니다' },
};
