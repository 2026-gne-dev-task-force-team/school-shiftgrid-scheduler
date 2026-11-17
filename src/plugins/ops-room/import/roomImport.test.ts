/**
 * 특별실 고정 사용 불러오기 — 운영 앱 room-import.test.ts 의 시나리오를 순수 함수로 옮긴 것.
 * 이름은 비식별본 그대로(마법학교 · 교사NN · 등잔밑이어둡관). 실물 hwp(학교 원본)를 읽던 시험은 합성 표로 갈음한다.
 */
import { describe, expect, it } from 'vitest';
import { fixedDuplicates } from '../../../../shared/room-rules.ts';
import { magicFrame } from '../../../../shared/import/magicFrame.ts';
import type { Room, RoomFixed } from '../../../../shared/room-rules.ts';
import { applyRoomImport, cleanLabel, previewRoomFile, roomNameOf, roomTemplateCsv, type RoomPreview } from './roomImport';
import { csvBytes, hwpBytes, hwpxBytes, xlsxBytes } from './synth';

const frame = magicFrame();
const parse = (csv: string): string[][] => csv.replace(/^﻿/, '').trim().split('\r\n').map((l) => l.split(','));
const ok = (r: ReturnType<typeof previewRoomFile>): RoomPreview => { if (!r.ok) throw new Error(r.reason); return r.preview; };
const room = (id: string, name: string): Room => ({ id, name, capacity: 2, resourceKey: null, active: true, sort: 1, note: '' });
const fx = (id: string, roomId: string, dayIndex: number, start: number, label: string): RoomFixed => ({ id, roomId, dayIndex, startMin: start, endMin: start + 40, label });
let seq = 0;
const newId = () => 'n' + ++seq;

describe('작은 규칙', () => {
    it('방 이름', () => {
        expect(roomNameOf('마법약실16마법약(전담) 및 4학년배정')).toBe('마법약실1');
        expect(roomNameOf('마법약실2 3마법약(전담) 및 5학년배정')).toBe('마법약실2');
        expect(roomNameOf('등잔밑이어둡관(전학년)')).toBe('등잔밑이어둡관');
        expect(roomNameOf('컴퓨터실')).toBe('컴퓨터실');
        expect(roomNameOf('미래에서왔실')).toBe('미래에서왔실');
        expect(roomNameOf('운동장')).toBe('운동장');
    });
    it('칸 글자', () => {
        expect(cleanLabel('6G')).toBe('6학년');
        expect(cleanLabel('방과후(댄스)*운동장: 예약제로 운영')).toBe('방과후(댄스)');
    });
    it('줄 머리 → 시각: 시간 틀 규칙(shared 것을 그대로 쓴다)', () => {
        expect(frame.resolve('4(3,4학년)')).toMatchObject({ start: '12:20', reason: '3학년 시간 틀' });
        expect(frame.resolve('4(1,2,5,6학년) 11:30-12:10 (※3,4학년 점심)')).toMatchObject({ start: '11:30', reason: '줄 머리의 시각' });
        expect(frame.resolve('2')).toMatchObject({ start: '09:50', reason: '모든 학년이 같은 시각' });
        expect(frame.resolve('4').options).toEqual([{ start: '11:30', grades: [1, 5] }, { start: '12:20', grades: [3] }]);
    });
});

describe('양식', () => {
    const rooms = [room('r1', '마법약실'), room('r2', '맨드레이크합창실')];
    it('방이 없으면 방1·방2·방3 자리가 있고 5일 × 시각 줄', () => {
        const rows = parse(roomTemplateCsv(frame, [], [], false));
        expect(rows[0]).toEqual(['요일', '시각', '교시(1·2 / 3·4 / 5·6학년)', '방1', '방2', '방3']);
        expect(rows.length).toBe(1 + 5 * frame.times.length);
        expect(rows[4].slice(0, 3)).toEqual(['월', '11:30~12:10', '4 · 점심 · 4']);
    });
    it('채워 올리면 미리보기 → 반영 → 고정 사용에 들어가고, 다시 내려받으면 채워져 있다', () => {
        const rows = parse(roomTemplateCsv(frame, [], [], true));
        rows[0][3] = '마법약실'; rows[0][4] = '맨드레이크합창실'; rows[0][5] = '';
        rows[1][3] = '5-3 마법약(교사05)'; // 월 09:00
        rows[2][3] = '5-3 마법약(교사05)'; // 월 09:50
        rows[1 + 6 + 5][4] = '방과후'; // 화 13:10
        const p = ok(previewRoomFile(frame, csvBytes(rows), '양식.csv', [], []));
        expect(p.source).toBe('csv');
        expect(p.rooms.map((r) => r.key)).toEqual(['마법약실', '맨드레이크합창실']);
        expect(p.rooms[0]).toMatchObject({ suggestedName: '마법약실', matchRoomId: null, diff: { add: 2, change: 0, remove: 0, same: 0 } });
        expect(p.rooms[0].cells[0]).toEqual({ dayIndex: 0, start: '09:00', label: '5-3 마법약(교사05)' });
        const ap = applyRoomImport(frame, [], [], p.rooms.map((r) => ({ roomId: null, name: r.suggestedName, capacity: r.capacityHint, cells: r.cells })), newId);
        expect(ap.ok && ap.applied.map(({ name, created, cells }) => ({ name, created, cells }))).toEqual([{ name: '마법약실', created: true, cells: 2 }, { name: '맨드레이크합창실', created: true, cells: 1 }]);
        if (!ap.ok) return;
        expect(ap.next.fixed.find((f) => f.roomId === ap.applied[0].roomId && f.startMin === 540)).toMatchObject({ dayIndex: 0, endMin: 580, label: '5-3 마법약(교사05)' });
        // 다시 내려받으면 지금 값이 채워져 있고, 고쳐 올리면 바뀜·빠짐이 보인다
        const again = parse(roomTemplateCsv(frame, ap.next.rooms, ap.next.fixed, false));
        expect(again[0].slice(3)).toEqual(['마법약실', '맨드레이크합창실']);
        expect(again[1][3]).toBe('5-3 마법약(교사05)');
        again[1][3] = '5-4 마법약(교사05)'; again[2][3] = '';
        const q = ok(previewRoomFile(frame, csvBytes(again), 'b.csv', ap.next.rooms, ap.next.fixed));
        expect(q.rooms.find((r) => r.key === '마법약실')).toMatchObject({ matchRoomId: ap.applied[0].roomId, diff: { add: 0, change: 1, remove: 1, same: 0 } });
        expect(q.rooms.find((r) => r.key === '맨드레이크합창실')!.diff).toEqual({ add: 0, change: 0, remove: 0, same: 1 });
    });
    it('양식이 아니면 ❌ (요일 줄이 없다)', () => {
        const r = previewRoomFile(frame, csvBytes([['이름', '나이'], ['가', '1']]), 'a.csv', rooms, []);
        expect(r).toMatchObject({ ok: false, reason: '요일(월~금) 줄이 있는 표를 찾지 못했습니다' });
    });
    it('같은 이름만 기존 방으로 잇는다 — 앞부분만 같은 방(마법약실 ↔ 마법약실1)은 다른 방', () => {
        const rows = [['요일', '시각', '마법약실1'], ['월', '09:00~09:40', '가']];
        expect(ok(previewRoomFile(frame, csvBytes(rows), 'a.csv', rooms, [])).rooms[0].matchRoomId).toBeNull();
    });
});

describe('한글 문서 · 엑셀', () => {
    const classTable = [['학반', '1학년1반', '', '', '', ''], ['요일교시', '월', '화', '수', '목', '금'], ['1', '주문외우기', '수비학', '주문외우기', '수비학', '주문외우기']];
    const roomRows = [
        ['학반', '빗자루비행관(전학년)', '', '', '', '', '컴퓨터실', '', '', '', ''],
        ['요일 교시', '월', '화', '수', '목', '금', '월', '화', '수', '목', '금'],
        ['1', '3-4', '', '', '', '', '6G', '', '', '', ''],
        ['', '4-4(스)', '', '', '', '', '', '', '', '', ''],
        ['4(1,2,5,6학년) 11:30-12:10', '', '방과후', '', '', '', '', '', '', '', '5-2'],
    ];
    const expectRooms = (p: RoomPreview) => {
        expect(p.rooms.map((r) => r.suggestedName)).toEqual(['빗자루비행관', '컴퓨터실']);
        expect(p.rooms[0].capacityHint).toBe(2);
        expect(p.rooms[0].cells).toEqual([{ dayIndex: 0, start: '09:00', label: '3-4 · 4-4(스)' }, { dayIndex: 1, start: '11:30', label: '방과후' }]);
        expect(p.rooms[1].cells).toEqual([{ dayIndex: 0, start: '09:00', label: '6학년' }, { dayIndex: 4, start: '11:30', label: '5-2' }]);
    };
    it('hwpx: 학급 표는 건너뛰고 특별실 표를 고른다 · 한 칸 여러 줄은 · 로 잇고 정원 힌트', () => {
        const p = ok(previewRoomFile(frame, hwpxBytes([classTable, roomRows]), 'x.hwpx', [], []));
        expect(p.tableIndex).toBe(1);
        expectRooms(p);
        // 다른 표를 고르면 요일 줄은 있지만 학급 표라 방 한 곳(1학년1반)으로 읽힌다
        const p0 = ok(previewRoomFile(frame, hwpxBytes([classTable, roomRows]), 'x.hwpx', [], [], { tableIndex: 0 }));
        expect(p0.tableIndex).toBe(0);
        expect(p0.rooms.map((r) => r.key)).toEqual(['1학년1반']);
    });
    it('꼴 넷(hwpx·hwp·xlsx·csv 양식)이 같은 방·칸을 낸다', () => {
        const tpl = parse(roomTemplateCsv(frame, [], [], true));
        tpl[0][3] = '빗자루비행관'; tpl[0][4] = '컴퓨터실'; tpl[0][5] = '';
        tpl[1][3] = '3-4\n4-4(스)'; tpl[1][4] = '6G';
        tpl[1 + 6 + 3][3] = '방과후'; // 화 11:30
        tpl[1 + 6 * 4 + 3][4] = '5-2'; // 금 11:30
        const grid = roomRows.map((r) => [...r]);
        const hwpx = ok(previewRoomFile(frame, hwpxBytes([grid]), 'a.hwpx', [], []));
        const hwp = ok(previewRoomFile(frame, hwpBytes([grid]), 'a.hwp', [], []));
        const xlsxG = ok(previewRoomFile(frame, xlsxBytes([grid]), 'a.xlsx', [], []));
        const xlsxT = ok(previewRoomFile(frame, xlsxBytes([tpl]), 'b.xlsx', [], []));
        const csv = ok(previewRoomFile(frame, csvBytes(tpl), 'b.csv', [], []));
        expect([hwpx.source, hwp.source, xlsxG.source, xlsxT.source, csv.source]).toEqual(['hwpx', 'hwp', 'xlsx', 'xlsx', 'csv']);
        for (const p of [hwpx, hwp, xlsxG, xlsxT, csv]) expectRooms(p);
        expect(hwp.rooms).toEqual(hwpx.rooms);
        expect(xlsxG.rooms).toEqual(hwpx.rooms);
        expect(csv.rooms).toEqual(xlsxT.rooms);
    });
    it('번호만 있는 「4」 줄은 학년마다 시각이 달라 묻고, 고르면 그 시각에 넣는다', () => {
        const rows = [['학반', '마법약실', '', '', '', ''], ['요일 교시', '월', '화', '수', '목', '금'], ['2', '5-1', '', '', '', ''], ['4', '3-2', '', '', '', '']];
        const bytes = hwpxBytes([rows]);
        const p = ok(previewRoomFile(frame, bytes, 'a.hwpx', [], []));
        expect(p.rows.find((r) => r.label === '2')).toMatchObject({ start: '09:50' });
        const four = p.rows.find((r) => r.label === '4')!;
        expect(four.start).toBeNull();
        expect(four.options!.map((o) => o.start)).toEqual(['11:30', '12:20']);
        expect(p.warnings.join()).toContain('시각을 골라');
        expect(p.rooms[0].cells).toEqual([{ dayIndex: 0, start: '09:50', label: '5-1' }]);
        const q = ok(previewRoomFile(frame, bytes, 'a.hwpx', [], [], { choices: { '4': '12:20' } }));
        expect(q.rooms[0].cells).toEqual([{ dayIndex: 0, start: '09:50', label: '5-1' }, { dayIndex: 0, start: '12:20', label: '3-2' }]);
        expect(q.rows.find((r) => r.label === '4')).toMatchObject({ start: '12:20', chosen: true });
        expect(q.warnings).toEqual([]);
        // 시간표에 없는 시각을 고르면 무시하고 다시 묻는다
        expect(ok(previewRoomFile(frame, bytes, 'a.hwpx', [], [], { choices: { '4': '03:33' } })).rows.find((r) => r.label === '4')!.start).toBeNull();
    });
});

describe('깨진 파일 ❌', () => {
    it('깨진 xlsx·hwpx·hwp · 빈 파일 · 바이너리는 던지지 않고 이유를 돌려준다', () => {
        const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6]);
        const hwpx = new Uint8Array(60); hwpx.set([0x50, 0x4b, 0x03, 0x04]); hwpx.set(new TextEncoder().encode('mimetype'), 30);
        const hwp = new Uint8Array(64); hwp.set([0xd0, 0xcf, 0x11, 0xe0]);
        const cases: [Uint8Array, string, string][] = [
            [zip, 'a.xlsx', 'xlsx 를 읽지 못함'], [hwpx, 'a.hwpx', 'hwpx 를 읽지 못함'], [hwp, 'a.hwp', 'hwp 를 읽지 못함'],
            [new Uint8Array(0), 'a.csv', '알 수 없는 파일 꼴'], [new Uint8Array([1, 0, 2, 3]), 'a.bin', '알 수 없는 파일 꼴'],
        ];
        for (const [bytes, name, why] of cases) {
            const r = previewRoomFile(frame, bytes, name, [], []);
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason).toContain(why);
        }
    });
});

describe('반영', () => {
    const rooms = [room('r1', '마법약실'), room('r2', '컴퓨터실')];
    const cur = [fx('f1', 'r1', 1, 540, '옛칸'), fx('f2', 'r2', 0, 540, '그대로')];
    const cell = (dayIndex: number, start: string, label: string) => ({ dayIndex, start, label });
    it('고른 방만 통째로 바꾸고 나머지 방은 둔다 · 같은 칸 중복은 하나 · 시각은 분으로', () => {
        const r = applyRoomImport(frame, rooms, cur, [{ roomId: 'r1', name: '마법약실', cells: [cell(0, '09:00', '가'), cell(0, '09:00', '중복')] }], newId);
        expect(r.ok && r.applied).toEqual([{ roomId: 'r1', name: '마법약실', created: false, cells: 1 }]);
        expect(r.ok && r.next.fixed.map((f) => [f.roomId, f.dayIndex, f.startMin, f.endMin, f.label])).toEqual([['r2', 0, 540, 580, '그대로'], ['r1', 0, 540, 580, '가']]);
    });
    it('roomId 가 null 이면 같은 이름 방을 쓰고, 없으면 새 방(정원 힌트·다음 순서)', () => {
        const r = applyRoomImport(frame, rooms, [], [{ roomId: null, name: '컴퓨터실', cells: [] }, { roomId: null, name: '등잔밑이어둡관', capacity: 3, cells: [cell(0, '09:00', '3-4')] }], newId);
        expect(r.ok && r.applied.map((a) => [a.name, a.created])).toEqual([['컴퓨터실', false], ['등잔밑이어둡관', true]]);
        expect(r.ok && r.next.rooms[2]).toMatchObject({ name: '등잔밑이어둡관', capacity: 3, active: true, sort: 2 });
    });
    it('없는 방 · 수업 시각이 아닌 칸 · 정원 밖 · 같은 방 두 번 · 빈 목록이면 아무것도 바꾸지 않고 ❌', () => {
        expect(applyRoomImport(frame, rooms, cur, [{ roomId: 'zz', name: '유령', cells: [] }], newId)).toEqual({ ok: false, error: '없는 방입니다: 유령' });
        expect(applyRoomImport(frame, rooms, cur, [{ roomId: 'r1', name: '마법약실', cells: [cell(0, '09:05', '가')] }], newId).ok).toBe(false);
        expect(applyRoomImport(frame, rooms, cur, [{ roomId: 'r1', name: '마법약실', cells: [cell(7, '09:00', '가')] }], newId).ok).toBe(false);
        expect(applyRoomImport(frame, rooms, cur, [{ roomId: 'r1', name: '마법약실', cells: [cell(0, '09:00', ' ')] }], newId).ok).toBe(false);
        expect(applyRoomImport(frame, rooms, cur, [{ roomId: null, name: '새방', capacity: 99, cells: [] }], newId).ok).toBe(false);
        expect(applyRoomImport(frame, rooms, cur, [{ roomId: 'r1', name: '마법약실', cells: [] }, { roomId: null, name: '마법약실', cells: [] }], newId).ok).toBe(false);
        expect(applyRoomImport(frame, rooms, cur, [], newId).ok).toBe(false);
    });
    it('반영 결과에 (방,요일,시작) 겹침이 없다 — 기존 겹침이 남아 있으면 ❌', () => {
        const ok1 = applyRoomImport(frame, rooms, cur, [{ roomId: 'r1', name: '마법약실', cells: [cell(0, '09:00', '가'), cell(1, '09:50', '나')] }], newId);
        expect(ok1.ok && fixedDuplicates(ok1.next.fixed)).toEqual([]);
        const dup = [fx('d1', 'r2', 0, 540, 'x'), fx('d2', 'r2', 0, 540, 'y')];
        expect(applyRoomImport(frame, rooms, dup, [{ roomId: 'r1', name: '마법약실', cells: [] }], newId)).toEqual({ ok: false, error: '같은 방·요일·시작의 고정 사용이 겹칩니다' });
    });
});

// 학교 원본 hwp(특별실 7곳이 든 표)를 읽던 시험은 실물 파일이 있어야 돈다 — 레포엔 합성 표로 갈음했다(위 「한글 문서 · 엑셀」).
it.skip('학교 원본 hwp: 특별실 7곳 (실물 파일 필요 — 비식별 원본 fixtures 는 레포에 옮기지 않음)', () => {});
