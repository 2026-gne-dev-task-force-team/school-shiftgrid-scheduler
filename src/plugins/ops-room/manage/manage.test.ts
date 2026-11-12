import { describe, expect, it } from 'vitest';
import { replay, type Op } from '../../../server-link/replay';
import { demoPart, memoryRoomSource, type Room } from '../book';
import { addBlock, addRoom, applyRoomOps, delRoom, editRoom, keyOf, opsFromRooms, parseCsv, parseRoomsCsv, roomsToCsv } from './index';

const room = (o: Partial<Room> & { id: string }): Room => ({ name: o.id, capacity: 2, resourceKey: null, active: true, sort: 9, note: '', ...o });
let n = 0;
const nid = () => `gen${++n}`;

describe('ops.rooms 재생', () => {
    it('기록한 조작을 기본 판에 입힌 결과 = 그 조작을 서버 판 위에 다시 재생한 결과(서버가 딴 방을 더해 둔 경우도)', () => {
        const base = demoPart();
        const sci = base.rooms[0];
        const ops: Op[] = [addRoom(room({ id: 'r-lab', name: '실험실' })), editRoom(sci, { ...sci, capacity: 4 }), delRoom('r-yard')];
        const direct = applyRoomOps(base, ops);
        expect(direct.errors).toEqual([]);
        expect(direct.next.rooms.map((r) => [r.id, r.capacity])).toEqual([['r-sci', 4], ['r-lab', 2]]);
        // 서버에 다른 사람이 방 하나를 더했다 → 재생해도 내 조작이 그대로 입혀지고 남의 방도 산다
        const server = { ...base, rooms: [...base.rooms, room({ id: 'r-other', name: '음악실' })] };
        const again = applyRoomOps(server, ops);
        expect(again.errors).toEqual([]);
        expect(again.next.rooms.map((r) => r.id).sort()).toEqual(['r-lab', 'r-other', 'r-sci']);
        // 같은 조작을 두 번 재생해도 결과가 같다(이미 들어감·이미 지워짐은 건너뜀)
        const twice = replay({ rooms: direct.next.rooms, fixed: [], blocks: [] }, ops, keyOf);
        expect(twice.result.rooms).toEqual(direct.next.rooms);
        expect(twice.skipped.length).toBe(3);
    });
    it('고치는 사이 서버가 같은 방을 바꿨으면 충돌 — 쓰지 않는다', () => {
        const base = demoPart();
        const sci = base.rooms[0];
        const server = { ...base, rooms: [{ ...sci, name: '새과학실' }, base.rooms[1]] };
        const out = applyRoomOps(server, [editRoom(sci, { ...sci, capacity: 5 })]);
        expect(out.replayed.conflicts.length).toBe(1);
        expect(out.errors.length).toBe(1);
    });
    it('칸 규칙: 정원 범위 · 이름 겹침 · 없는 방 차단 · 차단 날짜 순서', () => {
        const base = demoPart();
        expect(applyRoomOps(base, [addRoom(room({ id: 'x', capacity: 21 }))]).errors[0]).toContain('1~20');
        expect(applyRoomOps(base, [addRoom(room({ id: 'x', name: '과학실' }))]).errors[0]).toContain('겹칩니다');
        const b = { id: 'b', roomId: 'nope', startDate: '2026-11-20', endDate: '2026-11-19', fromMin: null, toMin: null, reason: '' };
        expect(applyRoomOps(base, [addBlock(b)]).errors.length).toBe(2);
    });
    it('저장소에 쓰면 다시 읽는다', async () => {
        const src = memoryRoomSource(demoPart());
        const out = applyRoomOps(await src.loadPart(), [addRoom(room({ id: 'r-new', name: '미술실' }))]);
        await src.savePart(out.next);
        expect((await src.loadPart()).rooms.map((r) => r.name)).toContain('미술실');
    });
});

describe('방 CSV', () => {
    it('따옴표·쉼표·줄바꿈이 든 칸을 내보내고 다시 읽어도 같다', () => {
        const rooms = [room({ id: 'a', name: '과학실, 2층', note: '그는 "정말"\n좋다' }), room({ id: 'b', name: '운동장', resourceKey: 'yard', active: false })];
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
    });
    it('미리보기 계획: id 없으면 추가 · 있고 다르면 고침 · 같으면 그대로', () => {
        const cur = [room({ id: 'a', name: '가' }), room({ id: 'b', name: '나' })];
        const plan = opsFromRooms(cur, [room({ id: 'a', name: '가' }), room({ id: 'b', name: '나', capacity: 7 }), room({ id: 'c', name: '다' })]);
        expect([plan.adds, plan.sets, plan.same]).toEqual([1, 1, 1]);
        expect(parseCsv('a,b\r\n\r\nc,d').map((r) => r.line)).toEqual([1, 3]);
    });
});
