/**
 * 상태바 항목(N4) — 탐색기 노드 수. nodes.subscribe 가 센 값을 비춘다(「노드 N」 증명).
 *   🔴 탐색기가 꺼져 있으면(없으면) 아예 안 뜬다 — index.ts 가 api 를 못 받으면 상태바를 안 단다.
 */
import { useNodeCount } from '../store';

export function NodeCountStatus() {
    const n = useNodeCount();
    return <span className="text-[12px] text-muted">항목 {n}</span>;
}
