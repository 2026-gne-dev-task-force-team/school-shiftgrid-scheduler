/**
 * 붙여 넣기 파서 — 엑셀·한글 표에서 복사한 텍스트(탭·줄바꿈 구분)를 사람 줄들로 바꾼다.
 *   🔴 규칙(요구명세): 첫 칸 = 이름 · 둘째 칸 = 메모 · 셋째 칸부터는 버린다(칸은 이름·메모뿐).
 *      빈 줄 무시 · 이름이 빈(공백뿐인) 줄 무시 · 줄끝 CRLF/CR/LF 섞여도 같게.
 *   ⛔ 노드·저장을 모른다 — 순수 함수(테스트가 바로 잰다). nodes.ts 가 이 결과를 받아 사람으로 만든다.
 */
import type { PersonInput } from './contracts/people';

/** 탭·줄바꿈 텍스트 → 사람 입력 줄들(이름·메모). 빈 줄·이름 없는 줄은 뺀다. */
export function parsePasted(text: string): PersonInput[] {
    const out: PersonInput[] = [];
    // CRLF·CR 을 LF 로 모은 뒤 줄로 가른다(줄끝이 섞여도 같게).
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    for (const line of lines) {
        if (line.trim() === '') continue;          // 빈 줄 무시
        const cols = line.split('\t');
        const name = (cols[0] ?? '').trim();
        if (name === '') continue;                 // 이름 없는 줄 무시(메모만 있는 줄도)
        const memo = (cols[1] ?? '').trim();
        out.push(memo ? { name, memo } : { name });
    }
    return out;
}
