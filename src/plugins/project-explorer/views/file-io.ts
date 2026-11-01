/**
 * 파일 저장·고르기(N5) — 브라우저 파일 창구. 순수 모델(model/transfer.ts)과 분리해 여기만 window·DOM 을 안다.
 *   🔴 저장: showSaveFilePicker 가 있으면 그걸로(취소하면 false), 없으면 다운로드 폴백.
 *   🔴 고르기: showOpenFilePicker 가 있으면 그걸로, 없으면 `<input type=file>`. 고른 파일 텍스트(또는 null).
 */

interface SaveHandle { createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }> }
type SavePicker = (o: unknown) => Promise<SaveHandle>;
interface OpenFile { getFile(): Promise<File> }
type OpenPicker = (o: unknown) => Promise<OpenFile[]>;

/** JSON 텍스트를 파일로 저장 — 저장했으면 true, 사용자가 취소하면 false. */
export async function saveJson(name: string, text: string): Promise<boolean> {
    const w = typeof window !== 'undefined'
        ? (window as unknown as { showSaveFilePicker?: SavePicker })
        : undefined;
    if (w?.showSaveFilePicker) {
        try {
            const handle = await w.showSaveFilePicker({
                suggestedName: name,
                types: [{ description: '프로젝트 탐색기 가지', accept: { 'application/json': ['.json'] } }],
            });
            const ws = await handle.createWritable();
            await ws.write(text);
            await ws.close();
            return true;
        } catch (e) {
            if ((e as { name?: string })?.name === 'AbortError') return false;   // 취소
            // 미지원·권한 거부 → 다운로드로
        }
    }
    download(name, text);
    return true;
}

function download(name: string, text: string): void {
    if (typeof document === 'undefined') return;
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** JSON 파일 하나를 고르게 하고 그 텍스트를 돌려준다 — 취소하면 null. */
export async function pickJsonFile(): Promise<string | null> {
    const w = typeof window !== 'undefined'
        ? (window as unknown as { showOpenFilePicker?: OpenPicker })
        : undefined;
    if (w?.showOpenFilePicker) {
        try {
            const [fh] = await w.showOpenFilePicker({
                multiple: false,
                types: [{ description: '프로젝트 탐색기 가지', accept: { 'application/json': ['.json'] } }],
            });
            if (!fh) return null;
            return await (await fh.getFile()).text();
        } catch (e) {
            if ((e as { name?: string })?.name === 'AbortError') return null;   // 취소
            // 그 밖 → input 폴백
        }
    }
    return pickViaInput();
}

/** `<input type=file>` 폴백 — showOpenFilePicker 가 없는 브라우저(사파리 등). */
function pickViaInput(): Promise<string | null> {
    return new Promise((resolve) => {
        if (typeof document === 'undefined') { resolve(null); return; }
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        let done = false;
        const finish = (v: string | null): void => { if (!done) { done = true; resolve(v); } };
        input.onchange = () => {
            const f = input.files?.[0];
            if (!f) { finish(null); return; }
            f.text().then((t) => finish(t)).catch(() => finish(null));
        };
        // 취소(파일 안 고름)도 흘려보낸다 — 포커스 복귀 때 한 번 더 확인.
        window.addEventListener('focus', () => { setTimeout(() => { if (!input.files?.length) finish(null); }, 300); }, { once: true });
        input.click();
    });
}
