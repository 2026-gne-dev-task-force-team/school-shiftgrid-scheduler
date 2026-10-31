/**
 * host.doc 다리 — 플러그인이 받는 문서 창구. 자기 칸 격리 · 이벤트 · 더티.
 * 🔴 「doc.plugins 를 플러그인이 통째로 받는 실수」(남의 몫 지움)를 막는지 검산한다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { makeHost, setDocBridge } from '../pane-ui-system/plugin';
import { initDoc, createNewDoc, getDocState, loadDocText, serializeDoc } from './document';

beforeEach(() => {
    try { localStorage.clear(); } catch { /* noop */ }
    initDoc();            // 다리 꽂기(없으면 host.doc 은 무동작)
    createNewDoc('테스트 문서');
});

describe('host.doc.set/get — 자기 칸만', () => {
    it('제 칸을 쓰고 읽는다 · 더티가 오른다', () => {
        const h = makeHost('p1');
        expect(h.doc.get()).toBeUndefined();
        h.doc.set({ text: '안녕' });
        expect(h.doc.get()).toEqual({ text: '안녕' });
        expect(getDocState().doc.plugins.p1).toEqual({ text: '안녕' });
        expect(getDocState().dirty).toBe(true);
    });

    it('🔴 다른 플러그인이 써도 내 칸은 안 건드린다', () => {
        const a = makeHost('a');
        const b = makeHost('b');
        a.doc.set({ keep: 1 });
        b.doc.set({ other: 2 });
        expect(a.doc.get()).toEqual({ keep: 1 });   // 🔴 b 가 써도 a 보존
        expect(b.doc.get()).toEqual({ other: 2 });
    });

    it('meta 는 읽기만 — 이름을 준다', () => {
        const h = makeHost('p1');
        expect(h.doc.meta()?.name).toBe('테스트 문서');
    });
});

describe('host.doc.on — 바뀜을 듣는다', () => {
    it('change 가 set 마다 울리고, dispose 하면 멈춘다', () => {
        const h = makeHost('p1');
        let n = 0;
        const d = h.doc.on('change', () => { n += 1; });
        h.doc.set({ v: 1 });
        h.doc.set({ v: 2 });
        expect(n).toBe(2);
        d.dispose();
        h.doc.set({ v: 3 });
        expect(n).toBe(2);               // 🔴 뗀 뒤엔 안 울린다
        expect(h.doc.get()).toEqual({ v: 3 });
    });

    it('open 은 새 문서·파일을 앉힐 때 울린다', () => {
        const h = makeHost('p1');
        let opened = 0;
        h.doc.on('open', () => { opened += 1; });
        createNewDoc('딴 문서');
        expect(opened).toBe(1);
    });
});

describe('다리가 없으면 host.doc 은 안전하게 무동작', () => {
    it('setDocBridge(null) 뒤엔 get=undefined · set 은 조용', () => {
        setDocBridge(null);
        const h = makeHost('p1');
        expect(h.doc.get()).toBeUndefined();
        expect(() => h.doc.set({ x: 1 })).not.toThrow();
        expect(h.doc.meta()).toBeUndefined();
    });
});

describe('왕복 — 플러그인 칸 + legacy 가 열고 저장해도 그대로', () => {
    it('옛 파일을 열어 메모를 쓰고 저장·재열기 하면 둘 다 남는다', () => {
        const v1 = JSON.stringify({ meta: { name: '옛학교' }, tracks: [{ id: 't1' }], assignments: [{ a: 1 }, { a: 2 }] });
        loadDocText(v1, 'old.shiftgrid.json');
        const h = makeHost('demo');
        h.doc.set({ text: '메모' });
        const text = serializeDoc(getDocState().doc);
        loadDocText(text, '다시.shiftgrid.json');
        expect(getDocState().doc.plugins.demo).toEqual({ text: '메모' });   // 플러그인 몫
        expect((getDocState().doc.legacy as { tracks: unknown[] }).tracks).toHaveLength(1);
        expect((getDocState().doc.legacy as { assignments: unknown[] }).assignments).toHaveLength(2);  // legacy 통째
    });
});
