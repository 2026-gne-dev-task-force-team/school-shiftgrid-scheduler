/**
 * Button — 글자 텍스트 단추 하나. 낱말은 셋: size(sm·md) · variant(solid·soft·ghost·outline) · tone(neutral·accent·danger).
 *   높이: sm = h-btn(24×밀도) · md = h-field(28×밀도) — 같은 size 의 입력칸과 한 줄에 나란히 맞는다.
 *   모양표는 variant × tone 12칸 완성 문자열(동적 조립 ⛔ — Tailwind 정적 스캔). 색 토큰 추가 0 — 투명도로만.
 * ⚠️ 옛 props 는 deprecated 별칭으로 받는다(U-잠금b 에서 제거):
 *   variant="accent" → tone="accent"(soft) · variant="plain" → ghost + 옛 높이 h-btn 유지.
 *   ⚠️ variant="ghost" 의 뜻이 바뀌었다 — 옛 「테두리 회색」 → 새 「테두리 없음」(경계가 필요하면 outline).
 * 🔴 색은 토큰으로만 · 포커스 링은 FOCUS_RING 하나로. 그 외 button prop 은 그대로 넘긴다.
 * ⭐ 아이콘+글자는 한 줄 가운데 정렬(inline-flex) · 글자는 안 꺾이고(whitespace-nowrap) 안 눌린다(shrink-0) — 기본값이다(R1). 꾸러미가 덧대지 말 것.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { FOCUS_RING } from './focus';

/** 모든 변형 공통 disabled 모양 — 흐리게 · 금지 커서 · hover/active 배경 변화 없음 */
export const DISABLED = 'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:active:bg-transparent';

export type ButtonVariant = 'solid' | 'soft' | 'ghost' | 'outline';
export type ButtonTone = 'neutral' | 'accent' | 'danger';

// solid·soft 는 자기 바탕이 있어 disabled 때 hover 를 그 바탕으로 되돌린다(투명 아님).
const DIS_SOLID_NEUTRAL = 'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-text disabled:active:bg-text';
const DIS_SOLID_ACCENT = 'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-accent disabled:active:bg-accent';
const DIS_SOLID_DANGER = 'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-bad disabled:active:bg-bad';
const DIS_SOFT_NEUTRAL = 'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-text/[0.06] disabled:active:bg-text/[0.06]';
const DIS_SOFT_ACCENT = 'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-accent/10 disabled:active:bg-accent/10';
const DIS_SOFT_DANGER = 'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-bad/10 disabled:active:bg-bad/10';

const TABLE = {
    solid: {
        neutral: `border-transparent bg-text text-bg hover:bg-text/90 active:bg-text/80 ${DIS_SOLID_NEUTRAL}`,
        accent: `border-transparent bg-accent text-bg hover:bg-accenth active:bg-accenth ${DIS_SOLID_ACCENT}`,
        danger: `border-transparent bg-bad text-bg hover:bg-bad/90 active:bg-bad/80 ${DIS_SOLID_DANGER}`,
    },
    soft: {
        neutral: `border-transparent bg-text/[0.06] text-text hover:bg-text/[0.1] active:bg-text/[0.14] ${DIS_SOFT_NEUTRAL}`,
        accent: `border-transparent bg-accent/10 text-accent hover:bg-accent/15 active:bg-accent/20 ${DIS_SOFT_ACCENT}`,
        danger: `border-transparent bg-bad/10 text-bad hover:bg-bad/15 active:bg-bad/20 ${DIS_SOFT_DANGER}`,
    },
    ghost: {
        neutral: `border-transparent text-text hover:bg-text/[0.06] active:bg-text/[0.1] ${DISABLED}`,
        accent: `border-transparent text-accent hover:bg-accent/10 active:bg-accent/15 ${DISABLED}`,
        danger: `border-transparent text-bad hover:bg-bad/10 active:bg-bad/15 ${DISABLED}`,
    },
    outline: {
        neutral: `border-line text-text hover:bg-text/[0.04] active:bg-text/[0.08] ${DISABLED}`,
        accent: `border-accent/50 text-accent hover:bg-accent/10 active:bg-accent/15 ${DISABLED}`,
        danger: `border-bad/50 text-bad hover:bg-bad/10 active:bg-bad/15 ${DISABLED}`,
    },
} as const;

const SIZE = {
    sm: 'h-btn px-2 text-small',
    md: 'h-field px-2.5 text-body',
} as const;

export function Button({
    variant = 'soft',
    tone = 'neutral',
    size = 'md',
    icon,
    end,
    block = false,
    loading = false,
    className = '',
    type = 'button',
    disabled,
    disabledReason,
    children,
    ...rest
}: {
    /** solid·soft·ghost·outline. 'accent'·'plain' 은 옛 별칭(deprecated) */
    variant?: ButtonVariant | 'accent' | 'plain';
    tone?: ButtonTone;
    size?: 'sm' | 'md';
    /** 글자 앞 아이콘 */
    icon?: IconName;
    /** 글자 뒤에 덧붙일 것(꼬리표·단축키 등) */
    end?: ReactNode;
    /** 칸을 꽉 채운다 */
    block?: boolean;
    /** 눌림을 막고 점 세 개를 보인다 */
    loading?: boolean;
    /** 꺼졌을 때 마우스를 올리면 보이는 「왜 안 되나 · 먼저 무엇을」(「먼저 ~하세요」 꼴). 꺼진 단추는 마우스 이벤트를 못 받아 감싸는 span 이 title 을 든다 */
    disabledReason?: string;
    children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
    // 옛 별칭 → 새 낱말(plain 은 도구 막대가 안 들썩이게 옛 높이 h-btn 을 지킨다)
    const legacyPlain = variant === 'plain';
    const v: ButtonVariant = variant === 'accent' ? 'soft' : legacyPlain ? 'ghost' : variant;
    const t: ButtonTone = variant === 'accent' ? 'accent' : tone;
    const sizeCls = legacyPlain ? 'h-btn px-3 text-body select-none' : SIZE[size];
    const off = !!(disabled || loading);
    const wrapReason = off && !loading ? disabledReason : undefined;
    const btn = (
        <button
            type={type}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={`${sizeCls} ${block ? 'flex w-full' : 'inline-flex shrink-0'} items-center justify-center gap-1 whitespace-nowrap rounded-ctl border ${TABLE[v][t]} transition-colors duration-fast ${FOCUS_RING} ${wrapReason ? 'pointer-events-none' : ''} ${className}`}
            {...rest}
        >
            {loading
                ? <span aria-hidden="true" className="tracking-widest">···</span>
                : (
                    <>
                        {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
                        {children}
                        {end}
                    </>
                )}
        </button>
    );
    if (!wrapReason) return btn;
    return <span title={wrapReason} className={block ? 'flex w-full' : 'inline-flex shrink-0'}>{btn}</span>;
}
