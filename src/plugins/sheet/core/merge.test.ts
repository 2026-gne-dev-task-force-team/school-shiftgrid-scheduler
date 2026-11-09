/**
 * 병합 기하 검산 — buildMergeMap(앵커·덮임) · regionFromSelection · anchorCovering.
 *   🔴 병합이 M2 버그심기 검산 대상이라, 겹침·앵커 소실·span 자르기를 여기서 못 박는다.
 */
import { describe, expect, it } from 'vitest';
import { buildMergeMap, regionFromSelection, anchorCovering } from './merge';
import type { MergeRegion, TableColumn, TableRow } from '../contracts/table';

const cols: TableColumn[] = [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }, { key: 'c', title: 'C' }];
const rows: TableRow[] = [
    { id: 'r0', cells: {} }, { id: 'r1', cells: {} }, { id: 'r2', cells: {} },
];

describe('buildMergeMap', () => {
    it('병합 없으면 빈 맵', () => {
        const m = buildMergeMap(undefined, rows, cols);
        expect(m.anchors.size).toBe(0);
        expect(m.covered.size).toBe(0);
    });

    it('2×2 병합: 앵커 하나 + 덮인 칸 셋', () => {
        const merges: MergeRegion[] = [{ rowId: 'r0', key: 'a', rowSpan: 2, colSpan: 2 }];
        const m = buildMergeMap(merges, rows, cols);
        expect(m.anchors.get('0:0')).toEqual({ rowSpan: 2, colSpan: 2 });
        expect([...m.covered].sort()).toEqual(['0:1', '1:0', '1:1']);
    });

    it('앵커가 사라진 병합은 무시한다', () => {
        const merges: MergeRegion[] = [{ rowId: 'gone', key: 'a', rowSpan: 2, colSpan: 2 }];
        expect(buildMergeMap(merges, rows, cols).anchors.size).toBe(0);
    });

    it('span 이 표 밖으로 넘치면 잘라 준다(행 3개인데 rowSpan 9)', () => {
        const merges: MergeRegion[] = [{ rowId: 'r1', key: 'b', rowSpan: 9, colSpan: 9 }];
        const m = buildMergeMap(merges, rows, cols);
        // r1 부터 2행(r1,r2) · b 부터 2열(b,c).
        expect(m.anchors.get('1:1')).toEqual({ rowSpan: 2, colSpan: 2 });
    });

    it('🔴 겹치는 두 병합은 먼저 온 것이 이긴다', () => {
        const merges: MergeRegion[] = [
            { rowId: 'r0', key: 'a', rowSpan: 2, colSpan: 2 },   // 0:0..1:1
            { rowId: 'r1', key: 'b', rowSpan: 2, colSpan: 2 },   // 1:1.. 겹친다 → 버려진다
        ];
        const m = buildMergeMap(merges, rows, cols);
        expect(m.anchors.size).toBe(1);
        expect(m.anchors.has('0:0')).toBe(true);
        expect(m.anchors.has('1:1')).toBe(false);
    });

    it('1×1 은 병합이 아니라 무시', () => {
        expect(buildMergeMap([{ rowId: 'r0', key: 'a', rowSpan: 1, colSpan: 1 }], rows, cols).anchors.size).toBe(0);
    });
});

describe('regionFromSelection', () => {
    it('범위 → 앵커(좌상단) + span', () => {
        const r = regionFromSelection({ r1: 0, r2: 1, c1: 1, c2: 2 }, rows, cols);
        expect(r).toEqual({ rowId: 'r0', key: 'b', rowSpan: 2, colSpan: 2 });
    });
    it('한 칸이면 null(병합할 게 없다)', () => {
        expect(regionFromSelection({ r1: 1, r2: 1, c1: 1, c2: 1 }, rows, cols)).toBeNull();
    });
    it('범위가 표 끝을 넘으면 잘라서 앵커를 잡는다', () => {
        const r = regionFromSelection({ r1: 2, r2: 5, c1: 2, c2: 5 }, rows, cols);
        expect(r).toBeNull();   // r2..r2·c2..c2 한 칸으로 잘려 병합 아님
    });
});

describe('anchorCovering', () => {
    const merges: MergeRegion[] = [{ rowId: 'r0', key: 'a', rowSpan: 2, colSpan: 2 }];
    it('덮인 칸을 눌러도 앵커를 찾는다', () => {
        expect(anchorCovering(merges, 1, 1, rows, cols)).toEqual(merges[0]);
    });
    it('병합 밖이면 null', () => {
        expect(anchorCovering(merges, 2, 2, rows, cols)).toBeNull();
    });
});
