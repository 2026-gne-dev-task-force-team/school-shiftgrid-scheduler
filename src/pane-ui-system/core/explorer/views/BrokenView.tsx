/**
 * 깨진 항목 열기 화면 — 저장소 레코드가 깨져 노드로 못 읽힌 항목(type·name·children 이상). 무엇이 잘못됐는지 한 줄 + 「휴지통으로 보내기」.
 *   🔴 자료는 안 바꾼다(자동 복구 ⛔) — 휴지통으로 보내도 원래 레코드가 그대로 저장소에 남는다(복원도 그대로).
 */
import { useEffect, useSyncExternalStore } from 'react';
import { EmptyState } from '../../../primitives/EmptyState';
import { setLeafTitle } from '../../../plugin';
import type { ViewProps } from '../../..';
import { getState, subscribeState, trashNode } from '../../node-store/store';
import { isTrashed } from '../../node-frame/api';
import { brokenDataOf } from '../../nodes/model/broken';

export function BrokenView({ leaf }: Pick<ViewProps, 'leaf'>) {
    const id = typeof leaf?.params?.nodeId === 'string' ? leaf.params.nodeId : null;
    const tree = useSyncExternalStore(subscribeState, () => getState().tree);
    const node = id ? tree.nodes[id] : undefined;
    const leafId = leaf?.id;
    useEffect(() => { if (leafId) setLeafTitle(leafId, node ? node.name : '삭제된 항목'); }, [leafId, node?.name]);
    if (!id || !node) return <EmptyState icon="warn" title="삭제된 항목입니다" description="이 깨진 항목은 이미 없습니다." />;
    const b = brokenDataOf(node);
    const why = b ? b.reasons.join(' · ') : '알 수 없음';
    if (isTrashed(id)) {
        return <EmptyState icon="trash" title="휴지통에 있는 깨진 항목입니다" description={`깨진 곳: ${why}. 자료는 저장소에 그대로 남아 있습니다.`} />;
    }
    return (
        <EmptyState icon="warn" title="이 항목의 자료가 깨져 열 수 없습니다"
            description={<>무엇이: {why}. 자료는 저장소에 그대로 남아 있고 고쳐 쓰지 않습니다 — 아래 단추로 휴지통에 보내 두세요.</>}
            action={{ label: '휴지통으로 보내기', icon: 'trash', onClick: () => trashNode(id) }} />
    );
}
