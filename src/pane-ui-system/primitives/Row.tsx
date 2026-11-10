/**
 * Row — 아이콘 + 글자 + 끝단 단추 한 줄. 목록 항목·탭 등 「누르는 줄」의 바탕.
 *
 * 🔴 ⭐ 호버 함정은 여기 한 번만 짠다. 노션은 마우스를 올려야 끝단 단추(×)가 뜨는데,
 *    그걸 그대로 쓰면 손가락 기기에선 단추가 영영 안 나타난다.
 *    가름선은 화면 폭이 아니라 입력 수단이다:
 *      - 데스크톱: hidden + group-hover:flex (줄에 마우스를 올리면 뜬다)
 *      - 손가락 기기(@media hover:none): .hover-only 가 hidden 을 덮고 늘 보이게 한다 (index.css)
 *    ⛔ 이 판정(group-hover / hover-only)을 Row 밖 어디에도 복사하지 말 것.
 *       구조 검사(structure.test.ts)가 group-hover 가 이 파일 밖에 나오면 실패시킨다.
 */
import type { MouseEvent, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function Row({
    icon,
    glyph,
    label,
    active = false,
    onClick,
    end,
    revealOnHover = false,
    variant = 'list',
    sep = false,
    title,
    className = '',
    rowId,
}: {
    icon?: IconName;
    /** 글자 아이콘(이모지) — 있으면 icon 대신 그린다 */
    glyph?: string;
    label: ReactNode;
    active?: boolean;
    onClick?: (e: MouseEvent) => void;
    /** 끝단 단추(닫기 × 등) */
    end?: ReactNode;
    /** data-row-id — 우클릭 위임이 어느 줄인지 더듬을 때 쓴다(값은 뜻 없는 식별자다) */
    rowId?: string;
    /** 끝단을 호버로만 띄울지 (손가락 기기에선 늘 보인다) */
    revealOnHover?: boolean;
    /**
     * 🔴 'tab' 은 「탭 한 칸」이다 — 옵시디언·VS Code 식으로 그린다(쥔님 지시 2026-10-31):
     *    활성 탭은 **위 모서리만 둥글고**(rounded-t) **에디터와 같은 바탕**(bg-bg)으로 뜨며,
     *    아래 1px 선을 제 자리에서 **덮어**(−mb-px) 탭이 몸통과 이어져 보인다.
     *    비활성 탭은 바탕 없이 글자만 · 호버 때만 살짝 밝아진다.
     *    ⛔ 활성 표시를 옅은 회색으로만 두지 말 것 — 탭이 서로 붙어 보인다.
     *
     * 🔴 'sidetab' 은 「사이드바 탭 한 칸」이다 — 가운데 탭과 달라야 한다(판 A, 쥔님 2026-11-01:
     *    *"사이드 패널은 사이드 패널답게 뭔가 조금 다르게"*). 카드처럼 떠오르지 않고 **납작하다**:
     *    활성은 바탕 없이 글자색만 진하게(text-text) + 아래 2px 강조선(border-b-accent),
     *    비활성은 글자만(투명 밑선으로 자리만 지켜 높이가 안 흔들린다). 그래서 「사이드인지 분할인지」가 갈린다.
     */
    variant?: 'list' | 'tab' | 'sidetab';
    /** 탭 전용 — 오른쪽 세로 구분선. 🔴 비활성끼리만 그린다(활성 옆에는 안 그린다 — Tabs 가 판정) */
    sep?: boolean;
    title?: string;
    className?: string;
}) {
    const isTab = variant === 'tab';
    const isSideTab = variant === 'sidetab';
    // 🔴 사이드탭: 납작하다 — 활성은 글자만 진하게 + 아래 2px 강조선(border-b-accent), 비활성은 투명 밑선으로
    //    자리만 지킨다(활성↔비활성 전환에 높이가 안 흔들린다). 세로 구분선은 비활성끼리만.
    //    ⛔ border 색은 side-별로 준다 — border-transparent/border-line 을 통째로 겹치면 밑선 색이 서로 덮인다.
    const sideTabCls = active
        ? 'h-full px-2 text-text border-b-2 border-b-accent'
        : `h-full px-2 text-muted hover:text-text border-b-2 border-b-transparent ${sep ? 'border-r border-r-line' : ''}`;
    // 활성 탭: 위 모서리만 둥글게 + 좌우·위 1px 선, 아래 선은 −mb-px 로 몸통에 먹인다(옵시디언 이음새)
    const tabCls = isSideTab
        ? sideTabCls
        : isTab
        ? (active
            ? 'relative z-10 h-full px-3 rounded-t-md bg-bg text-text border border-line border-b-0 -mb-px'
            : `h-full px-3 text-muted hover:text-text hover:bg-text/[0.05] ${sep ? 'border-r border-line' : ''}`)
        : (active ? 'h-row px-pad rounded bg-text/[0.06] text-text'
            : 'h-row px-pad rounded text-muted hover:text-text hover:bg-text/[0.04]');
    return (
        <div
            className={`group flex items-center gap-2 cursor-pointer select-none transition-colors ${tabCls} ${className}`}
            onClick={onClick}
            data-row-id={rowId}
            role="button"
            tabIndex={0}
            title={title}
            draggable={false}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    (e.currentTarget as HTMLElement).click();
                }
            }}
        >
            {glyph
                ? <span className="shrink-0 w-4 text-center text-small leading-none" aria-hidden="true">{glyph}</span>
                : icon && <Icon name={icon} size={15} className="shrink-0" />}
            <span className="flex-1 min-w-0 truncate text-body leading-none">{label}</span>
            {end && (
                <span
                    className={`items-center shrink-0 ${revealOnHover ? `flex hover-only ${active ? 'opacity-100' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'}` : 'flex'}`}
                >
                    {end}
                </span>
            )}
        </div>
    );
}
