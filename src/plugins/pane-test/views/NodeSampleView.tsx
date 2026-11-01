/**
 * 노드 샘플 뷰(N4) — 프로젝트 탐색기의 `pane-test.sample` 노드를 「열면」 뜨는 탭.
 *   🔴 열기는 nodeId 만 params 로 받는다(탐색기는 뷰를 모르고, 뷰는 노드 모델을 모른다 — params 한 줄로만 잇는다).
 *   ⭐ 「다른 플러그인이 타입을 꽂아 그 노드를 제 뷰로 연다」를 눈으로 보이는 최소 증명.
 */
import type { ViewProps } from '../../../pane-ui-system/plugin';

export function NodeSampleView({ p }: { p: ViewProps }) {
    const nodeId = (p.leaf.params?.nodeId as string | undefined) ?? '(없음)';
    return (
        <div className="h-full flex flex-col items-center justify-center gap-3 p-4 text-center select-text">
            <div className="px-5 py-3 rounded-lg bg-accent/15">
                <span className="text-xl font-bold text-accent">샘플 노드</span>
            </div>
            <p className="text-[12px] text-muted">노드 id: <span className="text-text">{nodeId}</span></p>
            <p className="text-[12px] text-muted">프로젝트 탐색기가 꽂은 타입(pane-test.sample)을 연 탭입니다 · 칸 {p.width}×{p.height}px</p>
        </div>
    );
}
