/**
 * 오른쪽 패널 — 머리 한 줄 + 빈 몸통. 이번 판에선 내용 없음(속성 폼은 범위 밖).
 */
export function RightPanel({ title }: { title: string }) {
    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="shrink-0 flex items-center h-header px-pad border-b border-line">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</span>
            </div>
            {/* 🔴 빈 몸통엔 여백도 상자도 없다 — 내용이 생길 때 그 내용이 자기 여백을 쥔다 */}
            <div className="flex-1 min-h-0 overflow-auto" />
        </div>
    );
}
