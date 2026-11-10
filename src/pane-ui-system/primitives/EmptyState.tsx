/**
 * EmptyState — 「아무것도 없다·이 기능이 꺼졌다」 화면 한 벌. 아이콘 · 제목 · 설명 · 동작 단추(선택).
 *   손으로 `<p className="p-4 text-small text-muted">…</p>` 를 짜지 말고 이걸 쓴다 — 빈 화면들이 같은 꼴·같은 자리에 선다.
 *   compact 면 위아래 여백을 줄여 패널 안 작은 칸에 쓴다.
 */
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Button } from './Button';

export function EmptyState({ icon, title, description, action, compact = false, children }: {
    icon?: IconName;
    title: string;
    description?: ReactNode;
    /** 동작 단추 하나 — 더 필요하면 children 으로 */
    action?: { label: string; onClick: () => void; icon?: IconName };
    compact?: boolean;
    children?: ReactNode;
}) {
    return (
        <div
            role="status"
            className={`h-full w-full flex flex-col items-center justify-center gap-2 text-center px-4 ${compact ? 'py-4' : 'py-10'}`}
        >
            {icon && (
                <span className="text-muted/70 mb-1">
                    <Icon name={icon} size={compact ? 20 : 28} />
                </span>
            )}
            <p className="text-lead font-medium text-text">{title}</p>
            {description && <div className="max-w-xs text-small text-muted">{description}</div>}
            {action && (
                <Button className="mt-2 inline-flex items-center gap-1" onClick={action.onClick}>
                    {action.icon && <Icon name={action.icon} size={13} />}
                    {action.label}
                </Button>
            )}
            {children}
        </div>
    );
}
