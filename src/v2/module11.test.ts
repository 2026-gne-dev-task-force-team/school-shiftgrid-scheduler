/**
 * 모듈 1.1 — 쥔님 불편 4건 고침 검산.
 *   ① 교시를 늘리면 새 교시가 「앞 교시 끝 + 쉬는 시간」으로 이어진다(점심 낀 표에서도)
 *   ② 규칙 생성이 점심을 낀 목록을 바르게 만든다
 *   ③ 한 교시 시각을 바꾸고 「뒤 밀기」를 켜면 뒤가 따라 밀린다(끄면 그대로)
 *   ④ 줄 간격이 저장·복원된다
 *   ⑤ v1 파일을 열어도 깨지지 않는다(새 선택값은 기본으로)
 */
import { describe, it, expect } from 'vitest';
import * as ops from './ops';
import { buildSlotsByRule, extendSlots, defaultSlots } from './defaults';
import { rowHeightOf, DEFAULT_ROW_HEIGHT } from './model';
import { parseProjectFile, serializeProject } from './persist';
import { migrateV1ToV2 } from './migrate';
import { sampleDoc } from '../io/sample';
import type { Slot } from '../types/schema';

// 점심이 낀 7칸 슬롯을 만든다: 1·2·3교시 · 점심 · 4·5·6교시 (규칙 생성으로)
function lunchSlots(): Slot[] {
    return buildSlotsByRule({ start: '09:00', lessonMinutes: 40, breakMinutes: 10, periods: 6, lunchAfter: 3, lunchMinutes: 50 });
}

describe('① 교시 늘리기 — 앞 교시 끝 + 쉬는 시간으로 이어진다', () => {
    it('기본 6교시를 10으로 늘리면 7~10교시가 앞 끝에 이어진다 (09:00 부터 다시 안 센다)', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        // 기본: 09:00 40분 수업·10분 쉼 → 6교시는 13:10~13:50
        expect(sheet.spec.slots[5]).toMatchObject({ start: '13:10', end: '13:50' });

        const p2 = ops.setPeriods(project, sheet.id, 10);
        const slots = ops.getSheet(p2, sheet.id)!.spec.slots;
        expect(slots).toHaveLength(10);
        // 기존 1교시는 그대로 09:00 (09:00 부터 다시 세지 않는다)
        expect(slots[0].start).toBe('09:00');
        // 7교시는 6교시 끝(13:50) + 쉼(10) = 14:00 에서 시작
        expect(slots[6]).toMatchObject({ start: '14:00', end: '14:40' });
        expect(slots[9]).toMatchObject({ start: '16:30', end: '17:10' });
    });

    it('점심이 낀 표에서 늘려도 마지막 교시 끝에 이어진다 (점심은 그대로)', () => {
        const base = lunchSlots(); // 7칸 (점심 index 3)
        const { project, sheet } = ops.createSheet(ops.newProject());
        const withLunch = ops.updateSheetSpec(project, sheet.id, { ...sheet.spec, slots: base });
        const p2 = ops.setPeriods(withLunch, sheet.id, base.length + 2); // 9칸으로
        const slots = ops.getSheet(p2, sheet.id)!.spec.slots;

        // 점심 칸은 그대로 살아 있다
        expect(slots[3]).toMatchObject({ label: '점심', assignable: false, kind: 'lunch' });
        // 늘어난 칸은 직전 칸 끝 + 간격으로 이어진다 (09:00 부터 다시 안 센다)
        const prevEnd = slots[base.length - 1].end;
        const added = slots[base.length];
        expect(added.start > prevEnd).toBe(true);
        expect(added.start).not.toBe('09:00');
    });
});

describe('② 규칙 생성 — 점심을 낀 목록을 바르게 만든다', () => {
    it('3교시 뒤 점심이 들어가고, 점심 뒤 교시가 점심 끝 뒤로 밀린다', () => {
        const slots = buildSlotsByRule({ start: '09:00', lessonMinutes: 40, breakMinutes: 10, periods: 6, lunchAfter: 3, lunchMinutes: 50 });
        expect(slots).toHaveLength(7); // 수업 6 + 점심 1
        // 점심은 index 3 (3교시 뒤), 수업 못 넣는 칸
        expect(slots[3]).toMatchObject({ label: '점심', assignable: false, kind: 'lunch' });
        // 점심은 3교시 끝에 붙는다
        expect(slots[3].start).toBe(slots[2].end);
        // 점심 뒤 4교시는 점심 끝 뒤로 밀린다
        expect(slots[4].start > slots[3].end).toBe(true);
        // 수업 칸은 정확히 6개
        expect(slots.filter((s) => s.assignable)).toHaveLength(6);
    });

    it('점심 없음이면 교시만, 마지막 교시 뒤엔 점심을 안 넣는다', () => {
        const slots = buildSlotsByRule({ start: '09:00', lessonMinutes: 40, breakMinutes: 10, periods: 4, lunchAfter: 4, lunchMinutes: 50 });
        // lunchAfter 가 마지막 교시(4)면 그 뒤엔 안 넣는다
        expect(slots).toHaveLength(4);
        expect(slots.every((s) => s.assignable)).toBe(true);
    });
});

describe('③ 시각 편집 — 뒤 교시 밀기', () => {
    it('뒤 밀기를 켜면 끝 시각을 늘린 만큼 뒤 교시가 따라 밀린다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        // 2교시(index 1) 끝을 10:30 → 10:40 (+10)
        const p2 = ops.editSlotTime(project, sheet.id, 1, { end: '10:40' }, true);
        const slots = ops.getSheet(p2, sheet.id)!.spec.slots;
        expect(slots[1].end).toBe('10:40');
        // 3교시가 +10 따라 밀린다 (10:40 → 10:50)
        expect(slots[2].start).toBe('10:50');
        expect(slots[2].end).toBe('11:30');
        // 손봄 표시가 붙는다
        expect(ops.getSheet(p2, sheet.id)!.manualSlots).toContain(1);
    });

    it('뒤 밀기를 끄면 그 교시만 바뀌고 뒤는 그대로', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const before = sheet.spec.slots[2].start; // 10:40
        const p2 = ops.editSlotTime(project, sheet.id, 1, { end: '10:40' }, false);
        const slots = ops.getSheet(p2, sheet.id)!.spec.slots;
        expect(slots[1].end).toBe('10:40');
        expect(slots[2].start).toBe(before); // 그대로
    });
});

describe('④ 줄 간격 — 저장·복원', () => {
    it('setRowHeight 로 정한 값이 저장·복원된다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject('고성초', '2학기'));
        const p2 = ops.setRowHeight(project, sheet.id, 60);
        const text = serializeProject(p2);
        const { project: back } = parseProjectFile(text);
        expect(back.sheets[0].rowHeight).toBe(60);
    });

    it('줄 간격이 없으면 기본값으로 읽는다(옛 파일 호환)', () => {
        const { sheet } = ops.createSheet(ops.newProject());
        expect(sheet.rowHeight).toBeUndefined();
        expect(rowHeightOf(sheet)).toBe(DEFAULT_ROW_HEIGHT);
        // 범위 밖 값은 가둔다
        expect(rowHeightOf({ rowHeight: 9999 })).toBe(96);
        expect(rowHeightOf({ rowHeight: 1 })).toBe(24);
    });
});

describe('⑤ v1 파일 — 새 선택값이 없어도 안 깨진다', () => {
    it('v1 파일을 열면 표에 줄 간격이 없고(=기본값) 교시 늘리기도 된다', () => {
        const { project } = migrateV1ToV2(sampleDoc());
        const sheet = project.sheets[0];
        expect(sheet.rowHeight).toBeUndefined();
        expect(rowHeightOf(sheet)).toBe(DEFAULT_ROW_HEIGHT);
        // 늘리기(extendSlots)가 v1 틀에서도 이어 붙는다
        const n = sheet.spec.slots.length;
        if (n > 0) {
            const grown = extendSlots(sheet.spec.slots, n + 1);
            expect(grown).toHaveLength(n + 1);
            expect(grown[n].start >= sheet.spec.slots[n - 1].end).toBe(true);
        }
    });

    it('빈 틀에서 늘리면 09:00 기본 슬롯을 쓴다', () => {
        expect(extendSlots([], 3)).toEqual(defaultSlots(3));
    });
});
