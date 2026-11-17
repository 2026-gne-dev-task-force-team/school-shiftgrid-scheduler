/**
 * 🔴 약속 꼴 「시간표 글자 칸 자료」 0.1.0 — 남의 조각(편성안 등)이 시간표(timetable-grid.sheet) 노드의 data 로 **넘길 수 있는** 최소 꼴(타입만 · 값 0).
 *   격자 자기 자료(TimetableData · ../types.ts)의 부분집합이다(편성안 시험이 대입으로 맞춰 본다) — 글자 칸만, 병합·칸별 시각·너비 같은 속칸은 안 넘긴다.
 *   남의 조각은 이 타입으로 만들어 NodesApi.create(…, { type: 'timetable-grid.sheet', data }) 로 넣는다(노드 약속은 기존 것).
 *   ⛔ 격자 속(types.ts)을 직접 import 하지 않는다 — 구조 검사 ⑱(약속 위치는 contracts/ 뿐). 어긋나면 편성안 시험(TimetableData 대입)이 빨강.
 */
export interface SheetTextData {
    range: { kind: 'period'; start: string; end: string };
    /** 가로 축 — 요일(1=월 … 6=토). */
    columns: { kind: 'weekday'; days: Array<1 | 2 | 3 | 4 | 5 | 6> };
    /** 세로 축 — 행마다 이름 + 시각(분: 자정부터, 끝은 포함 안 함). 서로 안 겹치게. */
    rows: Array<{ id: string; name: string; range: { start: number; end: number } }>;
    /** 칸 — 열쇠 `c{열}r{행}`(0부터) → 글자. 빈 칸은 넣지 않는다. */
    cells: Record<string, { text: string }>;
}
