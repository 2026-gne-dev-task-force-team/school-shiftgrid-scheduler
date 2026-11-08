/**
 * 계정 편집 탭(가운데) — 탐색기에서 사용자·역할·정책 노드를 누르면 열린다. 「지금 그리는 노드」의 종류에 맞는 편집기를 그린다.
 *   page-editor 와 같은 결: 하나의 탭이 「지금 열린 노드」를 따라 바뀐다(싱글턴 뷰).
 *   🔴 보기 권한이 없으면(그 사이 세션이 바뀌어) 안내만 — 노드가 숨겨지면 탐색기에서 못 열지만, 열린 뒤 전환 대비.
 */
import { useSyncExternalStore } from 'react';
import { getActiveAccountNode, subscribeActiveNode } from '../nodes';
import { nodeKindOf } from '../core';
import { useAccountVersion } from './useAccount';
import { UserEditor } from './UserEditor';
import { RoleEditor } from './RoleEditor';
import { PolicyEditor } from './PolicyEditor';

export function AccountEditor() {
    useAccountVersion();   // 세션·데이터가 바뀌면 다시 그린다(종류 판정이 달라질 수 있다)
    const id = useSyncExternalStore(subscribeActiveNode, getActiveAccountNode, getActiveAccountNode);
    const kind = id ? nodeKindOf(id) : null;

    if (!id || !kind) {
        return <p className="text-[12px] text-muted p-4">탐색기에서 사용자·역할·정책을 누르면 여기서 편집합니다.</p>;
    }
    if (kind === 'user') return <UserEditor userId={id} />;
    if (kind === 'role') return <RoleEditor roleId={id} />;
    return <PolicyEditor />;
}
