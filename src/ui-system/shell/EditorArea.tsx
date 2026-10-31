/**
 * leaf 몸통 자리 — 활성 leaf 하나를 뷰 등록소로 그린다. 등록 안 된 viewId 면 이름만 옅게.
 * leaf 가 없으면(빈 묶음) 빈 상태 한 줄.
 * 🔴 창틀은 viewId 가 무엇인지 모른다 — 등록소에서 받은 Component 를 그릴 뿐이다.
 */
import type { Leaf } from '../layout/tree';
import { getView } from '../view-registry';

export function EditorArea({ leaf }: { leaf: Leaf | null }) {
    if (!leaf) {
        return (
            <div className="flex-1 min-h-0 grid place-items-center bg-bg overflow-hidden px-6 text-center">
                <p className="text-[13px] text-muted/80 select-none">열린 탭이 없습니다. 위 + 로 새 탭을 엽니다.</p>
            </div>
        );
    }
    const def = getView(leaf.viewId);
    if (!def) {
        return (
            <div className="flex-1 min-h-0 grid place-items-center bg-bg overflow-hidden px-6 text-center">
                <p className="text-2xl font-light text-muted/50 select-none truncate max-w-full">{leaf.title}</p>
            </div>
        );
    }
    const Body = def.Component;
    return (
        <div className="flex-1 min-h-0 overflow-hidden bg-bg">
            <Body leaf={leaf} />
        </div>
    );
}
