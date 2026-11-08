/**
 * 싱글톤(유일성) 관문 — 모델 한 곳(violatesUnique) 증명(설계 「싱글톤 노드 타입」 · 쥔님 확정 2026-11-08).
 *   순수 모델만 본다(등록 표 없이 uniqueOf 콜백을 직접 준다). createNode·move·restore 가 전부 이 관문을 지난다 —
 *   복제·N5 들여오기는 아직 코드가 없지만 그 둘도 결국 createNode/move 를 타니 이 관문이 구조적으로 덮는다(아래 「복제」 설명).
 *
 * 두 종류:
 *   - 'tree'   나무 전체(휴지통 제외)에 하나 (예: 학교 정보·설정)
 *   - 'parent' 같은 부모 밑에 하나          (예: 시간표마다 「선생님 목록」 하나)
 */
import { describe, it, expect } from 'vitest';
import {
    emptyTree, createNode, move, remove, restore, violatesUnique,
    parentOf, type Tree,
} from './tree';

/** 'app.info' 는 나무에 하나 · 'app.list' 는 부모마다 하나 · 'folder' 는 제한 없음. */
const uniq = (t: string): 'tree' | 'parent' | undefined =>
    t === 'app.info' ? 'tree' : t === 'app.list' ? 'parent' : undefined;

/** 루트·휴지통 + 폴더 둘(f1·f2) 깔린 바탕. */
function base(): Tree {
    let t = emptyTree();
    t = createNode(t, t.root, { id: 'f1', type: 'folder', name: 'f1' });
    t = createNode(t, t.root, { id: 'f2', type: 'folder', name: 'f2' });
    return t;
}

const countType = (t: Tree, type: string): number =>
    Object.values(t.nodes).filter((n) => n.type === type).length;

// ─────────────────────────── violatesUnique 직접 ───────────────────────────

describe('violatesUnique — 규칙 자체', () => {
    it("규칙 없는 타입('folder')은 언제나 위반 아님", () => {
        const t = base();
        expect(violatesUnique(t, 'folder', t.root, null, uniq)).toBe(false);
    });

    it("'tree' — 하나도 없으면 ok, 하나라도 살아 있으면(어느 부모든) 위반", () => {
        let t = base();
        expect(violatesUnique(t, 'app.info', t.root, null, uniq)).toBe(false);
        t = createNode(t, 'f1', { id: 'i1', type: 'app.info', name: '정보' }, uniq);
        // 루트에도 f2 에도 — 나무 어디든 위반
        expect(violatesUnique(t, 'app.info', t.root, null, uniq)).toBe(true);
        expect(violatesUnique(t, 'app.info', 'f2', null, uniq)).toBe(true);
        // 자기 자신은 셈에서 빠진다(옮길 때) — i1 을 옮기는 판정은 ok
        expect(violatesUnique(t, 'app.info', 'f2', 'i1', uniq)).toBe(false);
    });

    it("'parent' — 같은 부모 안에서만 막는다", () => {
        let t = base();
        t = createNode(t, 'f1', { id: 'l1', type: 'app.list', name: '목록' }, uniq);
        expect(violatesUnique(t, 'app.list', 'f1', null, uniq)).toBe(true);    // f1 엔 이미 있다
        expect(violatesUnique(t, 'app.list', 'f2', null, uniq)).toBe(false);   // f2 는 비었다
        expect(violatesUnique(t, 'app.list', 'f1', 'l1', uniq)).toBe(false);   // 자기 제외(재정렬)
    });

    it('🔴 휴지통(또는 그 안)으로 넣는 건 세지도 막지도 않는다', () => {
        let t = base();
        t = createNode(t, 'f1', { id: 'i1', type: 'app.info', name: '정보' }, uniq);
        // 이미 i1 이 있어도 휴지통행은 위반 아님(삭제가 늘 되게)
        expect(violatesUnique(t, 'app.info', t.trash, null, uniq)).toBe(false);
    });

    it('🔴 휴지통 안 노드는 셈에서 빠진다 — 그래서 복원 때 충돌이 난다', () => {
        let t = base();
        t = createNode(t, 'f1', { id: 'i1', type: 'app.info', name: '정보' }, uniq);
        t = remove(t, 'i1');   // i1 이 휴지통으로
        // 밖엔 app.info 가 없다 → 새로 하나 만들 수 있다
        expect(violatesUnique(t, 'app.info', t.root, null, uniq)).toBe(false);
    });
});

// ─────────────────────────── createNode 관문 (= 만들기 · 복제의 모델 경로) ───────────────────────────

describe('createNode 관문', () => {
    it("'tree' — 둘째는 안 생긴다(나무 그대로)", () => {
        let t = base();
        t = createNode(t, t.root, { id: 'i1', type: 'app.info', name: '정보' }, uniq);
        expect(countType(t, 'app.info')).toBe(1);
        const before = t;
        t = createNode(t, 'f1', { id: 'i2', type: 'app.info', name: '정보2' }, uniq);
        expect(t).toBe(before);                 // 🔴 막히면 같은 나무를 그대로 돌려준다
        expect(countType(t, 'app.info')).toBe(1);
    });

    it("'parent' — 같은 부모엔 둘째가 안 생기고, 다른 부모엔 생긴다", () => {
        let t = base();
        t = createNode(t, 'f1', { id: 'l1', type: 'app.list', name: '목록' }, uniq);
        const before = t;
        t = createNode(t, 'f1', { id: 'l2', type: 'app.list', name: '목록2' }, uniq);
        expect(t).toBe(before);                 // f1 둘째 거부
        t = createNode(t, 'f2', { id: 'l3', type: 'app.list', name: '목록3' }, uniq);
        expect(t.nodes.l3).toBeTruthy();        // f2 는 ok
        expect(countType(t, 'app.list')).toBe(2);
    });

    it('🔑 복제의 모델 경로 — parent 유일 노드를 같은 부모로 베끼면(= createNode 같은 타입) 거부', () => {
        // 복제 기능은 이 브랜치에 아직 없다. 복제가 하는 일 = 같은 타입을 같은 부모 밑에 createNode.
        // 그래서 관문이 createNode 에 있으면 복제가 생겨도 저절로 걸린다.
        let t = base();
        t = createNode(t, 'f1', { id: 'l1', type: 'app.list', name: '목록' }, uniq);
        const before = t;
        t = createNode(t, 'f1', { id: 'l1copy', type: 'app.list', name: '목록 사본' }, uniq);
        expect(t).toBe(before);
    });
});

// ─────────────────────────── move 관문 (= 드래그 · 들여오기의 모델 경로) ───────────────────────────

describe('move 관문', () => {
    it("'tree' 유일은 나무 안에서 옮길 수 있다(자기 제외)", () => {
        let t = base();
        t = createNode(t, 'f1', { id: 'i1', type: 'app.info', name: '정보' }, uniq);
        t = move(t, 'i1', 'f2', undefined, undefined, uniq);
        expect(parentOf(t, 'i1')).toBe('f2');
    });

    it("'parent' — 이미 그 타입이 있는 부모로는 못 옮긴다", () => {
        let t = base();
        t = createNode(t, 'f1', { id: 'l1', type: 'app.list', name: '목록1' }, uniq);
        t = createNode(t, 'f2', { id: 'l2', type: 'app.list', name: '목록2' }, uniq);
        const before = t;
        t = move(t, 'l2', 'f1', undefined, undefined, uniq);   // f1 엔 이미 l1
        expect(t).toBe(before);
        expect(parentOf(t, 'l2')).toBe('f2');                  // 안 움직였다
    });

    it("'parent' 유일도 같은 부모 안 재정렬은 된다(자기 제외)", () => {
        let t = base();
        t = createNode(t, 'f1', { id: 'a', type: 'folder', name: 'a' }, uniq);
        t = createNode(t, 'f1', { id: 'l1', type: 'app.list', name: '목록' }, uniq);
        // l1 을 f1 안에서 맨 앞으로 — 같은 부모, 자기 제외라 ok
        t = move(t, 'l1', 'f1', 0, undefined, uniq);
        expect(t.nodes.f1.children[0]).toBe('l1');
    });

    it('🔑 들여오기의 모델 경로 — 들여온 가지를 붙이는 건 move/createNode 라, tree 유일 충돌이면 그 붙이기가 거부된다', () => {
        // N5 들여오기는 이 브랜치에 아직 없다. 들여오기가 하는 일 = 새 노드를 만들고(createNode) 붙인다(move).
        let t = base();
        t = createNode(t, t.root, { id: 'i1', type: 'app.info', name: '정보' }, uniq);
        // 들여온 가지 안에 app.info 가 또 있다고 치고 붙이려 하면(createNode) 거부된다 → 호출자가 「가지 전체 거절」을 할 근거.
        const before = t;
        t = createNode(t, 'f1', { id: 'imported', type: 'app.info', name: '들여온 정보' }, uniq);
        expect(t).toBe(before);
    });
});

// ─────────────────────────── restore 관문 ───────────────────────────

describe('restore 관문 — 충돌하면 복원 거절(휴지통에 남는다)', () => {
    it("'tree' — 밖에 이미 있으면 복원이 거부되고, 밖의 것을 지우면 복원된다", () => {
        let t = base();
        t = createNode(t, 'f1', { id: 'i1', type: 'app.info', name: '정보1' }, uniq);
        t = remove(t, 'i1');                                      // i1 휴지통
        t = createNode(t, t.root, { id: 'i2', type: 'app.info', name: '정보2' }, uniq);  // 밖에 새로

        const before = t;
        t = restore(t, 'i1', uniq);                              // 밖에 i2 가 있어 거부
        expect(t).toBe(before);
        expect(require_inTrash(t, 'i1')).toBe(true);

        t = remove(t, 'i2');                                     // 밖의 것을 치우고
        t = restore(t, 'i1', uniq);                              // 이제 복원된다
        expect(require_inTrash(t, 'i1')).toBe(false);
    });

    it("'parent' — 원래 부모에 이미 같은 타입이 있으면 복원 거부", () => {
        let t = base();
        t = createNode(t, 'f1', { id: 'l1', type: 'app.list', name: '목록1' }, uniq);
        t = remove(t, 'l1');                                     // l1 휴지통(trashedFrom=f1)
        t = createNode(t, 'f1', { id: 'l2', type: 'app.list', name: '목록2' }, uniq);  // f1 에 새 목록

        const before = t;
        t = restore(t, 'l1', uniq);                             // f1 엔 이미 l2 → 거부
        expect(t).toBe(before);
    });
});

/** id 가 휴지통(또는 그 안)에 있나 — 테스트 헬퍼. */
function require_inTrash(t: Tree, id: string): boolean {
    let cur: string | null = id;
    while (cur) {
        if (cur === t.trash) return true;
        cur = parentOf(t, cur);
    }
    return false;
}
