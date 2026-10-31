/**
 * 오른쪽 패널 — 머리 한 줄 + 빈 몸통. 이번 판에선 내용 없음(속성 폼은 범위 밖).
 */
import { SectionHeader } from '../primitives/SectionHeader';
export function RightPanel({ title }: { title: string }) {
    return (
        <div className="flex flex-col h-full min-h-0">
            {/* 🔴 머리는 왼쪽 칸과 같은 조각을 쓴다 — 따로 그리면 높이·글꼴이 조용히 어긋난다 */}
            <SectionHeader title={title} />
            {/* 🔴 빈 몸통엔 여백도 상자도 없다 — 내용이 생길 때 그 내용이 자기 여백을 쥔다 */}
            <div className="flex-1 min-h-0 overflow-auto" />
        </div>
    );
}
