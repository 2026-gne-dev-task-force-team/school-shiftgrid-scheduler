/**
 * 정지 그림 — <Figure id="homeroom" /> 로 부른다. id 목록은 ../rich.ts 의 FigureId.
 *  · 인라인 SVG 만 쓴다(외부 파일·라이브러리 0). 색은 CSS 변수: fill="rgb(var(--c-accent))" — 두 테마에서 그대로 산다.
 *  · viewBox 는 가로 320 기준(높이는 그림마다). 부모 폭에 맞춰 w-full h-auto.
 *  · 글자는 fontSize 11~12 · fill="rgb(var(--c-muted))" 또는 --c-text. 한글이 들어간다(폰트는 시스템).
 *  · role="img" aria-label 에 그림이 말하는 한 문장.
 *  실물 그림은 figures1.tsx · figures2.tsx 에, 공용 조각은 helpers.tsx 에 산다.
 *  모르는 id 는 null 을 돌려 화면을 안 깨뜨린다.
 */
import type { FigureId } from '../rich';
import type { FigRender } from './theme';
import {
    flow, demandRow, homeroom, specDay, remaining,
    blockStates, fixedLesson, moveLegend, candidates, rulesTwo,
} from './figures1';
import {
    boards, printViews, statusBar, coTeach, blockLessons,
    cycleOrder, capacity, pin, workFile, excelPaste,
} from './figures2';

const FIGS: Partial<Record<FigureId, FigRender>> = {
    'flow': flow,
    'demand-row': demandRow,
    'homeroom': homeroom,
    'spec-day': specDay,
    'remaining': remaining,
    'block-states': blockStates,
    'fixed-lesson': fixedLesson,
    'move-legend': moveLegend,
    'candidates': candidates,
    'rules-two': rulesTwo,
    'boards': boards,
    'print-views': printViews,
    'status-bar': statusBar,
    'co-teach': coTeach,
    'block-lessons': blockLessons,
    'cycle-order': cycleOrder,
    'capacity': capacity,
    'pin': pin,
    'work-file': workFile,
    'excel-paste': excelPaste,
};

export function Figure({ id, className = '' }: { id: FigureId; className?: string }) {
    const render = FIGS[id];
    return render ? render(className) : null;
}
