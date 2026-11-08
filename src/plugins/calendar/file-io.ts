/**
 * 파일 고르기·내려받기 — 브라우저 DOM 한 줄짜리(가져오기·내보내기 명령이 쓴다). 순수 아님(document).
 *   🔴 ⛔ window.prompt/confirm 안 씀 — 숨은 <input type=file> 와 <a download> 뿐이다.
 */

/** .ics 파일 하나를 고르게 하고, 고르면 내용(텍스트)과 파일 이름을 넘긴다. 안 고르면 아무 일 없음. */
export function pickIcsFile(onText: (text: string, fileName: string) => void): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ics,text/calendar';
    input.style.display = 'none';
    input.onchange = () => {
        const f = input.files?.[0];
        if (f) f.text().then((t) => onText(t, f.name)).catch(() => { /* 읽기 실패는 조용히 */ });
    };
    input.click();
}

/** 텍스트를 .ics 파일로 내려받게 한다. */
export function downloadText(fileName: string, content: string, mime = 'text/calendar;charset=utf-8'): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
