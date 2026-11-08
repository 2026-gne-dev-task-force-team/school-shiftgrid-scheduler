/**
 * 병합 기하(M2 merge) — 병합 영역 목록 + 지금 행·열에서 「어느 칸이 앵커(span 얼마)·어느 칸이 덮여 숨나」를 푼다.
 *   🔴 순수 함수 — React 밖에서 테스트로 못 박는다(병합이 버그심기 검산 대상이다).
 *   앵커는 데이터(rowId·key) 기준이고 span 은 「앵커 아래 뷰 N행·오른쪽 N열」이다.
 *   겹치는 병합은 먼저 온 것이 이긴다(뒤 것은 버린다 — 「조용히 둘 다」로 깨지지 않게).
 */
import type { MergeRegion, TableColumn, TableRow } from '../contracts/table';

export interface MergeSpan { rowSpan: number; colSpan: number }

export interface MergeMap {
    /** `${viewRow}:${colIndex}` → span. 이 자리는 rowSpan/colSpan 으로 그린다. */
    anchors: Map<string, MergeSpan>;
    /** 덮여서 안 그리는 자리(`${viewRow}:${colIndex}`). */
    covered: Set<string>;
}

const key = (r: number, c: number): string => `${r}:${c}`;

/** 병합 목록 → 앵커/덮임 맵. 앵커가 사라졌거나 span 1×1 이면 무시, 겹치면 먼저 온 것만. */
export function buildMergeMap(
    merges: MergeRegion[] | undefined,
    rows: TableRow[],
    columns: TableColumn[],
): MergeMap {
    const anchors = new Map<string, MergeSpan>();
    const covered = new Set<string>();
    if (!merges || merges.length === 0) return { anchors, covered };

    const rowIndex = new Map<string, number>(rows.map((row, i) => [row.id, i]));
    const colIndex = new Map<string, number>(columns.map((col, i) => [col.key, i]));

    for (const m of merges) {
        const r0 = rowIndex.get(m.rowId);
        const c0 = colIndex.get(m.key);
        if (r0 == null || c0 == null) continue;                       // 앵커가 사라졌다 — 병합 무효
        const rowSpan = Math.max(1, Math.min(m.rowSpan, rows.length - r0));
        const colSpan = Math.max(1, Math.min(m.colSpan, columns.length - c0));
        if (rowSpan === 1 && colSpan === 1) continue;

        // 겹침 검사 — 덮을 칸 중 하나라도 이미 앵커/덮임이면 이 병합은 버린다(먼저 온 것이 이긴다).
        let clash = false;
        for (let rr: number = r0; rr < r0 + rowSpan && !clash; rr++) {
            for (let cc: number = c0; cc < c0 + colSpan; cc++) {
                if (anchors.has(key(rr, cc)) || covered.has(key(rr, cc))) { clash = true; break; }
            }
        }
        if (clash) continue;

        anchors.set(key(r0, c0), { rowSpan, colSpan });
        for (let rr: number = r0; rr < r0 + rowSpan; rr++) {
            for (let cc: number = c0; cc < c0 + colSpan; cc++) {
                if (rr === r0 && cc === c0) continue;
                covered.add(key(rr, cc));
            }
        }
    }
    return { anchors, covered };
}

/** 선택 범위(뷰 좌표) → 병합 영역 하나. 범위가 한 칸이면 null(병합할 게 없다). */
export function regionFromSelection(
    sel: { r1: number; r2: number; c1: number; c2: number },
    rows: TableRow[],
    columns: TableColumn[],
): MergeRegion | null {
    const r1 = Math.max(0, sel.r1);
    const c1 = Math.max(0, sel.c1);
    const r2 = Math.min(rows.length - 1, sel.r2);
    const c2 = Math.min(columns.length - 1, sel.c2);
    if (r2 < r1 || c2 < c1) return null;
    if (r1 === r2 && c1 === c2) return null;                           // 한 칸은 병합 아님
    const anchor = rows[r1];
    const col = columns[c1];
    if (!anchor || !col) return null;
    return { rowId: anchor.id, key: col.key, rowSpan: r2 - r1 + 1, colSpan: c2 - c1 + 1 };
}

/** (뷰 r,c) 를 덮는 병합 앵커를 찾는다 — 병합 해제가 쓴다(덮인 칸을 눌러도 앵커를 푼다). */
export function anchorCovering(
    merges: MergeRegion[] | undefined,
    r: number,
    c: number,
    rows: TableRow[],
    columns: TableColumn[],
): MergeRegion | null {
    if (!merges) return null;
    const rowIndex = new Map<string, number>(rows.map((row, i) => [row.id, i]));
    const colIndex = new Map<string, number>(columns.map((col, i) => [col.key, i]));
    for (const m of merges) {
        const r0 = rowIndex.get(m.rowId);
        const c0 = colIndex.get(m.key);
        if (r0 == null || c0 == null) continue;
        if (r >= r0 && r < r0 + m.rowSpan && c >= c0 && c < c0 + m.colSpan) return m;
    }
    return null;
}
