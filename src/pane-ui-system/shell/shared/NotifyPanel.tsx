/**
 * 알림 패널 — 알림 기록 전체를 한 화면에(창틀 내장 사이드 뷰 · 상태바 🔔·리본 🔔 가 연다).
 * 🔴 ⛔ 색은 토큰으로만(구조 검사 ①) · 도메인 낱말 0(⑤). 스토어(plugin/notify)만 읽고 쓴다.
 * ⭐ 패널이 떠 있는 동안 오는 알림도 읽음으로 친다(보고 있으니까).
 */
import { useEffect, useState } from 'react';
import { Button } from '../../primitives/Button';
import { Icon } from '../../primitives/Icon';
import { ViewHeader } from '../../primitives/ViewHeader';
import {
    useNotifications, markAllRead, clearNotifications, runNotifyAction, type NotifyItem,
} from '../../plugin/notify';
import { LEVEL_STYLE, ownerName } from './Toasts';

function timeText(at: number): string {
    try { return new Date(at).toLocaleString('ko-KR'); } catch { return ''; }
}

function Entry({ it }: { it: NotifyItem }) {
    const st = LEVEL_STYLE[it.level];
    const who = ownerName(it.owner);
    return (
        <li className={`flex items-start gap-2 px-pad py-2 border-b border-line ${it.read ? 'opacity-70' : ''}`}>
            <Icon name={st.icon} size={14} className={`mt-0.5 shrink-0 ${st.text}`} />
            <div className="flex-1 min-w-0">
                <div className="text-body text-text break-words">{it.title}</div>
                {it.body && <div className="text-small text-muted break-words">{it.body}</div>}
                <div className="mt-1 flex items-center gap-2 text-note text-muted">
                    <span>{timeText(it.at)}</span>{who && <span>{who}</span>}
                    {it.action && <Button size="sm" onClick={() => runNotifyAction(it.id)}>{it.action.label}</Button>}
                </div>
            </div>
        </li>
    );
}

export function NotifyPanel() {
    const { items, unread } = useNotifications();
    const [owner, setOwner] = useState<string | null>(null);

    useEffect(() => { if (unread > 0) markAllRead(); }, [unread]);

    // 거르기 칩 — 기록에 실제로 있는 보낸이만(없어진 보낸이를 고르고 있었으면 전체로 돌아간다)
    const owners = [...new Set(items.map((i) => i.owner))];
    const sel = owner !== null && owners.includes(owner) ? owner : null;
    const shown = (sel === null ? items : items.filter((i) => i.owner === sel)).slice().reverse();

    return (
        <div className="h-full flex flex-col min-h-0">
            <ViewHeader
                icon={<Icon name="bell" size={14} />}
                title={`알림 ${items.length}건`}
                actions={items.length > 0 && <Button size="sm" onClick={clearNotifications}>비우기</Button>}
            />
            {owners.length > 1 && (
                <div className="shrink-0 flex flex-wrap gap-1 px-pad py-1.5 border-b border-line">
                    <Button size="sm" variant={sel === null ? 'accent' : 'ghost'} onClick={() => setOwner(null)}>전체</Button>
                    {owners.map((o) => (
                        <Button key={o} size="sm" variant={sel === o ? 'accent' : 'ghost'} onClick={() => setOwner(o)}>
                            {ownerName(o) || o}
                        </Button>
                    ))}
                </div>
            )}
            {shown.length === 0
                ? <div className="px-pad py-4 text-small text-muted">알림이 없습니다.</div>
                : <ul className="flex-1 min-h-0 overflow-y-auto">{shown.map((it) => <Entry key={it.id} it={it} />)}</ul>}
        </div>
    );
}
