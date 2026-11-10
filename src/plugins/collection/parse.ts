import { parseClipboard } from '../../pane-ui-system/clipboard-tsv';

/**
 * 붙여 넣기 파서 — 엑셀·한글 표에서 복사한 텍스트(탭·줄바꿈 구분)를 칸 값 줄들로 바꾼다.
 *   🔴 규칙(요구명세): 열 i = keys[i] 칸(첫 칸이 제목) · 남는 열은 버린다 · 빈 줄 무시 · 제목이 빈(공백뿐인) 줄 무시 · 줄끝 CRLF/CR/LF 섞여도 같게.
 *   ⛔ 노드·저장을 모른다 — 순수 함수(테스트가 바로 잰다). define.ts 가 이 결과를 받아 항목으로 만든다.
 */
export function parseRows(text: string, keys: readonly string[]): Record<string, string>[] {
    const out: Record<string, string>[] = [];
    for (const cols of parseClipboard(text)) {   // 따옴표 칸("가\n나")은 공용 파서가 한 칸으로 묶는다
        if ((cols[0] ?? '').trim() === '') continue;   // 제목 없는 줄 무시(메모만 있는 줄도)
        const row: Record<string, string> = {};
        keys.forEach((k, i) => { const v = (cols[i] ?? '').trim(); if (v !== '') row[k] = v; });
        out.push(row);
    }
    return out;
}
