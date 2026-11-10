/**
 * 달력 = 컬렉션 설정 한 장(P4b) — 저장소(calendar.store) = 컬렉션 목록 · 일정(calendar.event) = 그 레코드.
 *   기본 칸 셋: 제목(노드 이름) · 언제(날짜 범위 — 시각이 없으면 종일) · 메모. 사용자 칸은 저장소 노드 `data.fields`.
 *   ⭐ 달력 보기(월·주·…)는 이 컬렉션의 「달력 보기」고, 「표로 보기」가 컬렉션 표다(같은 레코드 · 같은 칸).
 *   🔴 노드 타입 id 는 nodes.ts 의 contributes 와 같다 — 여기가 원본.
 */
import type { CollectionConfig } from '../collection/contracts/collection';

export const STORE_TYPE = 'calendar.store';
export const EVENT_TYPE = 'calendar.event';

export const EVENT_CONFIG: CollectionConfig = {
    listType: STORE_TYPE,
    itemType: EVENT_TYPE,
    // 🔴 viewId 접두사 = 플러그인 id(host 가 'calendar.' 를 붙인다). 「표로 보기」가 여는 표 화면.
    viewId: 'calendar.table',
    openCommandId: 'calendar.openTable',
    viewKey: 'calendar.table',
    listLabel: '달력 저장소',
    listIcon: 'calendar',
    itemIcon: 'calendarEvent',
    baseFields: [
        { key: 'name', label: '제목', type: 'text', locked: true },
        { key: 'when', label: '언제', type: 'date', config: { time: true, range: true }, locked: true },
        { key: 'memo', label: '메모', type: 'text', locked: true },
    ],
    unit: '개',
    text: { startDescription: '일정을 표로 볼 달력 저장소를 고른다.', startHint: '빈 저장소가 바로 열린다' },
};
