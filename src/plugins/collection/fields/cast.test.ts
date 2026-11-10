/**
 * 관계 칸 캐스팅 — 방 목록을 가리키는 칸에 반(다른 목록의 줄)을 넣는 판정 · 값 꼴 · 따라가 읽기 · 거꾸로 보기.
 */
import { describe, it, expect } from 'vitest';
import type { PublicNode } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import { castCandidate, castCandidates, parseRelationEntry, relationEntry, relationReferrers, resolveRelationTargets, type RelationLook } from './cast';
import { resolveRelation } from './relation';
import { registerKit } from '../kits';

const toRooms = [{ key: 'f_room', label: '교실', type: 'relation', config: { target: { kind: 'db', nodeId: 'rl' }, many: true } }];
// rl(방 목록) ─ r1, r2, r3, rX(휴지통) · yl(학년도, 교실 칸) ─ c1(r1) c2(r1,r2) c3(빔) c4(rX 만) · ol(교실 칸 없음) ─ o1 · bs(예약, 방 칸) ─ b1 b2 b3
const nodes: Record<string, { type: string; name: string; parent: string | null; trashed?: boolean; data?: unknown }> = {
    rl: { type: 'rooms.list', name: '방 목록', parent: null },
    r1: { type: 'rooms.room', name: '1실', parent: 'rl' },
    r2: { type: 'rooms.room', name: '2실', parent: 'rl' },
    r3: { type: 'rooms.room', name: '3실', parent: 'rl' },
    rX: { type: 'rooms.room', name: '버린 방', parent: 'rl', trashed: true },
    yl: { type: 'school.year', name: '2026학년도', parent: null, data: { fields: toRooms } },
    c1: { type: 'school.class', name: '1반', parent: 'yl', data: { values: { f_room: ['r1'] } } },
    c2: { type: 'school.class', name: '2반', parent: 'yl', data: { values: { f_room: ['r1', 'r2'] } } },
    c3: { type: 'school.class', name: '3반', parent: 'yl' },
    c4: { type: 'school.class', name: '4반', parent: 'yl', data: { values: { f_room: ['rX'] } } },
    ol: { type: 'other.list', name: '딴 목록', parent: null, data: { fields: [] } },
    o1: { type: 'other.item', name: '딴 줄', parent: 'ol' },
    bs: { type: 'cal.store', name: '예약', parent: null, data: { fields: toRooms } },
    b1: { type: 'cal.ev', name: '가', parent: 'bs', data: { values: { f_room: ['c2>r2'] } } },
    b2: { type: 'cal.ev', name: '나', parent: 'bs', data: { values: { f_room: ['c1'] } } },
    b3: { type: 'cal.ev', name: '다', parent: 'bs', data: { values: { f_room: ['r3'] } } },
};
const pub = (id: string): PublicNode => ({ id, type: nodes[id].type, name: nodes[id].name, children: [], data: nodes[id].data });
const pathOf = (id: string): string[] => (nodes[id] ? [...(nodes[id].parent ? pathOf(nodes[id].parent!) : []), id] : []);
const look: RelationLook = {
    get: (id) => (nodes[id] ? pub(id) : undefined),
    isTrashed: (id) => !!nodes[id]?.trashed,
    path: pathOf,
    liveByType: (t) => Object.keys(nodes).filter((id) => nodes[id].type === t && !nodes[id].trashed).map(pub),
    children: (id) => Object.keys(nodes).filter((k) => nodes[k].parent === id).map(pub),
    parent: (id) => nodes[id]?.parent ?? null,
    find: (pred) => Object.keys(nodes).map(pub).filter(pred),
};

describe('관계 칸 캐스팅', () => {
    it('판정 — 교실 칸 없는 목록은 막고 · 방 하나면 바로 · 여럿이면 고르기 · 비었으면(휴지통만 있어도) 연결', () => {
        expect(castCandidate(look, 'rl', 'o1')).toBe('block');
        expect(castCandidate(look, 'rl', 'nope')).toBe('block');
        expect(castCandidate(look, 'rl', 'r1')).toBe('direct');
        expect(castCandidate(look, 'rl', 'c1')).toBe('direct');
        expect(castCandidate(look, 'rl', 'c2')).toBe('pick');
        expect(castCandidate(look, 'rl', 'c3')).toBe('empty');
        expect(castCandidate(look, 'rl', 'c4')).toBe('empty');
    });
    it('후보 — 방 목록을 가리키는 칸이 있는 목록의 줄만(딴 목록은 안 뜬다)', () => {
        const ids = castCandidates(look, 'rl').map((c) => `${c.id}:${c.kind}`);
        expect(ids).toEqual(expect.arrayContaining(['c1:direct', 'c2:pick', 'c3:empty', 'c4:empty']));
        expect(ids.some((x) => x.startsWith('o1'))).toBe(false);
    });
    it('값 꼴 — 「줄 id」 또는 「줄 id>고른 방」 왕복', () => {
        expect(parseRelationEntry(relationEntry('c2', 'r2'))).toEqual({ id: 'c2', via: 'r2' });
        expect(parseRelationEntry(relationEntry('c1'))).toEqual({ id: 'c1' });
    });
    it('읽을 때 따라간다 — 옛 값 그대로 · 반은 유일한 방 · 고른 방 · 끊긴 것은 뺀다', () => {
        expect(resolveRelationTargets(look, 'rl', ['r3'])).toEqual(['r3']);
        expect(resolveRelationTargets(look, 'rl', ['c1'])).toEqual(['r1']);
        expect(resolveRelationTargets(look, 'rl', ['c2>r2'])).toEqual(['r2']);
        expect(resolveRelationTargets(look, 'rl', ['c2>r3', 'o1', 'rX', 'c3'])).toEqual([]);
    });
    it('칩 이름 — 반은 반 그대로, 고른 방은 「반 · 방」 · 막힌 줄은 사라진 항목', () => {
        expect(resolveRelation(look, { kind: 'db', nodeId: 'rl' }, ['c1', 'c2>r2', 'o1'])).toEqual([
            { id: 'c1', name: '1반' }, { id: 'c2>r2', name: '2반 · 2실' }, { id: 'o1', name: null },
        ]);
    });
    it('거꾸로 보기 — 방을 가리키는 것 여럿 그대로(반 경유 포함)', () => {
        expect(relationReferrers(look, 'r1')).toEqual([{ id: 'c1', key: 'f_room' }, { id: 'c2', key: 'f_room' }, { id: 'b2', key: 'f_room' }]);
        expect(relationReferrers(look, 'r2')).toEqual([{ id: 'c2', key: 'f_room' }, { id: 'b1', key: 'f_room' }]);
    });
});

describe('꾸러미 기본 칸(baseFields)에 있는 관계 칸도 캐스팅 판정에 든다', () => {
    it('노드 data.fields 에 칸이 없어도 kit 의 baseFields 의 관계 칸으로 판정', () => {
        registerKit({ config: { listType: 'pk.list', itemType: 'pk.item', baseFields: [{ key: 'name', label: '이름', type: 'text' }, ...toRooms] } as never, setValue: () => {}, addItem: () => '' });
        nodes.pl = { type: 'pk.list', name: '꾸러미 목록', parent: null, data: {} };
        nodes.p1 = { type: 'pk.item', name: '꾸러미 줄', parent: 'pl', data: { values: { f_room: ['r3'] } } };
        try {
            expect(castCandidate(look, 'rl', 'p1')).toBe('direct');
            expect(resolveRelationTargets(look, 'rl', ['p1'])).toEqual(['r3']);
        } finally { delete nodes.pl; delete nodes.p1; }
    });
});
