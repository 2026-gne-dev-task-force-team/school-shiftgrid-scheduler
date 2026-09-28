/**
 * 코치마크 — 화면 요소를 하나씩 짚으며 안내한다.
 *  · 대상 자리만 뚫린 반투명 가리개(4분할 div) + 대상 옆 카드.
 *  · 대상이 다른 화면에 있으면 그 화면으로 옮기고 다음 프레임에 다시 찾는다.
 *  · 끝내 못 찾으면 그 단계를 건너뛴다(죽지 않는다).
 * 저장: localStorage['shiftgrid.toured'].
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/store';
import { useHelp } from './HelpContext';
import { TOUR_STEPS } from './tourSteps';

const TOURED_KEY = 'shiftgrid.toured';

/**
 * 같은 data-tour 가 둘일 수 있다 — 폰용(md:hidden)과 데스크톱용이 한 화면에 같이 그려진다.
 * 첫 번째(숨은 것)를 잡으면 rect 가 0 이라 가리개가 왼쪽 위 구석에 뜬다(실측 2026-09-28). 보이는 것을 고른다.
 */
function findVisible(tour: string): HTMLElement | null {
    const els = document.querySelectorAll<HTMLElement>(`[data-tour="${tour}"]`);
    for (const el of els) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) return el; }
    return null;
}

export function Tour() {
    const st = useStore();
    const help = useHelp();
    const [idx, setIdx] = useState(0);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const attempts = useRef(0);

    const finish = useCallback(() => {
        try { localStorage.setItem(TOURED_KEY, '1'); } catch { /* 저장 실패는 무시 */ }
        help.stopTour();
    }, [help]);

    const next = useCallback(() => {
        if (idx + 1 >= TOUR_STEPS.length) finish();
        else { attempts.current = 0; setRect(null); setIdx(idx + 1); }
    }, [idx, finish]);

    // 현재 단계의 대상을 찾는다. 화면을 옮겨야 하면 옮기고, 몇 프레임 재시도한 뒤 없으면 건너뛴다.
    useEffect(() => {
        if (!help.tourActive) return;
        const step = TOUR_STEPS[idx];
        if (!step) { finish(); return; }
        if (step.screen && st.screen !== step.screen) { st.setScreen(step.screen); }

        let raf = 0;
        let pressed = false;
        const tryFind = () => {
            // 소절 버튼처럼 먼저 눌러야 나타나는 대상이면 한 번 누르고 다음 프레임에 찾는다
            if (step.pre && !pressed) {
                pressed = true;
                const pre = [...document.querySelectorAll<HTMLElement>(step.pre)].find((x) => x.getBoundingClientRect().width > 0)
                    ?? document.querySelector<HTMLElement>(step.pre);
                if (pre) { pre.click(); raf = requestAnimationFrame(tryFind); return; }
            }
            const el = findVisible(step.tour);
            if (el) {
                el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
                setRect(el.getBoundingClientRect());
                return;
            }
            attempts.current += 1;
            if (attempts.current > 12) { // ~12 프레임(약 200ms) 기다려도 없으면 건너뛴다
                if (idx + 1 >= TOUR_STEPS.length) finish();
                else { attempts.current = 0; setIdx(idx + 1); }
                return;
            }
            raf = requestAnimationFrame(tryFind);
        };
        raf = requestAnimationFrame(tryFind);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idx, help.tourActive, st.screen]);

    // 창 크기·스크롤이 바뀌면 대상 자리를 다시 잰다
    useEffect(() => {
        if (!help.tourActive) return;
        const re = () => {
            const step = TOUR_STEPS[idx];
            const el = step && findVisible(step.tour);
            if (el) setRect(el.getBoundingClientRect());
        };
        window.addEventListener('resize', re);
        window.addEventListener('scroll', re, true);
        return () => { window.removeEventListener('resize', re); window.removeEventListener('scroll', re, true); };
    }, [idx, help.tourActive]);

    if (!help.tourActive) return null;
    const step = TOUR_STEPS[idx];
    if (!step) return null;

    const pad = 6;
    const r = rect ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;

    // 카드 자리 — 대상 아래에 놓되 화면 밖으로 나가면 위로
    const vh = window.innerHeight, vw = window.innerWidth;
    const cardW = Math.min(320, vw - 24);
    let cardTop = r ? r.top + r.height + 10 : vh / 2 - 80;
    let cardLeft = r ? Math.min(Math.max(8, r.left), vw - cardW - 8) : (vw - cardW) / 2;
    if (r && cardTop + 190 > vh) cardTop = Math.max(8, r.top - 190);
    if (!r) { cardTop = vh / 2 - 90; cardLeft = (vw - cardW) / 2; }

    return (
        <div className="fixed inset-0 z-[300] no-print">
            {/* 가리개 — 대상 자리만 뚫는다(4분할) */}
            {r ? (
                <>
                    <div className="absolute left-0 right-0 top-0 bg-black/55" style={{ height: Math.max(0, r.top) }} />
                    <div className="absolute left-0 right-0 bg-black/55" style={{ top: r.top + r.height, bottom: 0 }} />
                    <div className="absolute bg-black/55" style={{ top: r.top, left: 0, width: Math.max(0, r.left), height: r.height }} />
                    <div className="absolute bg-black/55" style={{ top: r.top, left: r.left + r.width, right: 0, height: r.height }} />
                    <div className="absolute rounded-md ring-2 ring-accent pointer-events-none" style={{ top: r.top, left: r.left, width: r.width, height: r.height }} />
                </>
            ) : (
                <div className="absolute inset-0 bg-black/55" />
            )}

            {/* 안내 카드 */}
            <div className="absolute bg-panel border border-line rounded-lg shadow-2xl p-3.5" style={{ top: cardTop, left: cardLeft, width: cardW }}>
                <div className="text-[14px] font-semibold mb-1">{step.title}</div>
                <div className="text-[12.5px] text-muted space-y-1 mb-3">
                    {step.body.map((b, i) => <p key={i} className="leading-snug">{b}</p>)}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted">{idx + 1} / {TOUR_STEPS.length}</span>
                    <button onClick={finish} className="ml-auto text-[12px] text-muted hover:text-text px-2 py-1.5">건너뛰기</button>
                    <button onClick={next} className="text-[12px] font-medium bg-accent hover:bg-accenth text-white rounded-md px-3 py-1.5">
                        {idx + 1 >= TOUR_STEPS.length ? '마치기' : '다음'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export function hasToured(): boolean {
    try { return localStorage.getItem(TOURED_KEY) === '1'; } catch { return false; }
}
