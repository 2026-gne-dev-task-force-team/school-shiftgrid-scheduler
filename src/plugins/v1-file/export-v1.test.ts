/**
 * F10b 끝 판정 — 지어낸 샘플 학교(v1 샘플) → importV1 → 저장(정본 쓰기 목록 + 따로 둔 것 + 편성안) → exportV1 → 처음과 같은가.
 *   ⛔ 실자료 0 — 이름은 전부 지어낸 것.
 *   「저장」= 정본에 쓴 것을 buildSolverInput 으로 다시 읽는 것(F10a 시험과 같은 방식) · 편성안은 담은 그대로 고른 것으로 친다.
 */
import { describe, it, expect } from 'vitest';
import { importV1, V1_HOMEROOM_ID } from './import-v1';
import { exportV1, v1FileName, v1FileText, V1_FILE_EXT } from './export-v1';
import { extractExtras, emptyExtras } from './extras';
import { normalizeExtras } from './extras-store';
import { diffV1 } from './diff-v1';
import { buildSolverInput } from '../timetable-solver/build-context';
import { migrateDoc } from '../timetable-solver/types/doc';
import { toWeekday, toDayIndex } from '../timetable-solver/day';
import { clockApi } from '../bell/clock';
import { dutyApi } from '../duty/api';
import { sampleDoc } from '../v1-editor/legacy/io/sample';

const mods = { solver: { toWeekday }, clock: clockApi };
const fresh = () => migrateDoc(JSON.parse(JSON.stringify(sampleDoc())));

/** 가져오기 → 저장 → 다시 읽기 → 내보내기. 저장 사이에 JSON 을 거쳐 참조 공유를 끊는다. */
function roundTrip(original = fresh()) {
    const r = importV1(original, mods);
    const hrOf = (classId: string) => r.writes.staff.find((s) => s.kind === 'homeroom' && s.homeroomClassIds?.includes(classId))?.id;
    const x = extractExtras(original, mods, hrOf, '가져온 안', new Date('2099-01-01T00:00:00Z'));
    const stored = JSON.parse(JSON.stringify({ extras: x.extras, plan: x.plan }));
    const { input } = buildSolverInput(r.writes, { clock: clockApi, duty: dutyApi });
    const out = exportV1(input, { solver: { toDayIndex }, plan: stored.plan, extras: normalizeExtras(stored.extras) });
    return { original, r, x, out };
}

describe('F10b 왕복 — 샘플 학교', () => {
    const { original, r, x, out } = roundTrip();

    it('샘플에 왕복이 시험할 거리가 있다(협력 교사·담임 센티널·고정 배치)', () => {
        expect(original.demands.some((d) => d.coAgentId)).toBe(true);
        expect(original.assignments.some((a) => a.agentId === V1_HOMEROOM_ID)).toBe(true);
        expect(original.assignments.length).toBeGreaterThan(0);
    });
    it('편성안에 배치가 담기고 정본에 칸 없던 것은 따로 남는다', () => {
        expect(x.plan?.placements.length).toBe(original.assignments.length - x.skipped);
        expect(Object.keys(x.extras.demands).length).toBeGreaterThan(0);
    });
    it('처음 파일과 다시 내보낸 파일의 다른 칸 목록 = 빈 목록', () => {
        expect(out.issues).toEqual([]);
        // 규칙은 샘플이 비워 두고 화면이 기본값을 채운다 — 정본 입력도 비어 있다
        expect(diffV1(original, out.doc)).toEqual([]);
        void r;
    });
    it('파일 글로 만들어 읽으면(migrateDoc) 다시 같다', () => {
        expect(diffV1(original, migrateDoc(JSON.parse(v1FileText(out.doc))))).toEqual([]);
    });
});

describe('F10b 왕복 — 이음매', () => {
    it('편성안을 안 고르면 배치 없는 파일(나머지는 같다)', () => {
        const { original, r, x } = roundTrip();
        const { input } = buildSolverInput(r.writes, { clock: clockApi, duty: dutyApi });
        const { doc } = exportV1(input, { solver: { toDayIndex }, plan: null, extras: x.extras });
        expect(doc.assignments).toEqual([]);
        expect(diffV1({ ...original, assignments: [] }, doc)).toEqual([]);
    });
    it('정본에 있는 칸이 이긴다 — 따로 둔 값이 정본을 덮지 않는다', () => {
        const { original, r, x } = roundTrip();
        const { input } = buildSolverInput(r.writes, { clock: clockApi, duty: dutyApi });
        input.demands[0].count = 99;
        const { doc } = exportV1(input, { solver: { toDayIndex }, plan: x.plan, extras: x.extras });
        expect(doc.demands[0].count).toBe(99);
        expect(original.demands[0].count).not.toBe(99);
    });
    it('편성안 칸이 시간 틀에 없으면 빼고 이유를 낸다', () => {
        const { r, x } = roundTrip();
        const { input } = buildSolverInput(r.writes, { clock: clockApi, duty: dutyApi });
        const plan = structuredClone(x.plan)!;
        plan.placements[0].period = 99;
        const out = exportV1(input, { solver: { toDayIndex }, plan, extras: x.extras });
        expect(out.issues.length).toBe(1);
    });
    it('따로 둔 값이 깨져 있어도 빈 것으로 읽는다', () => {
        expect(normalizeExtras({ version: 2 })).toEqual(emptyExtras());
        expect(normalizeExtras(null)).toEqual(emptyExtras());
    });
    it('파일 이름은 <학교>-<날짜> + 확장자 · 못 쓰는 글자는 뺀다', () => {
        expect(v1FileName('가상/초등:학교', new Date(2099, 2, 5))).toBe(`가상초등학교-20990305${V1_FILE_EXT}`);
        expect(v1FileName('', new Date(2099, 11, 25))).toBe(`시간표-20991225${V1_FILE_EXT}`);
    });
});

describe('F10b 가져올 때 담기', () => {
    it('따로 둘 것은 저장 · 배치는 편성안 약속으로 담는다', async () => {
        const { saveImportExtras } = await import('./import-extras');
        const original = fresh();
        const r = importV1(original, mods);
        const store = new Map<string, unknown>();
        const saved: unknown[] = [];
        const host = { store: { get: async (k: string, f: unknown) => store.get(k) ?? f, set: async (k: string, v: unknown) => { store.set(k, v); return true; } } };
        const out = await saveImportExtras(host as never, original, r, { solver: { toWeekday }, plans: { version: 1, savePlan: (p: unknown) => { saved.push(p); return 'plan-1'; } } as never }, '가져온 안');
        expect(out).toMatchObject({ planId: 'plan-1', savedOk: true });
        expect(saved.length).toBe(1);
        expect(store.has('v1-extras')).toBe(true);
    });
});
