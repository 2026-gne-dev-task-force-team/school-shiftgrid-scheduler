/**
 * 관계 칸 — 값 직렬화 · 사라진 항목(휴지통·없음·대상 밖) · many=false 면 하나 · 대상 바꾸면 값은 남고 「사라진 항목」.
 *   노드 시스템은 가짜(RelationLook)로 채운다.
 */
import { describe, it, expect } from 'vitest';
import type { PublicNode } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import { ROW_TYPE } from '../schema';
import { BUILTIN_FIELD_TYPES } from './builtin';
import { relationCandidates, relationConfig, relationFromText, relationIds, relationText, resolveRelation, toggleRelation, type RelationLook } from './relation';

// 나무: dbA ─ a1, a2(─ a2c 하위 항목) · dbB ─ b1 · trash ─ a3(원래 dbA)
// + 방 꼴(defineCollection) 목록: rl ─ r1(본관), r2(3층 · parentId r1), r3(음악실 · parentId r2), rX(휴지통) · rl 안 납작
const nodes: Record<string, { type: string; name: string; path: string[]; trashed?: boolean; data?: unknown }> = {
    dbA: { type: 'collection.db', name: 'A', path: ['dbA'] },
    a1: { type: ROW_TYPE, name: '첫째', path: ['dbA', 'a1'] },
    a2: { type: ROW_TYPE, name: '', path: ['dbA', 'a2'] },
    a2c: { type: ROW_TYPE, name: '하위', path: ['dbA', 'a2', 'a2c'] },
    dbB: { type: 'collection.db', name: 'B', path: ['dbB'] },
    b1: { type: ROW_TYPE, name: '비', path: ['dbB', 'b1'] },
    a3: { type: ROW_TYPE, name: '버린 것', path: ['trash', 'a3'], trashed: true },
    rl: { type: 'rooms.list', name: '방 목록', path: ['rl'] },
    r1: { type: 'rooms.room', name: '본관', path: ['rl', 'r1'] },
    r2: { type: 'rooms.room', name: '3층', path: ['rl', 'r2'], data: { parentId: 'r1' } },
    r3: { type: 'rooms.room', name: '음악실', path: ['rl', 'r3'], data: { parentId: 'r2' } },
    rX: { type: 'rooms.room', name: '버린 방', path: ['rl', 'rX'], trashed: true },
};
const pub = (id: string): PublicNode => ({ id, type: nodes[id].type, name: nodes[id].name, children: [], data: nodes[id].data });
const parentOf = (id: string): string | null => { const p = nodes[id]?.path ?? []; return p.length > 1 ? p[p.length - 2] : null; };
const look: RelationLook = {
    get: (id) => (nodes[id] ? pub(id) : undefined),
    isTrashed: (id) => !!nodes[id]?.trashed,
    path: (id) => nodes[id]?.path ?? [],
    liveByType: (t) => Object.keys(nodes).filter((id) => nodes[id].type === t && !nodes[id].trashed).map(pub),
    children: (id) => Object.keys(nodes).filter((k) => parentOf(k) === id).map(pub),
    parent: parentOf,
};
const toA = { target: { kind: 'db', nodeId: 'dbA' }, many: true };
const field = { key: 'f_r', label: '관계', type: 'relation', config: toA };

describe('관계 칸', () => {
    it('레지스트리에 올라 있고 값은 노드 id[] — JSON 왕복해도 같다', () => {
        const def = BUILTIN_FIELD_TYPES.find((d) => d.type === 'relation')!;
        expect(def.Config).toBeTypeOf('function');
        const v = relationIds(['a1', 'a2', 'a1', ''], toA);
        expect(v).toEqual(['a1', 'a2']);
        expect(relationIds(JSON.parse(JSON.stringify(v)), toA)).toEqual(v);
        expect(def.isEmpty!([], toA)).toBe(true);
    });
    it('설정 정규화 — 틀린 target 은 버리고 many 기본 true · source 는 꼴만 산다', () => {
        expect(relationConfig(undefined)).toEqual({ target: undefined, many: true });
        expect(relationConfig({ target: { kind: 'db' }, many: false })).toEqual({ target: undefined, many: false });
        expect(relationConfig({ target: { kind: 'source', id: 'people' } }).target).toEqual({ kind: 'source', id: 'people' });
    });
    it('후보 = 대상 db 안 살아 있는 행(하위 항목 포함 · 휴지통·다른 db 제외) · 이름 없으면 「제목 없음」', () => {
        expect(relationCandidates(look, toA.target as never)).toEqual([
            { id: 'a1', name: '첫째', path: [] }, { id: 'a2', name: '제목 없음', path: [] }, { id: 'a2c', name: '하위', path: ['제목 없음'] },
        ]);
        expect(relationCandidates(look, { kind: 'source', id: 'x' })).toEqual([]);
        expect(relationCandidates(null, toA.target as never)).toEqual([]);
    });
    it('사라진 항목 — 휴지통·없는 id 는 name=null 이고 값은 그대로 · 글자에선 건너뛴다', () => {
        const ids = ['a1', 'a3', 'gone'];
        expect(resolveRelation(look, toA.target as never, ids)).toEqual([
            { id: 'a1', name: '첫째' }, { id: 'a3', name: null }, { id: 'gone', name: null },
        ]);
        expect(relationText(ids, toA, look)).toBe('첫째');
        expect(relationIds(ids, toA)).toEqual(ids);
    });
    it('many=false 면 하나만 — 값·고르기·붙여넣기 모두', () => {
        const one = { ...toA, many: false };
        expect(relationIds(['a1', 'a2'], one)).toEqual(['a1']);
        expect(toggleRelation(['a1'], 'a2', false)).toEqual(['a2']);
        expect(toggleRelation(['a1'], 'a1', false)).toEqual([]);
        expect(toggleRelation(['a1'], 'a2', true)).toEqual(['a1', 'a2']);
        expect(toggleRelation(['a1', 'a2'], 'a1', true)).toEqual(['a2']);
        expect(relationFromText('첫째, 하위', one, look)).toEqual(['a1']);
        expect(relationFromText('첫째, 하위, 모름, b1', toA, look)).toEqual(['a1', 'a2c']);
    });
    it('대상을 바꾸면 값은 남고 옛 대상 항목은 「사라진 항목」 — 되돌리면 다시 보인다', () => {
        const toB = { target: { kind: 'db' as const, nodeId: 'dbB' }, many: true };
        expect(resolveRelation(look, toB.target, ['a1', 'b1'])).toEqual([{ id: 'a1', name: null }, { id: 'b1', name: '비' }]);
        expect(resolveRelation(look, relationConfig(field.config).target, ['a1'])).toEqual([{ id: 'a1', name: '첫째' }]);
    });
    it('설계 4-2: 범용 db 가 아닌 컬렉션(방 목록)도 — 레코드 타입 무관 · 휴지통 제외 · 경로는 parentId 사슬(바깥 → 안)', () => {
        const toRooms = { kind: 'db' as const, nodeId: 'rl' };
        expect(relationCandidates(look, toRooms)).toEqual([
            { id: 'r1', name: '본관', path: [] }, { id: 'r2', name: '3층', path: ['본관'] }, { id: 'r3', name: '음악실', path: ['본관', '3층'] },
        ]);
        expect(resolveRelation(look, toRooms, ['r3', 'rX', 'a1'])).toEqual([{ id: 'r3', name: '음악실' }, { id: 'rX', name: null }, { id: 'a1', name: null }]);
        expect(relationCandidates(look, { kind: 'db', nodeId: 'dbA' }).some((c) => c.id.startsWith('r'))).toBe(false);
    });
});
