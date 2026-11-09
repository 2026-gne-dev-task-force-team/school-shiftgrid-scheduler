/**
 * 「휴지통으로 옮길까요?」 확인 — 탐색기와 노드 틀이 같은 창·같은 글을 쓴다(R3 삭제 확인 한 꼴).
 *   문구(msg)는 타입의 confirmDelete 가 준 경고(confirmDeleteMsg) 그대로.
 */
import { ConfirmDialog } from '../../../pane-ui-system';

export function TrashConfirm({ msg, onConfirm, onCancel }: { msg: string; onConfirm: () => void; onCancel: () => void }) {
    return (
        <ConfirmDialog title="휴지통으로 옮길까요?" danger confirmLabel="휴지통으로" onCancel={onCancel} onConfirm={onConfirm}>
            {msg}
        </ConfirmDialog>
    );
}
