/**
 * 엔진 실물 — api.ts 가 약속한 함수들의 구현이 여기(와 이 폴더의 다른 파일)에 있다.
 * ⚠️ 지금은 자리만 잡은 스텁이다. 엔진 판이 이 파일을 채운다. 서명은 api.ts 를 따른다.
 */
import type { Doc } from '../types/doc';
import type { ConflictRule, TimetableSpec, Violation } from '../types/schema';
import type {
    EngineContext, EngineRule, Diagnosis, CellVerdicts, Move, MovePreview,
    DemandStatus, SolveOptions, SolveProgress, SolveResult, MakeSpecInput,
} from './api';

const todo = (name: string): never => { throw new Error(`엔진 미구현: ${name}`); };

export function buildContext(_doc: Doc): EngineContext { return todo('buildContext'); }
export function evaluateAll(_doc: Doc): Violation[] { return []; }
export function diagnose(_doc: Doc): Diagnosis { return { hardCount: 0, softWeight: 0, rules: [], daysByRule: {} }; }
export function candidateCells(_doc: Doc, assignmentId: string): CellVerdicts { return { assignmentId, cells: {} }; }
export function previewMove(_doc: Doc, _move: Move): MovePreview { return todo('previewMove'); }
export function applyMove(doc: Doc, _move: Move): Doc { return doc; }
export function demandStatus(_doc: Doc): DemandStatus[] { return []; }
export async function solve(_doc: Doc, _opts?: SolveOptions, _onProgress?: (p: SolveProgress) => void): Promise<SolveResult> { return todo('solve'); }
export async function autoAdjust(doc: Doc, opts?: SolveOptions, onProgress?: (p: SolveProgress) => void): Promise<SolveResult> {
    return solve(doc, { ...opts, adjustOnly: true }, onProgress);
}
export const RULES: EngineRule[] = [];
export function defaultRules(): ConflictRule[] { return []; }
export function makeSpec(_input: MakeSpecInput): TimetableSpec { return todo('makeSpec'); }
