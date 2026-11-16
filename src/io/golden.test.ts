/// <reference types="node" />
/**
 * 정답 자료(골든) 시험 — T-10cj · 요청함 R109 ①
 *
 * v1 기초자료 화면을 고치기(R104~R108) 전 동작을 굳힌다. 표본 넷을
 *   불러오기 → 점검 결과(필수 위반·권장 점수·규칙별 위반) → 그대로 내보낸 작업 파일(meta.updatedAt 뺌)
 * 로 돌려, __golden__/expected/ 의 정답과 글자 그대로 같은지 본다.
 *
 *   표본: sample(앱 샘플 학교) · legacy-v2(0.3.4 이전 옛 판) · no-activities(과목 칸 없는 파일) · unused-activities(안 쓰는 과목)
 *   입력 파일: __golden__/inputs/*.json (샘플은 sampleDoc() 을 그대로 씀)
 *
 * 정답 갱신은 UPDATE_GOLDEN=1 일 때만: `UPDATE_GOLDEN=1 npx vitest run src/io/golden.test.ts`
 *   ⚠️ 갱신하는 커밋에는 「왜 바뀌었나」를 적는다. 의도하지 않은 차이면 갱신하지 말고 코드를 본다.
 * ⛔ 자동 배치(solve)는 넣지 않는다 — 느리다(이 기기 5초+). 불러오기·점검·내보내기만.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Doc } from '../types/doc';
import { migrateDoc } from '../types/doc';
import { sampleDoc } from './sample';
import { defaultRules, diagnose, demandStatus } from '../engine/core';

const HERE = dirname(fileURLToPath(import.meta.url));
const INPUTS = join(HERE, '__golden__', 'inputs');
const EXPECTED = join(HERE, '__golden__', 'expected');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

// store.tsx withDefaultRules 와 같은 일 (그 파일은 React 라 여기서 못 부른다) — 규칙이 비면 기본 규칙
function withDefaultRules(d: Doc): Doc {
    if (d.rules.length > 0) return d;
    const r = defaultRules();
    return r.length > 0 ? { ...d, rules: r } : d;
}

/** 앱의 불러오기 길 — 샘플: loadSample · 파일: platform.openFile(migrateDoc(JSON.parse)) → withDefaultRules */
const SAMPLES: { name: string; load: () => Doc }[] = [
    { name: 'sample', load: () => withDefaultRules(sampleDoc()) },
    ...['legacy-v2', 'no-activities', 'unused-activities'].map((name) => ({
        name,
        load: () => withDefaultRules(migrateDoc(JSON.parse(readFileSync(join(INPUTS, `${name}.json`), 'utf8')))),
    })),
];

/** 점검 결과 — 화면(점검·시수표)이 보여 주는 것 */
function checkResult(doc: Doc) {
    const dg = diagnose(doc);
    return {
        hardCount: dg.hardCount,
        softWeight: dg.softWeight,
        rules: dg.rules.map((r) => ({
            ruleId: r.ruleId, templateId: r.templateId, label: r.label, kind: r.kind, bucket: r.bucket ?? null,
            count: r.count, fixableCount: r.fixableCount, subjectCount: r.subjectCount, weight: r.weight,
            violations: r.violations,
        })),
        daysByRule: dg.daysByRule,
        demandStatus: demandStatus(doc),
    };
}

/** 내보내기 — ExportScreen 「작업 파일로 저장」과 같은 JSON.stringify(doc, null, 1) 에서 시각 칸만 뺀다 */
function exportText(doc: Doc): string {
    const o = JSON.parse(JSON.stringify(doc, null, 1));
    if (o.meta) delete o.meta.updatedAt;
    return JSON.stringify(o, null, 1) + '\n';
}

function compare(file: string, actual: string) {
    const path = join(EXPECTED, file);
    if (UPDATE) {
        mkdirSync(EXPECTED, { recursive: true });
        writeFileSync(path, actual);
        return;
    }
    expect(existsSync(path), `정답 파일 없음: ${file} — UPDATE_GOLDEN=1 로 만든다`).toBe(true);
    expect(actual).toBe(readFileSync(path, 'utf8'));
}

describe('정답 자료 (골든) — 불러오기 · 점검 · 내보내기', () => {
    // 결정적으로: 시각·난수 고정
    beforeAll(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-16T00:00:00.000Z'));
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
    });
    afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    for (const s of SAMPLES) {
        describe(s.name, () => {
            it('점검 결과가 정답과 같다', () => {
                compare(`${s.name}.check.json`, JSON.stringify(checkResult(s.load()), null, 1) + '\n');
            });
            it('그대로 내보낸 파일이 정답과 같다 (updatedAt 뺌)', () => {
                compare(`${s.name}.export.json`, exportText(s.load()));
            });
            it('불러오기는 두 번 해도 같다 (결정적)', () => {
                expect(exportText(s.load())).toBe(exportText(s.load()));
            });
        });
    }
});
