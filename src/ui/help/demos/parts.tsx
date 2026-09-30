/**
 * 움직이는 사용법 — 공용 SVG 헬퍼(컴포넌트만 내보낸다).
 *  움직임은 CSS transition(src/index.css 의 「demo」 절)이 저절로 잇는다 — 요소에 className="demo-el" 을 붙이면
 *  fill·opacity·transform 이 450ms 로 이어진다. 요소 key 를 장면 사이에 유지해야 전환이 걸린다.
 */
import type { ReactNode } from 'react';
import { C, CW, CH, HEAD } from './palette';

/** SVG 글자 */
export function Txt({ x, y, children, size = 11, fill = C.text, anchor = 'middle', weight, className }: {
    x: number; y: number; children: ReactNode; size?: number; fill?: string;
    anchor?: 'start' | 'middle' | 'end'; weight?: number; className?: string;
}) {
    return (
        <text x={x} y={y} fontSize={size} fill={fill} textAnchor={anchor} fontWeight={weight}
            dominantBaseline="central" className={className}>{children}</text>
    );
}

/** 격자 한 칸 — 색·투명도·테두리·선택 ring·자막을 장면에 따라 바꾼다 */
export function Cell({ x, y, w = CW, h = CH, fill = C.panel, stroke = C.line, rx = 3, op = 1,
    label, sub, labelFill = C.text, dash, ring, blink, className = 'demo-el' }: {
    x: number; y: number; w?: number; h?: number; fill?: string; stroke?: string; rx?: number; op?: number;
    label?: string; sub?: string; labelFill?: string; dash?: boolean; ring?: boolean; blink?: boolean; className?: string;
}) {
    return (
        <g className={className}>
            <rect x={x} y={y} width={w} height={h} rx={rx} fill={fill} fillOpacity={op}
                stroke={stroke} strokeWidth={1} strokeDasharray={dash ? '4 3' : undefined} className={blink ? 'demo-blink' : undefined} />
            {ring && (
                <rect x={x + 1.5} y={y + 1.5} width={w - 3} height={h - 3} rx={rx}
                    fill="none" stroke={C.accent} strokeWidth={2} />
            )}
            {label && <Txt x={x + w / 2} y={sub ? y + h / 2 - 5 : y + h / 2} size={10} fill={labelFill}>{label}</Txt>}
            {sub && <Txt x={x + w / 2} y={y + h / 2 + 6} size={8} fill={C.muted}>{sub}</Txt>}
        </g>
    );
}

/** 빈 시간표 격자 — 요일 머리 + 교시 번호 + 빈 칸 */
export function Grid({ gx, gy, days, rows, cw = CW, ch = CH }: {
    gx: number; gy: number; days: readonly string[]; rows: number; cw?: number; ch?: number;
}) {
    const els: ReactNode[] = [];
    days.forEach((d, c) => els.push(
        <Txt key={`h${c}`} x={gx + c * cw + cw / 2} y={gy + HEAD / 2} size={10} fill={C.muted}>{d}</Txt>,
    ));
    for (let r = 0; r < rows; r++) {
        els.push(<Txt key={`p${r}`} x={gx - 6} y={gy + HEAD + r * ch + ch / 2} size={9} fill={C.muted} anchor="end">{r + 1}</Txt>);
        for (let c = 0; c < days.length; c++) {
            els.push(<rect key={`${r}-${c}`} x={gx + c * cw} y={gy + HEAD + r * ch} width={cw} height={ch}
                rx={3} fill={C.panel} stroke={C.line} strokeWidth={0.8} />);
        }
    }
    return <g>{els}</g>;
}

/** 손가락/화살표 포인터 — 하나의 g 가 translate 로 이동한다. 누름 장면에서 잔물결 한 번 */
export function Cursor({ x, y, pressed, pressKey }: { x: number; y: number; pressed?: boolean; pressKey?: string | number }) {
    return (
        <g className="demo-cursor" style={{ transform: `translate(${x}px, ${y}px)` }}>
            {pressed && <circle key={pressKey} cx={0} cy={0} r={5} className="demo-ripple" fill={C.accent} fillOpacity={0.4} />}
            <path d="M0 0 L0 15 L4 11 L7 17 L9.5 16 L6.5 10.5 L11 10.5 Z"
                fill={C.text} stroke={C.panel} strokeWidth={1} />
        </g>
    );
}

/** 떠 있는 카드(미리보기·후보·시안) */
export function Card({ x, y, w, h, title, accent, children, className = 'demo-el' }: {
    x: number; y: number; w: number; h: number; title?: string; accent?: boolean; children?: ReactNode; className?: string;
}) {
    return (
        <g className={className}>
            <rect x={x} y={y} width={w} height={h} rx={6} fill={C.panel}
                stroke={accent ? C.accent : C.line} strokeWidth={accent ? 1.5 : 1} />
            {title && <Txt x={x + 8} y={y + 12} size={10} anchor="start" fill={C.muted}>{title}</Txt>}
            {children}
        </g>
    );
}

/** 화면 버튼 모양 */
export function Btn({ x, y, w, h = 18, label, tone = 'accent', active = true }: {
    x: number; y: number; w: number; h?: number; label: string; tone?: 'accent' | 'ghost'; active?: boolean;
}) {
    const bg = tone === 'accent' ? C.accent : C.panel2;
    const fg = tone === 'accent' ? '#fff' : C.text;
    return (
        <g className="demo-el">
            <rect x={x} y={y} width={w} height={h} rx={5} fill={bg} opacity={active ? 1 : 0.45}
                stroke={tone === 'ghost' ? C.line : undefined} strokeWidth={tone === 'ghost' ? 1 : 0} />
            <Txt x={x + w / 2} y={y + h / 2} size={10} fill={fg}>{label}</Txt>
        </g>
    );
}

/** 화면 위 제목 한 줄 */
export function Title({ x = 12, y = 12, children }: { x?: number; y?: number; children: ReactNode }) {
    return <Txt x={x} y={y} size={11} anchor="start" fill={C.muted} weight={600}>{children}</Txt>;
}
