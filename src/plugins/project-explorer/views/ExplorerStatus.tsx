/**
 * 상태바 항목 — 「노드 N · 휴지통 M」(M=0 이면 「노드 N」만). 설계 「여기서 죽는다: 휴지통 N 을 늘 보인다」.
 *   스토어를 스스로 구독(useExplorer)해 나무가 바뀔 때마다 다시 그린다(pane-test OpenCountStatus 와 같은 결).
 */
import { countUnder } from '../model/tree';
import { isRecordType } from '../model/types';
import { useExplorer } from '../store';

export function ExplorerStatus() {
    const { tree, notice } = useExplorer();
    if (notice) return <span className="text-[12px] text-bad">{notice}</span>;
    // 🔴 레코드성(일정 등)은 「상위 노드의 데이터」라 세지 않는다(쥔님 2026-11-02) — flatten·휴지통 줄과 같은 규칙.
    const nodes = countUnder(tree, tree.root, isRecordType);
    const trash = countUnder(tree, tree.trash, isRecordType);
    return <span className="text-[12px] text-muted">{trash > 0 ? `노드 ${nodes} · 휴지통 ${trash}` : `노드 ${nodes}`}</span>;
}
