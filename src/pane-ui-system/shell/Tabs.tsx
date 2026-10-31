/**
 * 탭 줄 — 한 tabs 노드의 탭들을 그린다. 열기(+)·닫기(×)·전환이 실제로 돈다.
 * 가르기(⬓) 단추로 이 묶음을 좌우로 쪼갠다(드래그 재배치는 W6·W7 몫 — 여기선 안 한다).
 * 각 탭은 Row 조각이다 — 닫기 ×는 revealOnHover 로, 손가락 기기에선 늘 보인다(Row 안에).
 * 좁은 화면에선 왼쪽/오른쪽 서랍을 여는 단추를 탭 줄 양 끝에 둔다.
 *
 * 🔴 아이콘은 트리 leaf 가 정하는 게 아니라 뷰 등록소가 준다 — 여기선 받은 icon 을 그대로 그린다.
 */
import type { MouseEvent } from 'react';
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
    tabs, activeId, onSelect, onClose, onAdd, onSplit,
    narrow = false, onOpenLeft, onOpenRight, onOpenSettings,
}: {
    tabs: TabItem[];
    activeId: string | null;
    onSelect: (id: string) => void;
    onClose: (id: string) => void;
    onAdd: () => void;
    /** 좌우로 가르기 — 안 주면 가르기 단추를 안 그린다(좁은 화면 등) */
    onSplit?: () => void;
    narrow?: boolean;
    onOpenLeft?: () => void;
    onOpenRight?: () => void;
    /** 좁은 화면엔 레일이 없다 — 설정 손잡이를 탭 줄에 붙인다 */
    onOpenSettings?: () => void;
}) {
    return (
        // 🔴 탭 줄은 한 단 어둡다(bg-panel2) — 활성 탭만 에디터 바탕(bg-bg)이라 그 대비로 경계가 읽힌다.
        //    ⛔ 탭 줄을 에디터와 같은 색으로 두지 말 것 — 탭이 서로 붙어 보인다(쥔님 지적 2026-10-31).
        <div className="shrink-0 flex items-center h-topbar border-b border-line bg-panel2">
            {/* ⭐ 사이드바 토글은 옵시디언처럼 탭 줄 양 끝에 산다 — 넓은 화면에서도 */}
            {onOpenLeft && (
                <IconButton icon="panelLeft" label="왼쪽 사이드바" onClick={onOpenLeft} className="mx-pad shrink-0" />
            )}

            {/* ⛔ 탭 사이 간격을 두지 않는다 — 구분은 간격이 아니라 1px 선이 한다(Row variant='tab') */}
            <div className="flex-1 min-w-0 flex items-stretch overflow-x-auto border-l border-line">
                {tabs.map((t) => (
                    <Row
                        key={t.id}
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

            <div className="flex items-center gap-1 px-pad shrink-0">
                {onSplit && tabs.length > 0 && (
                    <IconButton icon="split" label="좌우로 가르기" onClick={onSplit} />
                )}
                <IconButton icon="plus" label="새 탭" onClick={onAdd} />
                {narrow && onOpenSettings && (
                    <IconButton icon="gear" label="설정 열기" onClick={onOpenSettings} />
                )}
            </div>
            {onOpenRight && (
                <IconButton icon="panelRight" label="오른쪽 사이드바" onClick={onOpenRight} className="mr-pad shrink-0" />
            )}
        </div>
    );
}
