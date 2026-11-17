import { describe, expect, it } from 'vitest';
import { applyCsvPlan, csvRoomsOf, fixedOf, legacyOf, planCsv, writeImport } from './ops';
import { parseCsv, parseRoomsCsv, roomsToCsv, type CsvRoom } from './csv';
import { fakeRooms } from './fakeRooms.testkit';

const room = (o: Partial<CsvRoom> & { id: string }): CsvRoom => ({ name: o.id, capacity: 2, resourceKey: null, active: true, sort: 9, note: '', ...o });
let n = 0;
const nid = () => `gen${++n}`;

describe('rooms 약속 다리', () => {
    it('방과 속성을 CSV 줄로 읽는다(정원 없음 = null · 메모 = note)', () => {
        const r = fakeRooms([{ id: 'a', name: '가상 과학실', props: { capacity: 4, sort: 1 } }, { id: 'b', name: '가상 운동장', props: { active: false } }]);
        r.updateRoom('a', { memo: '메모' });
        expect(csvRoomsOf(r)).toEqual([
            { id: 'a', name: '가상 과학실', capacity: 4, resourceKey: null, active: true, sort: 1, note: '메모' },
            { id: 'b', name: '가상 운동장', capacity: null, resourceKey: null, active: false, sort: 0, note: '' },
        ]);
    });
    it('CSV 계획: id 나 이름이 같으면 고침 · 같은 값이면 그대로 · 없으면 더함 → 약속으로 쓴다', () => {
        const r = fakeRooms([{ id: 'a', name: '가', props: { capacity: 2, sort: 9 } }, { id: 'b', name: '나', props: { capacity: 2, sort: 9 } }]);
        const plan = planCsv(csvRoomsOf(r), [room({ id: 'a', name: '가' }), room({ id: 'zz', name: '나', capacity: 7 }), room({ id: 'c', name: '다', capacity: null, resourceKey: 'k' })]);
        expect([plan.adds.length, plan.sets.length, plan.same]).toEqual([1, 1, 1]);
        expect(applyCsvPlan(r, 'L1', plan)).toEqual({ added: 1, set: 1 });
        const out = csvRoomsOf(r);
        expect(out.find((x) => x.id === 'b')?.capacity).toBe(7);
        expect(out.find((x) => x.name === '다')).toMatchObject({ capacity: null, resourceKey: 'k' });
        expect(out.length).toBe(3);
    });
    it('고정 사용: 읽기 · 불러온 결과는 그 방 ext 에만 통째로 쓴다(다른 방·다른 칸은 그대로)', () => {
        const r = fakeRooms([{ id: 'a', name: '가상 과학실', props: { capacity: 3, fixed: [{ dayIndex: 1, startMin: 540, endMin: 580, label: '옛' }] } }, { id: 'b', name: '가상 음악실', props: { fixed: [{ dayIndex: 2, startMin: 540, endMin: 580, label: '남' }] } }]);
        const cur = legacyOf(r);
        expect(cur.fixed.map((f) => [f.roomId, f.label])).toEqual([['a', '옛'], ['b', '남']]);
        const next = { rooms: [...cur.rooms, { id: 'tmp', name: '가상 새방', capacity: 3, resourceKey: null, active: true, sort: 5, note: '' }], fixed: [{ id: 'x', roomId: 'a', dayIndex: 0, startMin: 540, endMin: 580, label: '새' }, { id: 'y', roomId: 'tmp', dayIndex: 4, startMin: 600, endMin: 640, label: '또' }, cur.fixed[1]] };
        writeImport(r, 'L1', cur.rooms, next, [{ roomId: 'a' }, { roomId: 'tmp' }]);
        expect(fixedOf(r.room('a')!).map((f) => f.label)).toEqual(['새']);
        expect(fixedOf(r.room('b')!).map((f) => f.label)).toEqual(['남']);
        const made = r.snapshot().find((x) => x.name === '가상 새방')!;
        expect(fixedOf(made).map((f) => f.label)).toEqual(['또']);
        expect(r.roomProps(made.id).capacity).toBe(3);
        expect(r.roomProps('a').capacity).toBe(3);
    });
});

describe('방 CSV', () => {
    it('따옴표·쉼표·줄바꿈이 든 칸을 내보내고 다시 읽어도 같다(정원 비움 포함)', () => {
        const rooms = [room({ id: 'a', name: '과학실, 2층', note: '그는 "정말"\n좋다' }), room({ id: 'b', name: '운동장', resourceKey: 'yard', active: false, capacity: null })];
        const back = parseRoomsCsv(roomsToCsv(rooms), nid);
        expect(back.headerError).toBeNull();
        expect(back.rejects).toEqual([]);
        expect(back.rooms).toEqual(rooms);
    });
    it('머리줄이 틀리면 통째로 거절', () => {
        expect(parseRoomsCsv('이름,정원\n가,1\n', nid).headerError).toContain('머리줄');
        expect(parseRoomsCsv('', nid).headerError).toContain('빈');
    });
    it('잘못된 줄은 줄 번호와 함께 거절 · 나머지는 읽힌다(여러 줄 칸 뒤의 줄 번호도 맞다)', () => {
        const csv = ['id,name,capacity,resourceKey,active,sort,note', ',가,2,,true,1,"메모', '둘째 줄"', ',나,99,,true,2,', ',다,3,,maybe,3,', ',라,3,,true,4', ',마,3,,true,5,ok', ',가,1,,true,6,'].join('\n');
        const p = parseRoomsCsv(csv, nid);
        expect(p.rooms.map((r) => r.name)).toEqual(['가', '마']);
        expect(p.rejects.map((r) => r.line)).toEqual([4, 5, 6, 8]);
        expect(p.rooms[0].note).toBe('메모\n둘째 줄');
        expect(parseCsv('a,b\r\n\r\nc,d').map((r) => r.line)).toEqual([1, 3]);
    });
});
