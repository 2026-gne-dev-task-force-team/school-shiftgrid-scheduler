/**
 * 상태바 항목 — 열린 시험 뷰 수. 스토어를 스스로 구독해 작업대가 바뀔 때마다 다시 그린다.
 */
import { useOpenViewCount } from '../store';

export function OpenCountStatus() {
    const n = useOpenViewCount();
    return <span className="text-[12px] text-muted">시험 뷰 {n}</span>;
}
