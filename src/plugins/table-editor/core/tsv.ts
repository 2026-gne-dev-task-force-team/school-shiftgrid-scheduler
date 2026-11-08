/**
 * TSV 왕복 — 엔진·손님이 같은 규칙으로 복붙을 다룬다. TableApi.parseClipboard/toTsv 가 이걸 내놓는다.
 *   탭 = 칸, 줄바꿈(\n·\r\n) = 행.
 *   🔴 M2(붙여넣기 매트릭스) — 엑셀·구글 시트가 칸 안 줄바꿈을 큰따옴표로 감싸(`"줄1\n줄2"`) 보내므로,
 *      따옴표 안 줄바꿈·탭·따옴표(`""` → `"`)를 보존해 파싱한다. 생성(toTsv)도 같은 규칙으로 되돌린다.
 */

/** 큰따옴표가 하나라도 있으면 상태기로 파싱, 없으면 빠른 split 로. (대부분은 빠른 길) */
function needsQuoteParse(text: string): boolean {
    return text.includes('"');
}

/** TSV 글자 → 2차원 칸 배열. 꼬리 빈 줄 하나는 버린다(엑셀 복사가 흔히 붙인다). */
export function parseClipboard(text: string): string[][] {
    // CRLF → LF 로 고르고(따옴표 밖에서만 의미 있다 — 아래 상태기는 \r 을 글자로 안 본다).
    const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!needsQuoteParse(src)) {
        const body = src.replace(/\n$/, '');
        if (body === '') return [[]];
        return body.split('\n').map((line) => line.split('\t'));
    }

    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    const n = src.length;
    while (i < n) {
        const ch = src[i];
        if (inQuotes) {
            if (ch === '"') {
                if (src[i + 1] === '"') { field += '"'; i += 2; continue; }  // `""` → 리터럴 따옴표
                inQuotes = false; i++; continue;                              // 닫는 따옴표
            }
            field += ch; i++; continue;                                       // 따옴표 안: 탭·줄바꿈도 글자
        }
        if (ch === '"' && field === '') { inQuotes = true; i++; continue; }    // 칸 머리의 따옴표만 여는 따옴표
        if (ch === '\t') { row.push(field); field = ''; i++; continue; }
        if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
        field += ch; i++;
    }
    row.push(field);
    rows.push(row);
    // 꼬리 빈 줄 하나 버리기(마지막이 칸 하나짜리 빈 줄일 때).
    if (rows.length > 1) {
        const last = rows[rows.length - 1];
        if (last.length === 1 && last[0] === '') rows.pop();
    }
    if (rows.length === 1 && rows[0].length === 1 && rows[0][0] === '') return [[]];
    return rows;
}

/** 한 칸을 TSV 조각으로 — 탭·줄바꿈·따옴표가 있으면 큰따옴표로 감싸고 안쪽 따옴표를 겹친다. */
function quoteCell(s: string): string {
    if (s.includes('\t') || s.includes('\n') || s.includes('"')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

/** 2차원 칸 배열 → TSV 글자. 칸 안 탭·줄바꿈은 따옴표로 보존한다(엑셀 왕복). */
export function toTsv(cells: string[][]): string {
    return cells.map((row) => row.map(quoteCell).join('\t')).join('\n');
}
