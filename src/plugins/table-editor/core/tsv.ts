/**
 * TSV 왕복 — 엔진·손님이 같은 규칙으로 복붙을 다룬다. TableApi.parseClipboard/toTsv 가 이걸 내놓는다.
 *   M1: 탭 = 칸, 줄바꿈(\n·\r\n) = 행. 따옴표 안 줄바꿈 보존은 M3(붙여넣기 매트릭스)에서.
 */

/** TSV 글자 → 2차원 칸 배열. 꼬리 빈 줄 하나는 버린다(엑셀 복사가 흔히 붙인다). */
export function parseClipboard(text: string): string[][] {
    const body = text.replace(/\r/g, '').replace(/\n$/, '');
    if (body === '') return [[]];
    return body.split('\n').map((line) => line.split('\t'));
}

/** 2차원 칸 배열 → TSV 글자. */
export function toTsv(cells: string[][]): string {
    return cells.map((row) => row.join('\t')).join('\n');
}
