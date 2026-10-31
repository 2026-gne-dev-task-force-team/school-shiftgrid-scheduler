/**
 * 탭 줄 — 한 tabs 노드의 탭들을 그린다. 열기·닫기·전환이 실제로 돈다.
 * 각 탭은 Row 조각이다 — 닫기 ×는 revealOnHover 로, 손가락 기기에선 늘 보인다(Row 안에).
 *
 * 🔴 ⭐ 단추는 하드코딩하지 않는다 — 바깥 끝(leading/trailing)·액션 묶음(actions)을 슬롯으로 받는다.
 *    가운데는 「+새 탭·좌우 가르기」, 사이드바는 「위아래 가르기·📌·접기」로 서로 다른 단추가 들어온다.
 *    그 조립은 WorkspaceView(셸)가 하고, 여기선 자리만 잡는다.
 * 🔴 아이콘은 트리 leaf 가 정하는 게 아니라 뷰 등록소가 준다 — 여기선 받은 icon 을 그대로 그린다.
 */
import type { MouseEvent, ReactNode } from 'react';
import { Row } from '../primitives/Row';
import { IconButton } from '../primitives/IconButton';
import type { IconName } from '../primitives/Icon';

export interface TabItem {
    id: string;
    title: string;
    /** 탭 앞 아이콘 — 뷰 등록소가 준다. 없으면 기본 네모 */
    icon?: IconName;
}

export function Tabs({
    tabs, activeId, onSelect, onClose,
    leading, trailing, actions,
}: {
    tabs: TabItem[];
    activeId: string | null;
    onSelect: (id: string) => void;
    onClose: (id: string) => void;
    /** 바깥 왼쪽 끝 자리 — 사이드바 접기(왼쪽)·좁은 화면 왼쪽 서랍 열기 */
    leading?: ReactNode;
    /** 바깥 오른쪽 끝 자리 — 사이드바 접기(오른쪽)·좁은 화면 오른쪽 서랍 열기 */
    trailing?: ReactNode;
    /** 탭 묶음 바로 뒤 액션 묶음 — +새 탭·가르기·📌·설정 */
    actions?: ReactNode;
}) {
    return (
        // 🔴 탭 줄은 한 단 어둡다(bg-panel2) — 활성 탭만 에디터 바탕(bg-bg)이라 그 대비로 경계가 읽힌다.
        //    ⛔ 탭 줄을 에디터와 같은 색으로 두지 말 것 — 탭이 서로 붙어 보인다(쥔님 지적 2026-10-31).
        <div className="shrink-0 flex items-center h-topbar border-b border-line bg-panel2">
            {leading}

            {/* ⛔ 탭 사이 간격을 두지 않는다 — 구분은 간격이 아니라 1px 선이 한다(Row variant='tab') */}
            <div className="flex-1 min-w-0 flex items-stretch overflow-x-auto border-l border-line">
                {tabs.map((t) => (
                    <Row
                        key={t.id}
                        rowId={t.id}
                        icon={t.icon ?? 'table'}
                        label={t.title}
                        active={t.id === activeId}
                        onClick={() => onSelect(t.id)}
                        title={t.title}
                        className="max-w-[160px] shrink-0"
                        variant="tab"
                        revealOnHover
                        end={
                            <IconButton
                                icon="x"
                                label={`${t.title} 닫기`}
                                size={13}
                                className="w-5 h-5"
                                onClick={(e: MouseEvent) => { e.stopPropagation(); onClose(t.id); }}
                            />
                        }
                    />
                ))}
            </div>

            {actions && <div className="flex items-center gap-1 px-pad shrink-0">{actions}</div>}
            {trailing}
        </div>
    );
}
