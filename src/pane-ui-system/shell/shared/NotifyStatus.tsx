/**
 * 상태바 🔔 — 안 읽은 알림 수를 비추고, 누르면 알림 패널(기록)이 단추 위로 열린다.
 * 🔴 ⛔ 색은 토큰으로만(구조 검사 ①) · 도메인 낱말 0(⑤). 패널을 열어 둔 동안 오는 알림도 읽음으로 친다.
 */
import { useEffect, useRef, useState } from 'react';
import { Popover } from '../../primitives/Popover';
import { FOCUS_RING } from '../../primitives/focus';
import { Icon } from '../../primitives/Icon';
import {
    useNotifications, markAllRead, clearNotifications, runNotifyAction, type NotifyItem,
} from '../../plugin/notify';
import { LEVEL_STYLE, ownerName } from './Toasts';

function timeText(at: number): string {
    try { return new Date(at).toLocaleString(); } catch { return ''; }
}

function Entry({ it }: { it: NotifyItem }) {
    const st = LEVEL_STYLE[it.level];
    const who = ownerName(it.owner);
    return (
        <li className={`flex items-start gap-2 px-2 py-1.5 border-b border-line last:border-b-0 ${it.read ? 'opacity-70' : ''}`}>
            <Icon name={st.icon} size={14} className={`mt-0.5 shrink-0 ${st.text}`} />
            <div className="flex-1 min-w-0">
                <div className="text-[13px] text-text break-words">{it.title}</div>
                {it.body && <div className="text-[12px] text-muted break-words">{it.body}</div>}
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                    <span>{timeText(it.at)}</span>{who && <span>{who}</span>}
                    {it.action && (
                        <button
                            type="button"
                            onClick={() => runNotifyAction(it.id)}
                            className={`h-5 px-1.5 rounded border border-line text-text hover:bg-text/[0.06] ${FOCUS_RING}`}
                        >
                            {it.action.label}
                        </button>
                    )}
                </div>
            </div>
        </li>
    );
}

export function NotifyStatus() {
    const { items, unread } = useNotifications();
    const btn = useRef<HTMLButtonElement>(null);
    const [anchor, setAnchor] = useState<DOMRect | null>(null);

    useEffect(() => { if (anchor && unread > 0) markAllRead(); }, [anchor, unread]);

    return (
        <>
            <button
                ref={btn}
                type="button"
                aria-label={unread > 0 ? `알림 ${unread}건 안 읽음` : '알림'}
                onClick={() => setAnchor(anchor ? null : btn.current?.getBoundingClientRect() ?? null)}
                className={`flex items-center gap-1 px-1 rounded hover:text-text hover:bg-text/[0.06] transition-colors ${FOCUS_RING}`}
            >
                <Icon name="bell" size={13} />
                {unread > 0 && <span className="text-accent">{unread}</span>}
            </button>
            {anchor && (
                <Popover anchor={anchor} align="right" width={340} onClose={() => setAnchor(null)}>
                    <div className="flex items-center justify-between px-2 pb-1 text-[12px] text-muted">
                        <span>알림 {items.length}건</span>
                        {items.length > 0 && (
                            <button type="button" onClick={clearNotifications} className={`rounded px-1 hover:text-text ${FOCUS_RING}`}>
                                비우기
                            </button>
                        )}
                    </div>
                    {items.length === 0
                        ? <div className="px-2 py-3 text-[12px] text-muted">알림이 없습니다.</div>
                        : <ul className="max-h-[60vh] overflow-y-auto">{[...items].reverse().map((it) => <Entry key={it.id} it={it} />)}</ul>}
                </Popover>
            )}
        </>
    );
}
