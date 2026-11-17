/**
 * 시수표 선택 열(1.2v 편성기 분해 F4) — 기본 넷(교사·반·과목·시수) 밖의 열. 그 열을 쓰는 학교만 켠다.
 *   🔴 컬렉션 바닥엔 「조각이 칸을 기여하는 자리」가 없다 — 바닥이 목록마다 쥐는 사용자 칸(`userFieldsOf`·`setUserFields`)에 얹는다.
 *   켜기 = 그 칸 정의를 목록에 더함 · 끄기 = 칸 정의를 뺌(적어 둔 값은 줄에 남는다 — 다시 켜면 보인다). 새 시수표는 선택 열 0.
 *   칸 key 는 고정 — 뒤 조각(점검·편성 입력)이 읽는다. 공동 담당·특별실은 정본 항목의 id 만 담는다(이름 저장 ⛔).
 */
import type { CollectionKit, RecordField } from '../collection/contracts/collection';

export type OptionalSlot = 'cowork' | 'room' | 'block' | 'cycle' | 'biweekly' | 'pinned';

export interface OptionalColumn {
    slot: OptionalSlot;
    key: string;
    label: string;
    /** 붙여 넣기 머리글로 인정하는 이름(공백 뺀 꼴) */
    aliases: string[];
    /** 칸 정의 — 부를 때마다 새 객체 */
    field(): RecordField;
}

/** 순서 = 표에 나타나는 열 순서. */
export const OPTIONAL_COLUMNS: readonly OptionalColumn[] = [
    {
        slot: 'cowork', key: 'f_cowork', label: '공동 담당', aliases: ['공동담당', '함께수업', '협력수업'],
        field: () => ({ key: 'f_cowork', label: '공동 담당', type: 'relation', config: { many: false },
            description: '이 수업에 함께 들어가는 둘째 교사입니다(예: 원어민 교사와 영어 전담). 칸 설정에서 교직원 명단을 고르세요.' }),
    },
    {
        slot: 'room', key: 'f_room', label: '특별실', aliases: ['특별실', '특별교실'],
        field: () => ({ key: 'f_room', label: '특별실', type: 'relation', config: { many: false },
            description: '이 수업이 쓰는 특별실입니다. 칸 설정에서 방 목록을 고르면 그 목록의 방을 고를 수 있습니다.' }),
    },
    {
        slot: 'block', key: 'f_block', label: '묶음', aliases: ['묶음', '연속수업', '연강'],
        field: () => ({ key: 'f_block', label: '묶음', type: 'text',
            description: '연속으로 붙일 시수 묶음입니다. 2 = 2시간 연속, 2,2 = 2시간씩 두 번.' }),
    },
    {
        slot: 'cycle', key: 'f_cycle', label: '진도 맞춤', aliases: ['진도맞춤', '차시순서맞춤', '순배'],
        field: () => ({ key: 'f_cycle', label: '진도 맞춤', type: 'check',
            description: '같은 교사·학년·과목의 모든 반이 1차시를 마친 뒤에 2차시를 시작하게 맞춥니다.' }),
    },
    {
        slot: 'biweekly', key: 'f_biweekly', label: '격주', aliases: ['격주'],
        field: () => ({ key: 'f_biweekly', label: '격주', type: 'check',
            description: '두 주에 한 번 들어가는 수업입니다.' }),
    },
    {
        slot: 'pinned', key: 'f_pinned', label: '고정', aliases: ['고정'],
        field: () => ({ key: 'f_pinned', label: '고정', type: 'check',
            description: '시간표를 다시 짜도 자리를 옮기지 않는 수업입니다.' }),
    },
];

export const OPTIONAL_KEYS: readonly string[] = OPTIONAL_COLUMNS.map((c) => c.key);

/** 이 시수표에 켜진 선택 열의 key 들(표 순서). 목록이 없거나 아무것도 안 켰으면 빈 배열. */
export function enabledOptionalKeys(kit: CollectionKit, listId: string | null): string[] {
    if (!listId) return [];
    const have = new Set(kit.userFieldsOf(listId).map((f) => f.key));
    return OPTIONAL_KEYS.filter((k) => have.has(k));
}

/** 선택 열 하나 켜고 끄기 — 선택 열은 사용자 칸 맨 뒤에 정해진 순서로 모은다. 이미 그 상태면 아무 일 없음. */
export function setOptionalColumn(kit: CollectionKit, listId: string, key: string, on: boolean): void {
    const def = OPTIONAL_COLUMNS.find((c) => c.key === key);
    if (!def) return;
    const fields = kit.userFieldsOf(listId);
    const has = fields.some((f) => f.key === key);
    if (has === on) return;
    if (!on) { kit.setUserFields(listId, fields.filter((f) => f.key !== key)); return; }
    const others = fields.filter((f) => !OPTIONAL_KEYS.includes(f.key));
    const opts = fields.filter((f) => OPTIONAL_KEYS.includes(f.key));
    const next = [...opts, def.field()].sort((a, b) => OPTIONAL_KEYS.indexOf(a.key) - OPTIONAL_KEYS.indexOf(b.key));
    kit.setUserFields(listId, [...others, ...next]);
}
