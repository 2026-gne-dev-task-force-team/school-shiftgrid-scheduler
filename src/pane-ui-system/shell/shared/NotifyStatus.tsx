/**
 * 상태바 🔔 — 안 읽은 알림 수를 비추고, 누르면 알림 패널(사이드 뷰)을 연다(frame.view.notify 명령).
 * 🔴 ⛔ 색은 토큰으로만(구조 검사 ①) · 도메인 낱말 0(⑤). 패널 자체는 NotifyPanel.
 */
import { FOCUS_RING } from '../../primitives/focus';
import { Icon } from '../../primitives/Icon';
import { useNotifications } from '../../plugin/notify';
import { runCommand } from '../../plugin/store';
import { FRAME_COMMAND } from '../../frame-commands';

export function NotifyStatus() {
    const { unread } = useNotifications();
    return (
        <button
            type="button"
            aria-label={unread > 0 ? `알림 ${unread}건 안 읽음` : '알림'}
            onClick={() => runCommand(FRAME_COMMAND.openNotify)}
            className={`flex items-center gap-1 px-1 rounded hover:text-text hover:bg-text/[0.06] transition-colors ${FOCUS_RING}`}
        >
            <Icon name="bell" size={13} />
            {unread > 0 && <span className="text-accent">{unread}</span>}
        </button>
    );
}
