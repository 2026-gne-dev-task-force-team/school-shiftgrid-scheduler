/**
 * 그림 공용 상수·타입 — 컴포넌트가 아닌 것만 둔다(helpers.tsx 의 fast-refresh 경고를 피한다).
 *  색은 전부 CSS 변수(rgb(var(--c-…)))로만 낸다 — 밝음/어둠 두 화면에서 그대로 산다.
 */
import type { ReactElement } from 'react';

/** 테마 변수색 — 뜻이 고정돼 있다(accent 전담·선택 / ok 옮길 수 있음 / warn 권장 / bad 필수). */
export const C = {
    accent: 'rgb(var(--c-accent))',
    accenth: 'rgb(var(--c-accenth))',
    ok: 'rgb(var(--c-ok))',
    bad: 'rgb(var(--c-bad))',
    warn: 'rgb(var(--c-warn))',
    panel: 'rgb(var(--c-panel))',
    panel2: 'rgb(var(--c-panel2))',
    line: 'rgb(var(--c-line))',
    text: 'rgb(var(--c-text))',
    muted: 'rgb(var(--c-muted))',
    bg: 'rgb(var(--c-bg))',
    /** 담임 수업 칸 — 연한 파랑 */
    home: 'rgb(var(--c-accent) / 0.12)',
    okBg: 'rgb(var(--c-ok) / 0.18)',
    warnBg: 'rgb(var(--c-warn) / 0.22)',
    badBg: 'rgb(var(--c-bad) / 0.15)',
} as const;

export const DAYS = ['월', '화', '수', '목', '금'] as const;

/** 그림 하나 — 부모가 준 className 을 svg 에 얹는다. */
export type FigRender = (className: string) => ReactElement;
