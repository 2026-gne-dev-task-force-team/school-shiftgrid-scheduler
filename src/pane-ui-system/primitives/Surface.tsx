/**
 * Surface — 패널·카드 바탕. 선 1px · 모서리 --r-ctl · 옅은 회색 면.
 * 🔴 색·치수를 아는 것은 「조각」층뿐이다 — 셸·화면은 이걸 조립만 한다.
 * bordered / rounded 를 끄면 테두리 없는 넓은 면으로도 쓴다(빈칸 자리표시 등).
 */
import type { CSSProperties, ReactNode } from 'react';

export function Surface({
    children,
    className = '',
    style,
    bordered = true,
    rounded = true,
    layer,
    tone,
}: {
    children?: ReactNode;
    className?: string;
    style?: CSSProperties;
    bordered?: boolean;
    rounded?: boolean;
    /** 바탕 층 — panel(옅은 회색·기본) · panel2 · bg(흰 캔버스) */
    layer?: 'panel' | 'panel2' | 'bg';
    /** @deprecated layer (뜻색 tone 과 충돌해 이름을 바꿨다) */
    tone?: 'panel' | 'panel2' | 'bg';
}) {
    const l = layer ?? tone ?? 'panel';
    const toneCls = l === 'bg' ? 'bg-bg' : l === 'panel2' ? 'bg-panel2' : 'bg-panel';
    return (
        <div
            className={`${toneCls} ${bordered ? 'border border-line' : ''} ${rounded ? 'rounded-ctl' : ''} ${className}`}
            style={style}
        >
            {children}
        </div>
    );
}
