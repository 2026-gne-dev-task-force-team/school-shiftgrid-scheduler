/**
 * ConfirmDialog — 「~할까요?」 확인. window.confirm 대신. tone="danger" 면 확인 단추가 경고색(되돌릴 수 없는 일).
 */
import type { ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

export function ConfirmDialog({ open = true, title, children, confirmLabel = '확인', cancelLabel = '취소', tone, danger = false, onConfirm, onCancel }: {
    open?: boolean;
    title: string;
    children?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    /** 확인 단추 색 — accent(기본) · danger(되돌릴 수 없는 일) */
    tone?: 'accent' | 'danger';
    /** @deprecated tone="danger" */
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <Dialog
            open={open}
            title={title}
            onClose={onCancel}
            footer={(
                <>
                    <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
                    <Button variant="solid" tone={tone ?? (danger ? 'danger' : 'accent')} onClick={onConfirm}>{confirmLabel}</Button>
                </>
            )}
        >
            {children}
        </Dialog>
    );
}
