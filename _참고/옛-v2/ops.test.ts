/**
 * 작업대 연산 시험 — 표 만들기·이름·지우기·되살리기 / 칸 / 두 창 반영.
 */
import { describe, it, expect } from 'vitest';
import * as ops from './ops';
import { cellTextOf } from './model';

describe('표 — 만들기·이름·지우기·되살리기', () => {
    it('만들면 목록에 뜨고 이름이 붙는다', () => {
        const p0 = ops.newProject();
        const { project, sheet } = ops.createSheet(p0);
        expect(project.sheets).toHaveLength(1);
        expect(ops.getSheet(project, sheet.id)?.id).toBe(sheet.id);
        // 5열(월~금) × 6줄(40분·쉼 10분) — 점심은 안 들어 있다(설계 확정: "정의 없이 시작")
        expect(sheet.rows).toHaveLength(6);
        expect(sheet.rows.every((r) => r.assignable)).toBe(true);
        expect(sheet.rows[0]).toMatchObject({ minutes: 40, gapAfter: 10 });
        expect(sheet.rows[5].gapAfter).toBe(0); // 마지막 줄 뒤엔 틈이 없다
        expect(sheet.cols).toHaveLength(5);
        expect(sheet.startTime).toBe('09:00');
    });

    it('이름을 바꾼다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const p2 = ops.renameSheet(project, sheet.id, '1-1반');
        expect(ops.getSheet(p2, sheet.id)?.name).toBe('1-1반');
    });

    it('지우면 휴지통으로 가고(영구삭제 아님), 되살리면 돌아온다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const del = ops.deleteSheet(project, sheet.id);
        expect(del.sheets).toHaveLength(0);
        expect(del.trash).toHaveLength(1);
        const back = ops.restoreSheet(del, sheet.id);
        expect(back.sheets).toHaveLength(1);
        expect(back.trash).toHaveLength(0);
    });

    it('휴지통 비우기는 되돌릴 수 없게 아주 지운다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const del = ops.deleteSheet(project, sheet.id);
        const purged = ops.purgeTrash(del, sheet.id);
        expect(purged.trash).toHaveLength(0);
        expect(ops.restoreSheet(purged, sheet.id).sheets).toHaveLength(0); // 더는 못 살린다
    });
});

describe('칸 — 글자 쓰기', () => {
    it('칸에 글자를 쓰고 지운다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const colKey = sheet.cols[0].key, rowKey = sheet.rows[0].key;
        const p2 = ops.setSheetCell(project, sheet.id, colKey, rowKey, '수학');
        expect(cellTextOf(ops.getSheet(p2, sheet.id)!.cells[`${colKey}:${rowKey}`])).toBe('수학');
        const p3 = ops.setSheetCell(p2, sheet.id, colKey, rowKey, '');
        expect(ops.getSheet(p3, sheet.id)!.cells[`${colKey}:${rowKey}`]).toBeUndefined(); // 빈 글자면 칸을 지운다
    });

    it('줄을 빼면 그 줄 칸 글자는 버린다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const colKey = sheet.cols[0].key, lastRowKey = sheet.rows[sheet.rows.length - 1].key;
        const p2 = ops.setSheetCell(project, sheet.id, colKey, lastRowKey, '마지막줄');
        const p3 = ops.removeRow(p2, sheet.id, lastRowKey);
        expect(ops.getSheet(p3, sheet.id)!.rows).toHaveLength(5);
        expect(ops.getSheet(p3, sheet.id)!.cells[`${colKey}:${lastRowKey}`]).toBeUndefined();
    });

    it('여러 칸을 한 번에 커밋한다(복붙·채우기용 setSheetCells)', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const [c0, c1] = sheet.cols.map((c) => c.key);
        const r0 = sheet.rows[0].key;
        const p2 = ops.setSheetCells(project, sheet.id, [
            { colKey: c0, rowKey: r0, text: '국어' },
            { colKey: c1, rowKey: r0, text: '수학' },
        ]);
        const s = ops.getSheet(p2, sheet.id)!;
        expect(cellTextOf(s.cells[`${c0}:${r0}`])).toBe('국어');
        expect(cellTextOf(s.cells[`${c1}:${r0}`])).toBe('수학');
    });
});

describe('🔴 같은 표를 두 창에 — 한쪽 수정이 다른 쪽에 바로 보인다', () => {
    it('두 창이 같은 표 id 를 비추고, 표를 고치면 둘 다 새 값을 읽는다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());

        // 창 A 에 열고, 좌우로 갈라 창 B 를 만든다(같은 표를 비춘다)
        let layout = ops.newLayout();
        const winA = layout.activeWindow;
        layout = ops.openInWindow(layout, winA, sheet.id);
        layout = ops.splitWindow(layout, winA, 'row');
        const winB = layout.activeWindow;
        expect(winB).not.toBe(winA);
        expect(layout.windows[winA].active).toBe(sheet.id);
        expect(layout.windows[winB].active).toBe(sheet.id);

        // 표(단일 상태)를 고친다
        const project2 = ops.setSheetCell(project, sheet.id, '1', '2', '국어');

        // 두 창 모두 같은 표에서 새 값을 읽는다 — 상태는 한 군데(Project)만 산다
        const fromA = ops.getSheet(project2, layout.windows[winA].active);
        const fromB = ops.getSheet(project2, layout.windows[winB].active);
        expect(cellTextOf(fromA!.cells['1:2'])).toBe('국어');
        expect(cellTextOf(fromB!.cells['1:2'])).toBe('국어');
        expect(fromA).toBe(fromB); // 문자 그대로 같은 표 객체를 가리킨다
    });

    it('창을 닫아도 마지막 하나는 남고, 표를 지우면 모든 창에서 탭이 닫힌다', () => {
        const { sheet } = ops.createSheet(ops.newProject());
        let layout = ops.newLayout();
        const winA = layout.activeWindow;
        layout = ops.openInWindow(layout, winA, sheet.id);
        layout = ops.splitWindow(layout, winA, 'col');
        const winB = layout.activeWindow;
        layout = ops.closePane(layout, winB);
        expect(Object.keys(layout.windows)).toHaveLength(1);
        // 마지막 하나는 못 닫는다
        const only = layout.activeWindow;
        layout = ops.closePane(layout, only);
        expect(Object.keys(layout.windows)).toHaveLength(1);
        // 표를 지우면 모든 창에서 탭이 사라진다
        layout = ops.closeSheetEverywhere(layout, sheet.id);
        expect(layout.windows[only].tabs).not.toContain(sheet.id);
    });
});
