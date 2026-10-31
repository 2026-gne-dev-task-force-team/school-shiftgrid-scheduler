/**
 * 그림 공용 컴포넌트 — Figure.tsx 와 figures*.tsx 가 함께 쓴다.
 *  · 색은 전부 CSS 변수(rgb(var(--c-…)))로만 낸다 — 밝음/어둠 두 화면에서 그대로 산다.
 *  · 흰/검 리터럴 금지(단 accent/bad 칸 위 글자에 #fff 는 허용).
 *  · 상수·타입(C·DAYS·FigRender)은 theme.ts 에 있다(fast-refresh 경고를 피하려 컴포넌트만 여기 둔다).
 */
import type { ReactElement, ReactNode } from 'react';
import { C, DAYS } from './theme';

/** 표준 svg 껍데기 — viewBox 320×H · w-full h-auto · role/aria. */
export function Svg({ h, label, className, children }: {
    h: number; label: string; className: string; children: ReactNode;
}): ReactElement {
    return (
        <svg viewBox={`0 0 320 ${h}`} className={`w-full h-auto ${className}`} role="img" aria-label={label}>
            {children}
        </svg>
    );
}

/** 짧은 글자. */
export function T({ x, y, children, color = C.muted, fs = 11, anchor = 'middle', weight }: {
    x: number; y: number; children: ReactNode; color?: string; fs?: number;
    anchor?: 'start' | 'middle' | 'end'; weight?: number;
}): ReactElement {
    return <text x={x} y={y} textAnchor={anchor} fill={color} fontSize={fs} fontWeight={weight}>{children}</text>;
}

/** 네 점 별(자동 배정 표시). */
export function Star({ cx, cy, s = 1, color = C.accent }: {
    cx: number; cy: number; s?: number; color?: string;
}): ReactElement {
    const p = (a: number) => a * s;
    return (
        <path
            d={`M${cx} ${cy - p(11)} l${p(4)} ${p(11)} l${p(11)} ${p(4)} l${-p(11)} ${p(4)} l${-p(4)} ${p(11)} l${-p(4)} ${-p(11)} l${-p(11)} ${-p(4)} l${p(11)} ${-p(4)} z`}
            fill={color}
        />
    );
}

/** 직선 화살표(끝에 채운 삼각). */
export function Arrow({ x1, y1, x2, y2, color = C.muted, w = 1.7, dash }: {
    x1: number; y1: number; x2: number; y2: number; color?: string; w?: number; dash?: boolean;
}): ReactElement {
    return <g>{arrowParts(x1, y1, x2, y2, color, w, dash)}</g>;
}

/** 꺾은 화살표 — pts 를 잇고 마지막 점에 머리를 단다(칸을 우회하는 화살표에 쓴다). */
export function PolyArrow({ pts, color = C.accent, w = 2, dash }: {
    pts: [number, number][]; color?: string; w?: number; dash?: boolean;
}): ReactElement {
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
    const [bx, by] = pts[pts.length - 2];
    const [x2, y2] = pts[pts.length - 1];
    return (
        <g>
            <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinejoin="round" strokeLinecap="round"
                strokeDasharray={dash ? '4 3' : undefined} />
            {arrowHead(bx, by, x2, y2, color)}
        </g>
    );
}

function arrowParts(x1: number, y1: number, x2: number, y2: number, color: string, w: number, dash?: boolean): ReactNode {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const a = 7;
    const bx = x2 - ux * a, by = y2 - uy * a;
    return (
        <>
            <line x1={x1} y1={y1} x2={bx} y2={by} stroke={color} strokeWidth={w} strokeLinecap="round"
                strokeDasharray={dash ? '3 3' : undefined} />
            {arrowHead(x1 + ux * (len - a), y1 + uy * (len - a), x2, y2, color)}
        </>
    );
}

function arrowHead(bx: number, by: number, x2: number, y2: number, color: string): ReactNode {
    const dx = x2 - bx, dy = y2 - by;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const px = -uy, py = ux;
    const b = 3.6;
    const hx = x2 - ux * 7, hy = y2 - uy * 7;
    return <path d={`M${x2} ${y2} L${hx + px * b} ${hy + py * b} L${hx - px * b} ${hy - py * b} Z`} fill={color} />;
}

/** 초록 체크. */
export function Check({ cx, cy, s = 1, color = C.ok }: { cx: number; cy: number; s?: number; color?: string }): ReactElement {
    return <path d={`M${cx - 4 * s} ${cy} l${3 * s} ${3.5 * s} l${6 * s} ${-7 * s}`} fill="none" stroke={color} strokeWidth={2 * s} strokeLinecap="round" strokeLinejoin="round" />;
}

/** 빨강 X(취소). */
export function Cross({ cx, cy, s = 1, color = C.bad }: { cx: number; cy: number; s?: number; color?: string }): ReactElement {
    const d = 4 * s;
    return (
        <g stroke={color} strokeWidth={2 * s} strokeLinecap="round">
            <line x1={cx - d} y1={cy - d} x2={cx + d} y2={cy + d} />
            <line x1={cx + d} y1={cy - d} x2={cx - d} y2={cy + d} />
        </g>
    );
}

/** 한 칸에 담을 override 정보. */
export interface GCell {
    c: number; r: number;
    fill?: string; stroke?: string;
    text?: string; tc?: string; fs?: number;
    ring?: boolean; dash?: boolean;
}

/** 주간 격자(월~금 × 교시) — 빈 칸은 defFill, 특별한 칸만 cells 로 덮는다. */
export function MiniGrid({
    x, y, cols = 5, rows = 5, cw = 24, ch = 18,
    showDays = true, showPeriods = true,
    defFill = C.panel2, defText, defTc = C.muted, defFs = 8,
    cells = [],
}: {
    x: number; y: number; cols?: number; rows?: number; cw?: number; ch?: number;
    showDays?: boolean; showPeriods?: boolean;
    defFill?: string; defText?: string; defTc?: string; defFs?: number;
    cells?: GCell[];
}): ReactElement {
    const ox = showPeriods ? 15 : 0;
    const oy = showDays ? 13 : 0;
    const gx = x + ox, gy = y + oy;
    const find = (c: number, r: number) => cells.find((k) => k.c === c && k.r === r);
    const items: ReactNode[] = [];

    if (showDays) {
        for (let c = 0; c < cols; c++) {
            items.push(<text key={`d${c}`} x={gx + c * cw + (cw - 2) / 2} y={y + 9} textAnchor="middle" fill={C.muted} fontSize={9}>{DAYS[c]}</text>);
        }
    }
    if (showPeriods) {
        for (let r = 0; r < rows; r++) {
            items.push(<text key={`p${r}`} x={x + 7} y={gy + r * ch + (ch - 2) / 2 + 3} textAnchor="middle" fill={C.muted} fontSize={8}>{r + 1}</text>);
        }
    }
    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
            const o = find(c, r);
            const fill = o?.fill ?? defFill;
            const text = o?.text ?? (o ? undefined : defText);
            const tc = o?.tc ?? defTc;
            const px = gx + c * cw, py = gy + r * ch;
            items.push(
                <rect key={`c${c}-${r}`} x={px} y={py} width={cw - 2} height={ch - 2} rx={3}
                    fill={fill} stroke={o?.ring ? C.accent : (o?.stroke ?? C.line)}
                    strokeWidth={o?.ring ? 2 : 1} strokeDasharray={o?.dash ? '3 2' : undefined} />,
            );
            if (text) {
                items.push(
                    <text key={`t${c}-${r}`} x={px + (cw - 2) / 2} y={py + (ch - 2) / 2 + 3.5}
                        textAnchor="middle" fill={tc} fontSize={o?.fs ?? defFs}>{text}</text>,
                );
            }
        }
    }
    return <g>{items}</g>;
}
