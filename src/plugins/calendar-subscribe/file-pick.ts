/**
 * .ics 파일 고르기 — 브라우저 DOM 한 줄(설정 「파일로 넣기」). 🔴 ⛔ window.prompt/confirm 안 씀(숨은 input 뿐).
 *   달력 꾸러미의 file-io 를 값으로 끌지 않으려 작은 걸 따로 둔다(꾸러미 경계).
 */
export function pickIcsText(onText: (text: string) => void): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ics,text/calendar';
    input.style.display = 'none';
    input.onchange = () => {
        const f = input.files?.[0];
        if (f) f.text().then(onText).catch(() => { /* 읽기 실패는 조용히 */ });
    };
    input.click();
}
