/**
 * 가운데 탭 — 열기(+)·닫기(×)·전환이 실제로 돈다. 스플릿·드래그 재배치는 없다(이번 판 범위 밖).
 * 각 탭은 Row 조각이다 — 닫기 ×는 revealOnHover 로, 손가락 기기에선 늘 보인다(함정 방지는 Row 안에).
 * 좁은 화면에선 왼쪽/오른쪽 서랍을 여는 단추를 탭 줄 양 끝에 둔다.
 */
import type { MouseEvent } from 'react';
import { Row } from '../primitives/Row';
import { IconButton } from '../primitives/IconButton';

export interface TabItem {
    id: string;
    title: string;
}

export function Tabs({
    tabs, activeId, onSelect, onClose, onAdd,
    narrow = false, onOpenLeft, onOpenRight,
}: {
    tabs: TabItem[];
    activeId: string | null;
    onSelect: (id: string) => void;
    onClose: (id: string) => void;
    onAdd: () => void;
    narrow?: boolean;
    onOpenLeft?: () => void;
    onOpenRight?: () => void;
}) {
    return (
        <div className="shrink-0 flex items-center gap-1 h-10 px-1.5 border-b border-line bg-bg">
            {narrow && onOpenLeft && (
                <IconButton icon="panelLeft" label="왼쪽 서랍 열기" onClick={onOpenLeft} />
            )}

            <div className="flex-1 min-w-0 flex items-stretch gap-1 overflow-x-auto py-1">
                {tabs.map((t) => (
                    <Row
                        key={t.id}
                        icon="table"
                        label={t.title}
                        active={t.id === activeId}
                        onClick={() => onSelect(t.id)}
                        title={t.title}
                        className="max-w-[160px] shrink-0"
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

            <IconButton icon="plus" label="새 표" onClick={onAdd} />
            {narrow && onOpenRight && (
                <IconButton icon="panelRight" label="오른쪽 서랍 열기" onClick={onOpenRight} />
            )}
        </div>
    );
}
