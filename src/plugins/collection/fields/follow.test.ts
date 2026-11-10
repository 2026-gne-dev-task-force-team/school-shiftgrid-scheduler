/**
 * 롤업 · 칩에 보일 대상 칸 — 둘 다 resolveRelationTargets 를 거친다(반을 넣은 칸도 방의 값을 읽는다).
 */
import { describe, it, expect } from 'vitest';
import type { PublicNode } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import type { RecordField } from '../contracts/collection';
import type { RelationLook } from './cast';
import { rollupConfig, rollupOf, targetFields } from './follow';
import { resolveRelation, relationConfig } from './relation';

const target = { kind: 'db', nodeId: 'rl' };
const fields: RecordField[] = [{ key: 'f_room', label: '방', type: 'relation', config: { target, many: true } }];
const nodes: Record<string, { type: string; name: string; parent: string | null; data?: unknown }> = {
    rl: { type: 'rooms.list', name: '방 목록', parent: null, data: { fields: [{ key: 'seats', label: '자리', type: 'number' }] } },
    r1: { type: 'rooms.room', name: '1실', parent: 'rl', data: { values: { seats: 20 } } },
    r2: { type: 'rooms.room', name: '2실', parent: 'rl', data: { values: { seats: 30 } } },
    yl: { type: 'school.year', name: '학년도', parent: null, data: { fields } },
    c2: { type: 'school.class', name: '2반', parent: 'yl', data: { values: { f_room: ['r1', 'r2'] } } },
};
const pub = (id: string): PublicNode => ({ id, type: nodes[id].type, name: nodes[id].name, children: [], data: nodes[id].data });
const pathOf = (id: string): string[] => (nodes[id] ? [...(nodes[id].parent ? pathOf(nodes[id].parent!) : []), id] : []);
const look: RelationLook = {
    get: (id) => (nodes[id] ? pub(id) : undefined),
    isTrashed: () => false,
    path: pathOf,
    liveByType: (t) => Object.keys(nodes).filter((id) => nodes[id].type === t).map(pub),
    children: (id) => Object.keys(nodes).filter((k) => nodes[k].parent === id).map(pub),
    parent: (id) => nodes[id]?.parent ?? null,
    find: (pred) => Object.keys(nodes).map(pub).filter(pred),
};
const rowOf = (v: unknown) => ({ f_room: v });

describe('롤업', () => {
    it('옛 값(방 id) · 반 경유 모두 방의 값을 나열한다', () => {
        const cfg = { relationKey: 'f_room', targetKey: 'seats', how: 'list' };
        expect(rollupOf(look, fields, rowOf(['r1']), cfg).texts).toEqual(['20']);
        expect(rollupOf(look, fields, rowOf(['c2']), cfg).texts).toEqual(['20', '30']);   // 반 → 방 두 개
        expect(rollupOf(look, fields, rowOf(['c2>r2']), cfg).texts).toEqual(['30']);
    });
    it('개수 · 합 · 제목', () => {
        const r = rollupOf(look, fields, rowOf(['c2']), { relationKey: 'f_room', targetKey: 'seats', how: 'sum' });
        expect([r.count, r.sum]).toEqual([2, 50]);
        expect(rollupOf(look, fields, rowOf(['c2']), { relationKey: 'f_room' }).texts).toEqual(['1실', '2실']);
    });
    it('관계 칸을 안 골랐거나 없으면 빈 값', () => {
        expect(rollupOf(look, fields, rowOf(['r1']), {}).count).toBe(0);
        expect(rollupOf(look, fields, rowOf(['r1']), { relationKey: 'nope' }).count).toBe(0);
        expect(rollupConfig({ how: 'x' }).how).toBe('list');
    });
    it('보일 수 있는 칸 = 제목 + 사용자 칸', () => {
        expect(targetFields(look, 'rl').map((f) => f.key)).toEqual(['', 'seats']);
    });
});

describe('관계 칸 칩 — 보일 대상 칸', () => {
    it('기본은 제목, show 를 고르면 그 칸 값(반을 넣었으면 방의 값)', () => {
        expect(resolveRelation(look, target as never, ['r1']).map((c) => c.name)).toEqual(['1실']);
        expect(resolveRelation(look, target as never, ['r1', 'c2>r2'], 'seats').map((c) => c.name)).toEqual(['20', '30']);
        expect(relationConfig({ target, show: 'seats' }).show).toBe('seats');
        expect(relationConfig({ target, show: '' }).show).toBeUndefined();
    });
});
