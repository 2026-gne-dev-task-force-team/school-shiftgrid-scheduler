/**
 * 캡처·이미지 도우미 — 외부 라이브러리 0.
 *  · captureScreen(): 브라우저의 화면 공유 API 로 한 프레임을 찍는다(크롬·엣지). 사용자가 창을 고르는 창이 뜬다.
 *  · fileToDataUrl(): 첨부·붙여넣기 이미지를 dataURL 로. 큰 이미지는 가로 1600 으로 줄인다(3 MB 상한).
 */
export interface Shot { name: string; dataUrl: string; }

export const canCaptureScreen = (): boolean =>
    typeof navigator !== 'undefined' && !!navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function';

export async function captureScreen(): Promise<Shot | null> {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false, preferCurrentTab: true } as MediaStreamConstraints);
    try {
        const track = stream.getVideoTracks()[0];
        const video = document.createElement('video');
        video.srcObject = stream; video.muted = true;
        await video.play();
        await new Promise((r) => setTimeout(r, 250));   // 첫 프레임이 들어올 시간
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        canvas.getContext('2d')!.drawImage(video, 0, 0);
        track.stop();
        return shrink(canvas, `화면 캡처 ${stamp()}.png`);
    } finally {
        stream.getTracks().forEach((t) => t.stop());
    }
}

export async function fileToDataUrl(file: File | Blob, name = '첨부 이미지'): Promise<Shot | null> {
    if (!file.type.startsWith('image/')) return null;
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('이미지를 읽지 못했습니다')); img.src = url; });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        return shrink(canvas, name);
    } finally { URL.revokeObjectURL(url); }
}

function shrink(src: HTMLCanvasElement, name: string): Shot {
    const MAX_W = 1600;
    let c = src;
    if (src.width > MAX_W) {
        const s = MAX_W / src.width;
        c = document.createElement('canvas');
        c.width = MAX_W; c.height = Math.round(src.height * s);
        c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
    }
    let dataUrl = c.toDataURL('image/png');
    if (dataUrl.length > 3 * 1024 * 1024 * 1.37) dataUrl = c.toDataURL('image/jpeg', 0.85);
    return { name, dataUrl };
}

const stamp = () => new Date().toLocaleString('ko-KR', { hour12: false }).replace(/[^\d]+/g, '-').replace(/-$/, '');
