/**
 * Surface — 패널·카드 바탕. 선 1px · 모서리 4px · 옅은 회색 면.
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
    tone = 'panel',
}: {
    children?: ReactNode;
    className?: string;
    style?: CSSProperties;
    bordered?: boolean;
    rounded?: boolean;
    /** 바탕 톤 — panel(옅은 회색) 또는 bg(흰 캔버스) */
    tone?: 'panel' | 'panel2' | 'bg';
}) {
    const toneCls = tone === 'bg' ? 'bg-bg' : tone === 'panel2' ? 'bg-panel2' : 'bg-panel';
    return (
        <div
            className={`${toneCls} ${bordered ? 'border border-line' : ''} ${rounded ? 'rounded' : ''} ${className}`}
            style={style}
        >
            {children}
        </div>
    );
}
