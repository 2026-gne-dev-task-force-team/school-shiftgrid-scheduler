/**
 *   📌 약속 플러그인 contract-export — 내용은 e38940a 그대로(쥔님 검토 전 초안 · 2026-11-08 14:59 「리버트」).
 *      구조만 바꿨다: import 자리(contract-*) · 공용 시각 낱말은 contract-clock · onChange 인라인.
 * 🔴 인터페이스 「export」 0.1.0 — 표를 종이·엑셀로 내보내고, 엑셀을 읽어 들인다.
 *   시간표 3종 출력 · 근무일지 PDF · 보결 이력 · 명부 엑셀 업로드가 같은 길을 쓴다.
 *   ⭐ 학교 낱말을 모른다 — 표·글·제목만 안다. 「창체 파랑·전담 빨강·과학실 음영」은 소비자가 tone 으로 칠한다.
 *   소비자: host.modules 로 export 모듈을 받는다. ⛔ 값 0.
 */

/** 칸 색 — 흑백 인쇄에서도 갈리게 제공자가 무늬로도 그린다. */
export type CellTone = 'blue' | 'red' | 'shade' | 'muted';

export interface PrintCell {
    text: string;
    tone?: CellTone;
    colSpan?: number;
    rowSpan?: number;
}

export type PrintBlock =
    | { kind: 'heading'; text: string }
    | { kind: 'text'; text: string }
    | { kind: 'table'; head: PrintCell[][]; body: PrintCell[][] }
    | { kind: 'pageBreak' };

export interface PrintDoc {
    title: string;
    orientation: 'portrait' | 'landscape';
    blocks: PrintBlock[];
}

/** 시트 하나 = 이름 + 행(첫 행이 머리글이든 아니든 소비자 몫). 값은 글자·숫자·빈칸. */
export interface SheetData {
    name: string;
    rows: (string | number | null)[][];
}

export interface Export {
    /** 인쇄 미리보기를 연다(브라우저 인쇄 · PDF 로 저장은 사람이 고른다). */
    print(doc: PrintDoc): void;
    /** PDF 파일로 — 근무일지처럼 파일이 필요한 곳. */
    pdf(doc: PrintDoc): Promise<Blob>;
    xlsx(sheets: readonly SheetData[]): Promise<Blob>;
    /** 엑셀 업로드 — 시트들을 행으로 읽는다. 해석은 소비자(roster.importRows 등). */
    readXlsx(file: Blob): Promise<SheetData[]>;
    /** 내려받기 — 🔴 덮어쓰기 없음(브라우저가 이름을 고른다). */
    download(blob: Blob, filename: string): void;
}
