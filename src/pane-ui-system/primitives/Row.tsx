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
     */
    variant?: 'list' | 'tab';
    /** 탭 전용 — 오른쪽 세로 구분선. 🔴 비활성끼리만 그린다(활성 옆에는 안 그린다 — Tabs 가 판정) */
    sep?: boolean;
    title?: string;
    className?: string;
}) {
    const isTab = variant === 'tab';
    // 활성 탭: 위 모서리만 둥글게 + 좌우·위 1px 선, 아래 선은 −mb-px 로 몸통에 먹인다(옵시디언 이음새)
    const tabCls = isTab
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
            {icon && <Icon name={icon} size={15} className="shrink-0" />}
            <span className="flex-1 min-w-0 truncate text-[13px] leading-none">{label}</span>
            {end && (
                <span
                    className={`items-center shrink-0 ${revealOnHover ? 'hidden group-hover:flex hover-only' : 'flex'}`}
                >
                    {end}
                </span>
            )}
        </div>
    );
}
