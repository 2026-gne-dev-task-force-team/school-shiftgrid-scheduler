/** 칸 서식 저장꼴의 열쇠 — 데이터(rowId·key) 기준이라 정렬·행 이동에도 안 흔들린다. */
export const fmtKey = (rowId: string, key: string): string => `${rowId}|${key}`;
