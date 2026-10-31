/**
 * 움직이는 사용법 — <Demo id="move-lesson" /> 로 부른다. id 목록은 ../rich.ts 의 DemoId.
 *  · 인라인 SVG + CSS 애니메이션(클래스·keyframes 는 src/index.css 의 「demo」 절) — 외부 라이브러리 0.
 *  · 장면(scene) 4~6 개를 차례로. 아래 조작 줄: [⏯] [◀] [▶] 점 진행(scene 수) · 장면마다 한 줄 자막(무엇을 누르면 무엇이 된다).
 *  · prefers-reduced-motion: reduce 이면 자동 재생 없이 첫 장면을 보이고 ◀ ▶ 로만 넘긴다.
 *  · 보이지 않을 때(IntersectionObserver 밖) 재생을 멈춘다. 서버 렌더(window 없음)에서도 죽지 않게 가드한다.
 *  · 크기: 부모 폭 100% · viewBox 가로 320 · 높이 170~200(captions.ts 의 VIEW_H). 자막 글자 12px.
 *  (v0.3 — 장면·그림은 captions.ts + draw1~3.tsx, 이 파일은 재생기와 등록표만 갖는다. 모르는 id 는 null)
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DemoId } from '../rich';
import { CAPTIONS, VIEW_H } from './captions';
import { MoveLessonDraw, BlockCycleDraw, DemandToGridDraw, PickCandidateDraw } from './draw1';
import { HomeroomFillDraw, SheetPasteDraw, SpecTimeDraw, CoTeachDraw } from './draw2';
import { BlockMoveDraw, DiagnoseFixDraw, SaveBoardDraw, PrintExportDraw } from './draw3';

/** id → 장면 그림 컴포넌트(scene 번호를 받아 SVG 를 그린다) */
const DRAW: Record<DemoId, (p: { scene: number }) => ReactNode> = {
    'move-lesson': MoveLessonDraw,
    'block-cycle': BlockCycleDraw,
    'demand-to-grid': DemandToGridDraw,
    'pick-candidate': PickCandidateDraw,
    'homeroom-fill': HomeroomFillDraw,
    'sheet-paste': SheetPasteDraw,
    'spec-time': SpecTimeDraw,
    'co-teach': CoTeachDraw,
    'block-move': BlockMoveDraw,
    'diagnose-fix': DiagnoseFixDraw,
    'save-board': SaveBoardDraw,
    'print-export': PrintExportDraw,
};

const SCENE_MS = 1800;   // 장면당
const REST_MS = 800;     // 마지막 장면 뒤 쉼

function prefersReduced(): boolean {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function DemoFrame({ captions, viewH, autoplay, className, draw }: {
    captions: readonly string[]; viewH: number; autoplay: boolean; className: string;
    draw: (p: { scene: number }) => ReactNode;
}) {
    const N = captions.length;
    const reduced = useRef(prefersReduced()).current;
    const [i, setI] = useState(0);
    const [playing, setPlaying] = useState(autoplay && !reduced);
    const [visible, setVisible] = useState(true);
    const boxRef = useRef<HTMLDivElement>(null);

    // 화면 밖이면 타이머를 멈춘다
    useEffect(() => {
        if (typeof IntersectionObserver === 'undefined' || !boxRef.current) return;
        const el = boxRef.current;
        const ob = new IntersectionObserver(
            (entries) => setVisible(entries[0]?.isIntersecting ?? true),
            { threshold: 0.25 },
        );
        ob.observe(el);
        return () => ob.disconnect();
    }, []);

    // 장면 넘기기 (reduced-motion 이면 자동 재생 안 함)
    useEffect(() => {
        if (reduced || !playing || !visible) return;
        const last = i === N - 1;
        const t = window.setTimeout(() => setI((p) => (p + 1) % N), last ? SCENE_MS + REST_MS : SCENE_MS);
        return () => window.clearTimeout(t);
    }, [i, playing, visible, reduced, N]);

    const step = (d: number) => setI((p) => (p + d + N) % N);
    const Draw = draw;

    return (
        <div ref={boxRef} className={`demo-root ${className}`.trim()}>
            <svg viewBox={`0 0 320 ${viewH}`} className="w-full h-auto" role="img" aria-label={captions[i]}>
                <Draw scene={i} />
            </svg>
            <div className="demo-caption">{captions[i]}</div>
            <div className="demo-controls no-print">
                <button type="button" className="demo-btn" disabled={reduced}
                    aria-label={playing ? '일시정지' : '재생'} onClick={() => setPlaying((p) => !p)}>
                    {playing ? '⏸' : '▶'}
                </button>
                <button type="button" className="demo-btn" aria-label="이전 장면" onClick={() => step(-1)}>◀</button>
                <button type="button" className="demo-btn" aria-label="다음 장면" onClick={() => step(1)}>▶</button>
                <div className="demo-dots" aria-hidden="true">
                    {captions.map((_, k) => <span key={k} className={k === i ? 'on' : ''} />)}
                </div>
                <span className="demo-count">{i + 1} / {N}</span>
            </div>
        </div>
    );
}

export function Demo({ id, className = '', autoplay = true }: { id: DemoId; className?: string; autoplay?: boolean }) {
    const draw = DRAW[id];
    const captions = CAPTIONS[id];
    if (!draw || !captions) return null;
    return <DemoFrame captions={captions} viewH={VIEW_H[id]} autoplay={autoplay} className={className} draw={draw} />;
}
