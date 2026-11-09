/**
 * 계정 편집 탭(가운데) — 탐색기에서 사용자·역할·정책 노드를 누르면 열린다. 「지금 그리는 노드」의 종류에 맞는 편집기를 그린다.
 *   page 와 같은 결: 하나의 탭이 「지금 열린 노드」를 따라 바뀐다(싱글턴 뷰).
 *   🔴 보기 권한이 없으면(그 사이 세션이 바뀌어) 안내만 — 노드가 숨겨지면 탐색기에서 못 열지만, 열린 뒤 전환 대비.
 */
import { useSyncExternalStore } from 'react';
import { getActiveAccountNode, subscribeActiveNode } from '../nodes';
import { nodeKindOf } from '../core';
import { useAccountVersion } from './useAccount';
import { UserEditor } from './UserEditor';
import { RoleEditor } from './RoleEditor';
import { PolicyEditor } from './PolicyEditor';
import { AccountList } from './AccountList';
import { Icon } from '../../../pane-ui-system';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import type { PeekHandle } from '../../../pane-ui-system';
import { parentOf } from '../core';
import { setActiveAccountNode } from '../nodes';

export function AccountEditor({ host, peek }: { host?: PluginHost; peek?: PeekHandle }) {
    useAccountVersion();   // 세션·데이터가 바뀌면 다시 그린다(종류 판정이 달라질 수 있다)
    const id = useSyncExternalStore(subscribeActiveNode, getActiveAccountNode, getActiveAccountNode);
    const kind = id ? nodeKindOf(id) : null;

    if (!id || !kind) {
        return <p className="text-[12px] text-muted p-4">탐색기에서 사용자·역할·정책을 누르면 여기서 편집합니다.</p>;
    }
    if (kind === 'users' || kind === 'roles') return <AccountList kind={kind} host={host} peek={peek} />;   // 옛 열기 경로 대비
    // 사용자·역할 편집기 위에 「← 목록」 — 나무에 안 보이니 목록으로 돌아갈 길을 여기 둔다
    const back = (
        <button type="button" onClick={() => { const p = parentOf(id); if (p) setActiveAccountNode(p); }}
            className="flex items-center gap-1 m-2 mb-0 px-2 h-7 rounded text-[12px] text-muted hover:text-text hover:bg-text/[0.06]">
            <Icon name="left" size={12} /> {kind === 'user' ? '사용자 목록' : '역할 목록'}
        </button>
    );
    if (kind === 'user') return <div className="flex flex-col">{back}<UserEditor userId={id} /></div>;
    if (kind === 'role') return <div className="flex flex-col">{back}<RoleEditor roleId={id} /></div>;
    return <PolicyEditor />;
}
