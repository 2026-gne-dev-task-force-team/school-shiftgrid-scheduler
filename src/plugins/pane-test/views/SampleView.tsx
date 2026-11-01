/**
 * 시험 뷰 — 제 이름 + 눈에 띄는 색 글자(뷰마다 다른 색). 🔴 색은 토큰 클래스로만(구조 검사 ①이 하드코딩을 잡는다).
 *   쥔님 2026-11-01: *"안에 색깔 글자"* · *"스크롤 테스트"*.
 *   scroll=true 면 길게 넘치는 내용 — 어느 칸(가운데·사이드바)에서 스크롤이 걸리는지 눈으로 잡는다.
 */
import type { ViewProps } from '../../../pane-ui-system/plugin';

/** 뷰마다 다른 색 — text(글자색)·chip(바탕 틴트) 조합이 전부 다르다. 전부 토큰 클래스(테마가 바뀌면 같이 바뀐다). */
const TONES: { text: string; chip: string }[] = [
    { text: 'text-accent', chip: 'bg-accent/15' },
    { text: 'text-ok', chip: 'bg-ok/15' },
    { text: 'text-bad', chip: 'bg-bad/15' },
    { text: 'text-warn', chip: 'bg-warn/15' },
    { text: 'text-accenth', chip: 'bg-accenth/15' },
    { text: 'text-text', chip: 'bg-panel2' },
    { text: 'text-muted', chip: 'bg-side' },
    { text: 'text-accent', chip: 'bg-ok/15' },
    { text: 'text-ok', chip: 'bg-warn/15' },
];

export function SampleView({ title, tone, scroll, p }: { title: string; tone: number; scroll?: boolean; p: ViewProps }) {
    const t = TONES[tone % TONES.length];

    if (scroll) {
        // 🔴 자체 overflow 를 두지 않는다 — 바깥 칸(EditorArea, squeeze:'scroll')이 스크롤을 쥔다.
        //    길게 쌓아 「어느 칸에서 스크롤이 안 걸리나」를 눈으로 잡게 한다.
        return (
            <div className="min-h-full p-4 flex flex-col gap-1.5 select-text">
                <h2 className={`text-xl font-bold ${t.text} mb-2`}>{title}</h2>
                <p className="text-[12px] text-muted mb-2">칸 폭 {p.width}px · 높이 {p.height}px — 아래로 길게 넘칩니다.</p>
                {Array.from({ length: 60 }).map((_, i) => (
                    <div key={i} className={`shrink-0 py-2 px-3 rounded ${t.chip} text-[13px] ${t.text}`}>
                        줄 {i + 1} — 스크롤 시험 내용
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col items-center justify-center gap-3 p-4 text-center select-text">
            <div className={`px-5 py-3 rounded-lg ${t.chip}`}>
                <span className={`text-2xl font-bold ${t.text}`}>{title}</span>
            </div>
            <p className="text-[12px] text-muted">끌어서 가르기·사이드바로 옮겨 보세요 · 칸 {p.width}×{p.height}px</p>
        </div>
    );
}
