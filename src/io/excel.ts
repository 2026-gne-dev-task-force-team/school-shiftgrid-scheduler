/**
 * 엑셀 입출력 — 교사별 시수표 한 장이 입구다 (컴시간이 그렇게 한다).
 * ⚠️ 지금은 서명만 있는 스텁이다. 껍데기 판이 xlsx(SheetJS)로 채운다.
 */
import type { Doc } from '../types/doc';
import type { Agent, Track, Activity, Demand } from '../types/schema';

export interface ImportResult {
    agents: Agent[];       // 새로 생긴 교사 (이미 있으면 안 겹침)
    tracks: Track[];
    activities: Activity[];
    demands: Demand[];
    errors: string[];      // 사람이 읽을 문장. 비어 있으면 성공
}

/** 시수표 엑셀(바이트) → Doc 에 넣을 조각들. Doc 은 안 바꾼다 */
export function parseDemandsWorkbook(_bytes: Uint8Array, _doc: Doc): ImportResult {
    return { agents: [], tracks: [], activities: [], demands: [], errors: ['엑셀 불러오기는 아직 준비 중입니다'] };
}

/** 이 학교의 반·과목이 미리 채워진 빈 시수표 양식 */
export function blankWorkbook(_doc: Doc): Uint8Array {
    return new Uint8Array();
}

/** 완성된 시간표를 엑셀로 (전담별·반별·특별실별 시트 3장) */
export function exportTimetableWorkbook(_doc: Doc): Uint8Array {
    return new Uint8Array();
}
