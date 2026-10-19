/**
 * 모듈 2 — 표가 먼저, 뜻은 컴포넌트로. 쥔님 판정으로 모듈 1·1.1 의 「규칙이 표를 만드는」 길이
 * 뒤집혔다 — 이 파일은 그 뒤집힌 모델(rows/cols + 컴포넌트)을 검산한다.
 *   · 줄/열 넣고 빼기
 *   · 행 경계 끌기가 뒤 줄 시각을 민다(스냅·하한)
 *   · 「학교 수업 시간」 적용이 칸 글자를 순번으로 보존한다
 *   · 「열 머리」 적용
 *   · v1 파일 → v5 · 옛 v2(4) 파일 → v5 · 왕복 직렬화
 */
import { describe, it, expect } from 'vitest';
import * as ops from './ops';
import { cellTextOf } from './model';
import { rowTimes, rowDisplayLabel } from './rows';
import { parseProjectFile, serializeProject } from './persist';
import { migrateV1ToV2 } from './migrate';
import { schoolPeriodsDef } from './components/schoolPeriods';
import { colHeadsDef } from './components/colHeads';
import { sampleDoc } from '../io/sample';

describe('줄 넣기·빼기', () => {
    it('위/아래에 줄을 넣으면 그 자리에 선다(기본 40분)', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const midKey = sheet.rows[2].key;
        const p2 = ops.insertRowAbove(project, sheet.id, midKey);
        const rows = ops.getSheet(p2, sheet.id)!.rows;
        expect(rows).toHaveLength(7);
        expect(rows[2].key).not.toBe(midKey); // 새 줄이 2번째 자리에 섰다
        expect(rows[3].key).toBe(midKey);     // 옛 줄은 한 칸 밀렸다(키는 안 바뀐다)
        expect(rows[2].minutes).toBe(40);

        const p3 = ops.insertRowBelow(p2, sheet.id, midKey);
        expect(ops.getSheet(p3, sheet.id)!.rows).toHaveLength(8);
        expect(ops.getSheet(p3, sheet.id)!.rows[3].key).toBe(midKey); // 아래에 넣어도 자기 자리는 그대로(새 줄은 뒤에 선다)
    });

    it('새 줄은 옆 줄의 길이·뒤 쉬는 시간을 물려받는다 — 넣은 자리 뒤에만 틈이 없어지면 안 된다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const first = sheet.rows[0];
        expect(first.gapAfter).toBe(10); // 기본 표의 줄은 뒤에 10분 쉰다
        const p2 = ops.insertRowBelow(project, sheet.id, first.key);
        const rows = ops.getSheet(p2, sheet.id)!.rows;
        expect(rows[1].gapAfter).toBe(first.gapAfter);
        expect(rows[1].minutes).toBe(first.minutes);
        // 시각으로 보면 새 줄(2번째)과 그 다음 줄 사이에도 10분이 벌어져 있어야 한다 — 09:50~10:30 · 10:40~
        const s2 = ops.getSheet(p2, sheet.id)!;
        const t = rowTimes(s2.startTime, s2.rows);
        expect(t[1].end).toBe('10:30');
        expect(t[2].start).toBe('10:40');
    });

    it('줄을 빼면 그 줄의 칸 글자도 같이 사라진다. 마지막 한 줄은 못 뺀다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const rowKey = sheet.rows[0].key;
        const colKey = sheet.cols[0].key;
        const withCell = ops.setSheetCell(project, sheet.id, colKey, rowKey, '글자');
        const removed = ops.removeRow(withCell, sheet.id, rowKey);
        expect(ops.getSheet(removed, sheet.id)!.rows).toHaveLength(5);
        expect(ops.getSheet(removed, sheet.id)!.cells[`${colKey}:${rowKey}`]).toBeUndefined();

        // 한 줄만 남을 때까지 빼도 마지막 하나는 남는다
        let p = removed;
        for (const r of [...ops.getSheet(p, sheet.id)!.rows]) p = ops.removeRow(p, sheet.id, r.key);
        expect(ops.getSheet(p, sheet.id)!.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('「수업 없는 줄」로 토글하면 그 줄 칸 글자가 지워지고, 다시 켜면 비어 있다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const rowKey = sheet.rows[0].key, colKey = sheet.cols[0].key;
        const withCell = ops.setSheetCell(project, sheet.id, colKey, rowKey, '체육');
        const off = ops.toggleRowAssignable(withCell, sheet.id, rowKey);
        expect(ops.getSheet(off, sheet.id)!.rows[0].assignable).toBe(false);
        expect(ops.getSheet(off, sheet.id)!.cells[`${colKey}:${rowKey}`]).toBeUndefined();
    });
});

describe('열 넣기·빼기', () => {
    it('왼쪽/오른쪽에 열을 넣고, 빼면 그 열 칸 글자도 사라진다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const midKey = sheet.cols[2].key;
        const p2 = ops.insertColLeft(project, sheet.id, midKey);
        expect(ops.getSheet(p2, sheet.id)!.cols).toHaveLength(6);
        expect(ops.getSheet(p2, sheet.id)!.cols[3].key).toBe(midKey);

        const rowKey = sheet.rows[0].key;
        const withCell = ops.setSheetCell(p2, sheet.id, midKey, rowKey, '국어');
        const removed = ops.removeCol(withCell, sheet.id, midKey);
        expect(ops.getSheet(removed, sheet.id)!.cols).toHaveLength(5);
        expect(ops.getSheet(removed, sheet.id)!.cells[`${midKey}:${rowKey}`]).toBeUndefined();
    });
});

describe('행 경계 끌기 — 뒤 줄 시각을 민다(파생값)', () => {
    it('첫 줄을 10분 늘리면 둘째 줄 시작이 10분 밀린다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const before = rowTimes(sheet.startTime, sheet.rows);
        expect(before[0]).toEqual({ start: '09:00', end: '09:40' });
        expect(before[1].start).toBe('09:50'); // 40분 수업 + 10분 쉼

        const p2 = ops.resizeRow(project, sheet.id, sheet.rows[0].key, 10);
        const s2 = ops.getSheet(p2, sheet.id)!;
        expect(s2.rows[0].minutes).toBe(50);
        const after = rowTimes(s2.startTime, s2.rows);
        expect(after[0].end).toBe('09:50');
        expect(after[1].start).toBe('10:00'); // 밀렸다 — 누가 "밀기"를 호출한 게 아니라 파생이라 저절로
    });

    it('5분 스냅 — 3분만 끌어도 5분 단위로 반올림된다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const p2 = ops.resizeRow(project, sheet.id, sheet.rows[0].key, 3); // round(43/5)*5=45
        expect(ops.getSheet(p2, sheet.id)!.rows[0].minutes).toBe(45);
    });

    it('하한 — 아무리 줄여도 5분 밑으로는 안 내려간다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const p2 = ops.resizeRow(project, sheet.id, sheet.rows[0].key, -1000);
        expect(ops.getSheet(p2, sheet.id)!.rows[0].minutes).toBe(5);
    });

    it('「시간 고치기」로 분·뒤 쉬는 시간을 직접 넣는다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const p2 = ops.setRowTime(project, sheet.id, sheet.rows[0].key, { minutes: 45, gapAfter: 5 });
        const r0 = ops.getSheet(p2, sheet.id)!.rows[0];
        expect(r0.minutes).toBe(45);
        expect(r0.gapAfter).toBe(5);
    });
});

describe('줄 라벨 — 자동 번호 · 손으로 덮기', () => {
    it('라벨이 없으면 수업 있는 줄만 세어 번호가 매겨진다', () => {
        const { sheet } = ops.createSheet(ops.newProject());
        expect(rowDisplayLabel(sheet.rows, 0)).toBe('1');
        expect(rowDisplayLabel(sheet.rows, 5)).toBe('6');
    });

    it('라벨을 붙이면 번호 대신 그 글자가 뜬다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const p2 = ops.setRowLabel(project, sheet.id, sheet.rows[1].key, '점심');
        const rows = ops.getSheet(p2, sheet.id)!.rows;
        expect(rowDisplayLabel(rows, 1)).toBe('점심');
    });
});

describe('컴포넌트 — 꽂기·속성·적용·빼기', () => {
    it('꽂으면 기본 속성값으로 인스턴스가 생기고, 적용 전엔 표가 안 바뀐다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const p2 = ops.addComponent(project, sheet.id, 'school-periods');
        const s2 = ops.getSheet(p2, sheet.id)!;
        expect(s2.components).toHaveLength(1);
        expect(s2.components[0].componentId).toBe('school-periods');
        expect(s2.rows).toHaveLength(6); // 아직 그대로
    });

    it('🔴 「학교 수업 시간」 적용 — 칸 글자가 같은 순번 줄에 남는다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const colKey = sheet.cols[0].key;
        // 3번째 줄(순번 index 2)에 글자를 써 둔다
        const withCell = ops.setSheetCell(project, sheet.id, colKey, sheet.rows[2].key, '김선생님');
        const withComp = ops.addComponent(withCell, sheet.id, 'school-periods');
        const instanceId = ops.getSheet(withComp, sheet.id)!.components[0].instanceId;
        // 점심을 3번째 줄 뒤에 끼우는 규칙으로 속성을 바꾸고 적용한다 — 줄 수는 그대로 6
        const withProps = ops.updateComponentProps(withComp, sheet.id, instanceId, {
            start: '09:00', lessonMinutes: 40, breakMinutes: 10, rows: 6, lunchAfter: null, lunchMinutes: 50,
        });
        const applied = ops.applyComponent(withProps, sheet.id, instanceId);
        const s2 = ops.getSheet(applied, sheet.id)!;
        expect(s2.rows).toHaveLength(6);
        // 순번이 같은 자리(index 2)의 새 줄 key 로 그 글자가 그대로 남아 있다
        expect(cellTextOf(s2.cells[`${colKey}:${s2.rows[2].key}`])).toBe('김선생님');
    });

    it('점심을 넣으면 그 줄은 수업 못 넣는 줄(assignable:false, label 점심)이다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const withComp = ops.addComponent(project, sheet.id, 'school-periods');
        const instanceId = ops.getSheet(withComp, sheet.id)!.components[0].instanceId;
        const withProps = ops.updateComponentProps(withComp, sheet.id, instanceId, {
            start: '09:00', lessonMinutes: 40, breakMinutes: 10, rows: 6, lunchAfter: 4, lunchMinutes: 50,
        });
        const applied = ops.applyComponent(withProps, sheet.id, instanceId);
        const rows = ops.getSheet(applied, sheet.id)!.rows;
        expect(rows).toHaveLength(7); // 수업 6 + 점심 1
        expect(rows[4]).toMatchObject({ label: '점심', assignable: false });
        expect(rows.filter((r) => r.assignable)).toHaveLength(6);
        // 점심 끝 뒤로 다음 수업이 밀린다(쉬는 시간만큼)
        const times = rowTimes(ops.getSheet(applied, sheet.id)!.startTime, rows);
        expect(times[5].start > times[4].end).toBe(true);
    });

    it('빼기 — 인스턴스만 사라진다(이미 적용된 표 모양은 그대로)', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const withComp = ops.addComponent(project, sheet.id, 'school-periods');
        const instanceId = ops.getSheet(withComp, sheet.id)!.components[0].instanceId;
        const applied = ops.applyComponent(withComp, sheet.id, instanceId);
        const removed = ops.removeComponent(applied, sheet.id, instanceId);
        expect(ops.getSheet(removed, sheet.id)!.components).toHaveLength(0);
        expect(ops.getSheet(removed, sheet.id)!.rows).toHaveLength(6); // 표는 그대로
    });

    it('「열 머리」 적용 — 열 수를 맞추고 머리를 채운다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject());
        const withComp = ops.addComponent(project, sheet.id, 'col-heads');
        const instanceId = ops.getSheet(withComp, sheet.id)!.components[0].instanceId;
        const withProps = ops.updateComponentProps(withComp, sheet.id, instanceId, { style: 'cycle', count: 4 });
        const applied = ops.applyComponent(withProps, sheet.id, instanceId);
        const cols = ops.getSheet(applied, sheet.id)!.cols;
        expect(cols).toHaveLength(4);
        expect(cols.map((c) => c.label)).toEqual(['1일차', '2일차', '3일차', '4일차']);
    });

    it('정의(def.apply) 자체도 순수 함수로 바로 검산된다', () => {
        const { sheet } = ops.createSheet(ops.newProject());
        const next = schoolPeriodsDef.apply(sheet, { ...schoolPeriodsDef.defaultProps, rows: 3 });
        expect(next.rows).toHaveLength(3);
        const next2 = colHeadsDef.apply(sheet, { style: 'weekday', count: 3, customLabels: '' });
        expect(next2.cols.map((c) => c.label)).toEqual(['월', '화', '수']);
    });
});

describe('v1 파일 → v5', () => {
    it('v1 파일을 열면 표의 rows/cols 가 서고 칸은 비어 있다(배치는 legacy 에만)', () => {
        const { project } = migrateV1ToV2(sampleDoc());
        const sheet = project.sheets[0];
        expect(sheet.rows.length).toBeGreaterThan(0);
        expect(sheet.cols.length).toBeGreaterThan(0);
        expect(sheet.components).toEqual([]);
    });
});

describe('옛 v2(schemaVersion 4) 파일 → v5 (persist 경유)', () => {
    it('parseProjectFile 이 schemaVersion 4 를 조용히 5 로 올린다', () => {
        const old = JSON.stringify({
            schemaVersion: 4, name: '고성초', term: '', sheets: [{
                id: 's1', name: '표1',
                spec: { id: 'sp', name: '틀', cycleDays: 7, activeDays: [0], dayStart: '09:00', dayEnd: '09:40',
                    slots: [{ index: 0, label: '1교시', start: '09:00', end: '09:40', assignable: true, kind: 'lesson' }] },
                cells: {},
            }], trash: [], legacy: null,
        });
        const { project, report } = parseProjectFile(old);
        expect(report).toBeNull();
        expect(project.schemaVersion).toBe(5);
        expect(project.sheets[0].rows).toHaveLength(1);
        expect(project.sheets[0].cols).toHaveLength(1);
    });
});

describe('왕복 직렬화 — 저장했다가 다시 열면 그대로', () => {
    it('컴포넌트·칸·줄·열이 전부 그대로 돌아온다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject('고성초', '2학기'));
        const colKey = sheet.cols[0].key, rowKey = sheet.rows[0].key;
        const withCell = ops.setSheetCell(project, sheet.id, colKey, rowKey, '체육');
        const withComp = ops.addComponent(withCell, sheet.id, 'school-periods');
        const text = serializeProject(withComp);

        const { project: back } = parseProjectFile(text);
        expect(back.sheets[0].cells[`${colKey}:${rowKey}`]).toEqual({ kind: 'text', text: '체육' });
        expect(back.sheets[0].components).toHaveLength(1);
        expect(back.sheets[0].rows).toHaveLength(6);
        expect(back.sheets[0].cols).toHaveLength(5);
    });
});
