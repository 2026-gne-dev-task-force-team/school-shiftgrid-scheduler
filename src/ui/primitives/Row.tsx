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
    title,
    className = '',
}: {
    icon?: IconName;
    label: ReactNode;
    active?: boolean;
    onClick?: (e: MouseEvent) => void;
    /** 끝단 단추(닫기 × 등) */
    end?: ReactNode;
    /** 끝단을 호버로만 띄울지 (손가락 기기에선 늘 보인다) */
    revealOnHover?: boolean;
    title?: string;
    className?: string;
}) {
    return (
        <div
            className={`group flex items-center gap-2 h-row px-pad rounded cursor-pointer select-none transition-colors
                ${active ? 'bg-text/[0.06] text-text' : 'text-muted hover:text-text hover:bg-text/[0.04]'} ${className}`}
            onClick={onClick}
            role="button"
            tabIndex={0}
            title={title}
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
