/**
 * v1 → v2 변환 시험 — 🔴 들고 있는 항목이 하나도 안 사라지는지(개수 대조)가 핵심이다.
 * 설계 [[시간표 짜기 v2 설계]] 「모르는 게 나와도 버리지 마라 · 개수 안 맞으면 저장 막기」.
 */
import { describe, it, expect } from 'vitest';
import { sampleDoc } from '../io/sample';
import { migrateV1ToV2, countSourceItems, verifyProjectIntegrity } from './migrate';
import type { Project } from './model';

describe('v1 → v2 변환', () => {
    it('반 수만큼 표가 생긴다', () => {
        const v1 = sampleDoc();
        const { project } = migrateV1ToV2(v1);
        expect(project.sheets).toHaveLength(v1.tracks.length);
        expect(project.sheets[0].name).toBe(v1.tracks[0].name); // 이름 = 반 이름
    });

    it('🔴 변환 전후 항목 수가 정확히 같다(한 항목도 안 사라진다)', () => {
        const v1 = sampleDoc();
        const src = v1 as unknown as Record<string, unknown>;
        const { report } = migrateV1ToV2(v1);
        expect(report.sourceTotal).toBe(countSourceItems(src));
        // 표(=반) + 보관 = 원본 전체
        expect(report.heldTotal).toBe(report.sourceTotal);
        expect(report.ok).toBe(true);
    });

    it('🔴 배치·수요·규칙 등은 버리지 않고 legacy 에 통째로 보관한다', () => {
        const v1 = sampleDoc();
        const { project, report } = migrateV1ToV2(v1);
        expect(project.legacy).not.toBeNull();
        // legacy 는 원본 그대로 — 배열 길이가 하나도 안 줄었다
        const legacy = project.legacy as Record<string, unknown>;
        expect((legacy.assignments as unknown[]).length).toBe(v1.assignments.length);
        expect((legacy.demands as unknown[]).length).toBe(v1.demands.length);
        expect((legacy.agents as unknown[]).length).toBe(v1.agents.length);
        // 보관 개수에도 그대로 세어진다
        expect(report.carried.assignments).toBe(v1.assignments.length);
        expect(report.carried.demands).toBe(v1.demands.length);
    });

    it('🔴 모르는(알 수 없는) 배열 키가 와도 버리지 않고 센다', () => {
        const raw = {
            meta: { name: '테스트학교', term: '가', schemaVersion: 3 },
            tracks: [{ kind: 'track', id: 't1', name: '1-1' }],
            specs: [],
            시안후보: [{ a: 1 }, { a: 2 }, { a: 3 }], // v2 가 모르는 종류
        };
        const { project, report } = migrateV1ToV2(raw);
        expect(project.sheets).toHaveLength(1);
        expect(report.carried['시안후보']).toBe(3);
        expect(report.heldTotal).toBe(report.sourceTotal); // 표 1 + 모르는 3 = 원본 4
        expect(report.ok).toBe(true);
        // legacy 에 원본 그대로 남아 있다
        expect((project.legacy as Record<string, unknown>)['시안후보']).toHaveLength(3);
    });

    it('반의 시간 틀은 「복사」된다 — 표마다 제 id 를 갖는다', () => {
        const v1 = sampleDoc();
        const { project } = migrateV1ToV2(v1);
        const ids = project.sheets.map((s) => s.spec.id);
        expect(new Set(ids).size).toBe(ids.length); // 전부 다른 id (공유 아님)
        // 슬롯 모양은 원본 틀과 같다
        const firstTrack = v1.tracks[0];
        const srcSpec = v1.specs.find((s) => s.id === firstTrack.specId)!;
        expect(project.sheets[0].spec.slots).toHaveLength(srcSpec.slots.length);
    });

    it('빈 입력도 안 터진다', () => {
        expect(() => migrateV1ToV2(null)).not.toThrow();
        expect(() => migrateV1ToV2({})).not.toThrow();
        const { project, report } = migrateV1ToV2({});
        expect(project.sheets).toHaveLength(0);
        expect(report.ok).toBe(true);
    });
});

describe('저장 막기 — 무결성 검산', () => {
    it('legacy 반 수보다 표가 적으면(=하나라도 유실) ok=false 가 되어 저장을 막는다', () => {
        // 반 3개짜리 원본을 흉내 낸 legacy 지만 표는 2개만 들고 있는 깨진 상태
        const broken: Project = {
            schemaVersion: 4, name: '', term: '',
            sheets: [{ id: 's1', name: 'a', spec: { id: 'x', name: '', cycleDays: 7, activeDays: [0], dayStart: '09:00', dayEnd: '09:40', slots: [] }, cells: {} },
                     { id: 's2', name: 'b', spec: { id: 'y', name: '', cycleDays: 7, activeDays: [0], dayStart: '09:00', dayEnd: '09:40', slots: [] }, cells: {} }],
            trash: [],
            legacy: { tracks: [{ id: 't1' }, { id: 't2' }, { id: 't3' }] },
        };
        const report = verifyProjectIntegrity(broken);
        expect(report).not.toBeNull();
        expect(report!.ok).toBe(false);
    });

    it('legacy 가 없으면(새 파일) 검산할 것이 없다', () => {
        const fresh: Project = { schemaVersion: 4, name: '', term: '', sheets: [], trash: [], legacy: null };
        expect(verifyProjectIntegrity(fresh)).toBeNull();
    });
});
