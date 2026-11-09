/**
 * ConfirmDialog — 「~할까요?」 확인. window.confirm 대신. danger 면 확인 단추가 경고색(되돌릴 수 없는 일).
 */
import type { ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

export function ConfirmDialog({ open = true, title, children, confirmLabel = '확인', cancelLabel = '취소', danger = false, onConfirm, onCancel }: {
    open?: boolean;
    title: string;
    children?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
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
                    <Button onClick={onCancel}>{cancelLabel}</Button>
                    <Button variant="accent" onClick={onConfirm} className={danger ? 'border-bad text-bad' : ''}>{confirmLabel}</Button>
                </>
            )}
        >
            {children}
        </Dialog>
    );
}
