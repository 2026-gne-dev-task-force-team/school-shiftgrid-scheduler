/**
 * 탭 내용 영역 — 이번 판에선 빈 면이다.
 * 열린 탭이 있으면 그 이름만 가운데 옅게, 하나도 없으면 빈 상태 한 줄.
 * 🔴 기능 0 — 격자·카드·시간축은 없다.
 */
import type { TabItem } from './Tabs';

export function EditorArea({ tab }: { tab: TabItem | null }) {
    return (
        <div className="flex-1 min-h-0 grid place-items-center bg-bg overflow-hidden px-6 text-center">
            {tab ? (
                <p className="text-2xl font-light text-muted/50 select-none truncate max-w-full">{tab.title}</p>
            ) : (
                <p className="text-[13px] text-muted/80 select-none">열린 표가 없습니다. 위 + 로 새 표를 엽니다.</p>
            )}
        </div>
    );
}
