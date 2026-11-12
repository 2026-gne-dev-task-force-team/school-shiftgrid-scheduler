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

/**
 * workflow_dispatch 입력 상한(모두 합쳐 64KB) 안에 들어가게 한 장을 줄인다 — JPEG · 가로 1024 이하 · 품질을 내려가며 맞춘다.
 * 못 맞추면 null (그 장은 온라인 길에서 빠지고, 파일 길에는 원본이 남는다).
 */
export async function shrinkForDispatch(dataUrl: string, limitChars = 56000): Promise<string | null> {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('이미지를 읽지 못했습니다')); img.src = dataUrl; });
    for (const w of [1024, 800, 640, 480]) {
        const s = Math.min(1, w / img.naturalWidth);
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        for (const q of [0.7, 0.55, 0.4]) {
            const out = c.toDataURL('image/jpeg', q);
            if (out.length <= limitChars) return out;
        }
    }
    return null;
}

const stamp = () => new Date().toLocaleString('ko-KR', { hour12: false }).replace(/[^\d]+/g, '-').replace(/-$/, '');
