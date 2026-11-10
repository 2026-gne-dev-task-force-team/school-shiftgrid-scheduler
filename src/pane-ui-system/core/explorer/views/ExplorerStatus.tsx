/**
 * 상태바 항목 — 「노드 N · 휴지통 M」(M=0 이면 「노드 N」만). 설계 「여기서 죽는다: 휴지통 N 을 늘 보인다」.
 *   스토어를 스스로 구독(useExplorer)해 나무가 바뀔 때마다 다시 그린다(pane-test OpenCountStatus 와 같은 결).
 */
import { countUnder } from '../../nodes/model/tree';
import { isRecordType, nodeHidden } from '../../nodes/model/types';
import { useExplorer } from '../../node-store/store';

export function ExplorerStatus() {
    const { tree } = useExplorer();
    // 🔴 레코드성(일정 등)은 「상위 노드의 데이터」라 세지 않는다(쥔님 2026-11-02) — flatten·휴지통 줄과 같은 규칙.
    const nodes = countUnder(tree, tree.root, isRecordType);
    // 🔴 휴지통 수는 하단 「휴지통 (N)」과 같은 기준 — 사용자가 휴지통에서 보는 최상위 항목(숨김 제외)
    const trash = (tree.nodes[tree.trash]?.children ?? []).filter((id) => { const n = tree.nodes[id]; return !!n && !nodeHidden(n); }).length;
    return <span className="text-small text-muted">{trash > 0 ? `항목 ${nodes} · 휴지통 ${trash}` : `항목 ${nodes}`}</span>;
}
