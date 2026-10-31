/**
 * 문서 모델 — 순수 변환·검산 테스트.
 * 🔴 「통째로 들고 간다」(모르는 것도 안 버린다)와 무결성 관문이 이 판의 뼈대다 — 두껍게 검산한다.
 */
import { describe, it, expect } from 'vitest';
import {
    DOC_SCHEMA_VERSION, newDoc, countItems, isDocV6, normalizeV6,
    migrateToDoc, parseDocFile, verifyDocIntegrity, setSlice, serializeDoc,
    type Doc,
} from './document';

// v1 꼴 샘플(schemaVersion 없음·tracks/specs/assignments 등) — 호스트는 뜻을 모르고 통째로 보관만 한다
const V1_SAMPLE = {
    meta: { name: '고성초', term: '2026-1' },
    tracks: [{ id: 't1', name: '1-1반', specId: 's1' }, { id: 't2', name: '1-2반', specId: 's1' }],
    specs: [{ id: 's1', slots: [{ start: '09:00' }, { start: '09:50' }] }],
    assignments: [{ a: 1 }, { a: 2 }, { a: 3 }],
    weeklyBlocks: [{ day: 0 }],
    // 🔴 호스트가 모르는 배열 키 — 그래도 버리면 안 된다
    강낭콩모르는것: [{ x: 1 }, { x: 2 }],
};

describe('countItems — 깊이 무관 배열 원소 총수', () => {
    it('빈 값·원시값은 0', () => {
        expect(countItems(null)).toBe(0);
        expect(countItems(42)).toBe(0);
        expect(countItems('hi')).toBe(0);
        expect(countItems({})).toBe(0);
    });
    it('중첩 배열을 전부 센다', () => {
        expect(countItems([1, 2, 3])).toBe(3);
        expect(countItems({ a: [1, 2], b: { c: [3] } })).toBe(3);
        expect(countItems([[1], [2, 3]])).toBe(2 /*바깥*/ + 1 + 2 /*안쪽*/);
    });
    it('V1 샘플의 원소 총수 — tracks2 + specs1 + slots2 + assignments3 + weeklyBlocks1 + 모르는것2 = 11', () => {
        expect(countItems(V1_SAMPLE)).toBe(11);
    });
});

describe('newDoc — 빈 작업대', () => {
    it('schemaVersion 6 · plugins 빈칸 · legacy 없음', () => {
        const d = newDoc('표1');
        expect(d.schemaVersion).toBe(DOC_SCHEMA_VERSION);
        expect(d.meta.name).toBe('표1');
        expect(d.plugins).toEqual({});
        expect('legacy' in d).toBe(false);
        expect(d.meta.createdAt).toBeTruthy();
    });
});

describe('isDocV6 — 지금 판 판별', () => {
    it('plugins 가 있고 schemaVersion 6 이면 참', () => {
        expect(isDocV6(newDoc())).toBe(true);
    });
    it('옛 파일(plugins 없음)·배열 plugins·엉뚱한 값은 거짓', () => {
        expect(isDocV6(V1_SAMPLE)).toBe(false);
        expect(isDocV6({ schemaVersion: 6, plugins: [] })).toBe(false);
        expect(isDocV6({ schemaVersion: 5, plugins: {} })).toBe(false);
        expect(isDocV6(null)).toBe(false);
    });
});

describe('migrateToDoc — 옛 파일을 통째로 legacy 에', () => {
    it('legacy 에 원본이 통째로 들어간다(모르는 키 포함)', () => {
        const { doc } = migrateToDoc(V1_SAMPLE);
        expect(doc.schemaVersion).toBe(6);
        expect(doc.plugins).toEqual({});
        expect(doc.legacy).toEqual(V1_SAMPLE);
        // 🔴 깊은 복제라 원본과 다른 참조여야 한다(원본 변형이 legacy 를 오염시키면 안 됨)
        expect(doc.legacy).not.toBe(V1_SAMPLE);
    });
    it('문서 이름을 옛 meta.name 에서 건진다', () => {
        expect(migrateToDoc(V1_SAMPLE).doc.meta.name).toBe('고성초');
        expect(migrateToDoc({ name: '옛v2' }).doc.meta.name).toBe('옛v2');
        expect(migrateToDoc({ foo: 1 }).doc.meta.name).toBe('불러온 문서');
    });
    it('열 때 무결성 ok (전후 항목 수가 같다)', () => {
        const { report } = migrateToDoc(V1_SAMPLE);
        expect(report.sourceTotal).toBe(11);
        expect(report.heldTotal).toBe(11);
        expect(report.ok).toBe(true);
    });
});

describe('parseDocFile — v6 는 그대로, 옛 파일은 감싼다', () => {
    it('v6 파일은 plugins·legacy 를 통째로 보존하고 report 는 null', () => {
        const src: Doc = {
            schemaVersion: 6,
            meta: { name: '내문서', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
            plugins: { scheduler: { cards: [1, 2] }, 모르는플러그인: { keep: true } },
            legacy: { tracks: [{ id: 't' }] },
        };
        const { doc, report } = parseDocFile(JSON.stringify(src));
        expect(report).toBeNull();
        // 🔴 꺼진·모르는 플러그인의 몫도 그대로
        expect(doc.plugins).toEqual(src.plugins);
        expect(doc.legacy).toEqual(src.legacy);
        expect(doc.meta.name).toBe('내문서');
    });
    it('옛 파일은 legacy 로 감싸고 report 를 준다', () => {
        const { doc, report } = parseDocFile(JSON.stringify(V1_SAMPLE));
        expect(report?.ok).toBe(true);
        expect(doc.legacy).toEqual(V1_SAMPLE);
    });
});

describe('verifyDocIntegrity — 저장 직전 관문', () => {
    it('legacy 가 그대로면 ok', () => {
        const { doc, report } = migrateToDoc(V1_SAMPLE);
        expect(verifyDocIntegrity(doc, report.sourceTotal).ok).toBe(true);
    });
    it('🔴 legacy 를 비우면 막는다(ok=false) — 버그 심기 검산이 겨누는 자리', () => {
        const { doc, report } = migrateToDoc(V1_SAMPLE);
        const emptied: Doc = { ...doc, legacy: {} };
        const v = verifyDocIntegrity(emptied, report.sourceTotal);
        expect(v.heldTotal).toBe(0);
        expect(v.ok).toBe(false);
    });
    it('legacy 의 한 배열만 줄어도 막는다', () => {
        const { doc, report } = migrateToDoc(V1_SAMPLE);
        const legacy = doc.legacy as typeof V1_SAMPLE;
        const shrunk: Doc = { ...doc, legacy: { ...legacy, assignments: legacy.assignments.slice(0, 1) } };
        expect(verifyDocIntegrity(shrunk, report.sourceTotal).ok).toBe(false);
    });
    it('플러그인이 제 칸을 채워도 legacy 무결성은 영향 없다', () => {
        const { doc, report } = migrateToDoc(V1_SAMPLE);
        const filled = setSlice(doc, 'scheduler', { cards: [1, 2, 3, 4, 5] });
        // 🔴 legacy 만 센다 — 플러그인이 아무리 커져도 열 때 기준(sourceTotal)과 같다
        expect(verifyDocIntegrity(filled, report.sourceTotal).ok).toBe(true);
    });
});

describe('setSlice — 자기 칸만 바꾼다', () => {
    const base: Doc = {
        schemaVersion: 6,
        meta: { name: 'x', createdAt: 'a', updatedAt: 'a' },
        plugins: { a: { keep: 1 }, b: { keep: 2 } },
        legacy: { tracks: [{ id: 't' }] },
    };
    it('제 키만 바뀌고 남의 몫·legacy 는 그대로', () => {
        const next = setSlice(base, 'a', { changed: true });
        expect(next.plugins.a).toEqual({ changed: true });
        expect(next.plugins.b).toEqual({ keep: 2 });        // 🔴 남의 몫 보존
        expect(next.legacy).toEqual(base.legacy);           // 🔴 legacy 보존
        expect(base.plugins.a).toEqual({ keep: 1 });        // 원본 불변
    });
    it('새 키를 더해도 기존 칸은 그대로', () => {
        const next = setSlice(base, 'c', [1, 2]);
        expect(next.plugins.c).toEqual([1, 2]);
        expect(next.plugins.a).toEqual({ keep: 1 });
    });
    it('updatedAt 이 갱신된다', () => {
        const next = setSlice(base, 'a', { v: 1 });
        expect(next.meta.updatedAt).not.toBe(base.meta.updatedAt);
    });
});

describe('왕복 — serialize → parse 하면 모든 칸이 그대로', () => {
    it('옛 파일을 열어 저장해도 legacy 바이트 수가 안 줄어든다(무결성)', () => {
        const { doc } = migrateToDoc(V1_SAMPLE);
        const filled = setSlice(doc, 'demo', { text: '메모 한 줄' });
        const text = serializeDoc(filled);
        const { doc: reopened } = parseDocFile(text);
        expect(reopened.legacy).toEqual(V1_SAMPLE);                 // 🔴 통째 보존
        expect(reopened.plugins.demo).toEqual({ text: '메모 한 줄' }); // 🔴 플러그인 몫 보존
        expect(countItems(reopened.legacy)).toBe(countItems(V1_SAMPLE));
    });
    it('normalizeV6 는 모르는 플러그인 칸을 안 지운다', () => {
        const d: Doc = { ...newDoc('t'), plugins: { 모르는: { keep: [1, 2, 3] } } };
        expect(normalizeV6(d).plugins).toEqual(d.plugins);
    });
});
