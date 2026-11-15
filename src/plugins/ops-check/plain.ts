import type { Issue } from '../../../shared/check/index.ts';

/** 배열 이름 → 교사가 읽는 이름. 모르는 이름은 원문 그대로. */
const ARRAY_KO: Record<string, string> = {
    agents: '선생님 목록', activities: '활동 목록', resources: '방·자원 목록', specs: '시간 틀 목록',
    tracks: '반 목록', timetables: '시간표 목록', demands: '수업 요구 목록', assignments: '배정 목록',
};
export const arrayKo = (k: string): string => ARRAY_KO[k] ?? k;

/** 검사기 문구는 그대로 두고, 화면에서만 쉬운 말로 바꾼다. 모르는 규칙은 원문 message. */
export function plainText(i: Issue): string {
    if (i.id === 'doc.schema-version') return '이 파일은 시간표 자료 형식(판 3)이 아닙니다.';
    if (i.id === 'doc.array-missing') return `${arrayKo(i.where.replace(/^doc\//, ''))}이 없습니다.`;
    return i.message;
}

export type Row = { kind: 'issue'; issue: Issue } | { kind: 'rest'; n: number };

/** 형식 자체가 틀렸으면(판 불일치) 「없음」 줄은 접어 「그 밖에 n건」 한 줄로. 자세히면 전부. */
export function foldRows(issues: Issue[], detail: boolean): Row[] {
    const wrong = issues.some((i) => i.id === 'doc.schema-version');
    if (detail || !wrong) return issues.map((issue) => ({ kind: 'issue', issue }));
    const rows: Row[] = issues.filter((i) => i.id !== 'doc.array-missing').map((issue) => ({ kind: 'issue', issue }));
    const n = issues.length - rows.length;
    if (n > 0) rows.push({ kind: 'rest', n });
    return rows;
}
