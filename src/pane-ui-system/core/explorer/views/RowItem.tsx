/**
 * 탐색기 줄 하나 — React.memo. 🔴 렌더 비용이 줄 목록 만들기(buildMainRows ≈ 1~6ms)가 아니라 「줄 N개를 매번 다시 그리기」라서
 *   (2,000 노드 실측: 목록 1~6ms ↔ 펴기 렌더 300~700ms), 줄마다 props 를 값으로 좁혀 안 바뀐 줄은 건너뛴다.
 *   handlers(h)는 ExplorerView 가 한 번 만든 안정 객체 — 안의 함수는 늘 최신 클로저를 부른다(그래서 memo 가 안 깨진다).
 */
import { memo } from 'react';
import { Icon, NodeIcon, IconButton, InlineRename } from '../../..';
import { emojiOf, iconOf, isKnownType, canDo } from '../../nodes/model/types';
import { select, toggle, cancelRename, commitRename } from '../../node-store/store';
import type { ExplorerRow } from './rows';

export const INDENT = 12;
export const BASE_PAD = 6;

export interface RowHandlers {
    clickRow: (row: ExplorerRow, e: React.MouseEvent) => void;
    nodeClick: (row: ExplorerRow, e: React.MouseEvent, secHead: boolean) => void;
    dblRow: () => void;
    hover: (id: string) => void;
    unhover: (id: string) => void;
    iconPick: (id: string, rect: DOMRect) => void;
    menuAt: (id: string, r: DOMRect) => void;
}

export interface RowItemProps {
    row: ExplorerRow;
    h: RowHandlers;
    secHead: boolean;
    isSel: boolean;
    isFocus: boolean;
    /** 드래그 미리보기가 「이 줄 안으로」일 때: ok 면 'ok' · 아니면 'bad' · 아니면 null */
    into: 'ok' | 'bad' | null;
    hovered: boolean;
    narrow: boolean;
    /** 이름바꾸는 줄이면 그 입력 상태 — 아니면 null(다른 줄은 이 값이 바뀌어도 안 다시 그린다) */
    renaming: { kind: string; initial: string | null; placeholder: string | null } | null;
    /** 플러그인 등록 표 버전 — 바뀌면 모든 줄이 다시 그린다(모르는 타입 회색 · 아이콘 · can) */
    reg: unknown;
}

function RowItemImpl({ row, h, secHead, isSel, isFocus, into, hovered, narrow, renaming }: RowItemProps) {
    const isInto = into !== null;
    const isRenaming = renaming !== null;
    const renameKind = renaming?.kind ?? 'name';
    const renameInitial = renaming?.initial ?? null;
    const renamePlaceholder = renaming?.placeholder ?? null;

    // 🔴 유도(가상) 줄 — 회색 글자, 이름바꾸기·드래그 없음(data-row-id 는 둬 드롭에서 자동 거부된다).
    if (row.kind === 'virtual') {
        return (
            <div
                key={row.id}
                data-row-id={row.id}
                role="treeitem"
                aria-selected={isSel}
                title={row.name}
                onClick={(e) => h.clickRow(row, e)}
                onDoubleClick={h.dblRow}
                className={`flex items-center gap-1 h-row pr-2 cursor-pointer select-none transition-colors ${
                    isSel ? 'bg-accent/15' : 'hover:bg-text/[0.04]'
                }`}
                style={{ paddingLeft: row.depth * INDENT + BASE_PAD }}
            >
                {row.hasChildren ? (
                    <span className="shrink-0 grid place-items-center w-4 h-4 text-muted">
                        <Icon name="right" size={12} className="rotate-90" />
                    </span>
                ) : (
                    <span className="shrink-0 w-4" />
                )}
                <Icon name={row.icon ?? 'dot'} size={15} className="shrink-0 text-muted" />
                <span className="flex-1 min-w-0 truncate text-body leading-none text-muted italic">
                    {row.name}
                </span>
            </div>
        );
    }
    
    const known = isKnownType(row.node.type);
        return (
        <div
            key={row.id}
            data-row-id={row.id}
            role="treeitem"
            aria-selected={isSel}
            aria-expanded={row.hasChildren || secHead ? !row.node.collapsed : undefined}
            title={row.node.name}
            onClick={(e) => {
                // 섹션 머리줄은 맨 클릭 = 접기/펴기(휴지통처럼). Ctrl·Shift·드래그 직후는 원래 길로
                h.nodeClick(row, e, secHead);
            }}
            onDoubleClick={h.dblRow}
            onMouseEnter={() => h.hover(row.id)}
            onMouseLeave={() => h.unhover(row.id)}
            aria-current={isFocus ? true : undefined}
            className={`flex items-center gap-1 h-row pr-2 cursor-pointer select-none transition-colors ${
                isSel ? 'bg-accent/15' : 'hover:bg-text/[0.04]'
            } ${isInto ? (into === 'ok' ? 'ring-1 ring-inset ring-accent' : 'ring-1 ring-inset ring-bad') : isFocus ? 'ring-1 ring-inset ring-accent/40' : ''}`}
            style={{ paddingLeft: row.depth * INDENT + BASE_PAD }}
        >
            {secHead ? (
                <Icon name="right" size={11} className={`shrink-0 mx-0.5 text-muted transition-transform ${row.node.collapsed ? '' : 'rotate-90'}`} />
            ) : row.hasChildren ? (
                <span
                    role="button"
                    aria-label={row.node.collapsed ? '펴기' : '접기'}
                    onClick={(e) => { e.stopPropagation(); select(row.id); toggle(row.id); }}
                    className="shrink-0 grid place-items-center w-4 h-4 text-muted"
                >
                    <Icon name="right" size={12} className={`transition-transform ${row.node.collapsed ? '' : 'rotate-90'}`} />
                </span>
            ) : (
                <span className="shrink-0 w-4" />
            )}
    
            <span
                role={secHead ? undefined : 'button'}
                aria-label={secHead ? undefined : '아이콘 바꾸기'}
                className="shrink-0 grid place-items-center"
                onClick={secHead || !canDo(row.node.type, row.id, 'rename') ? undefined : (e) => {
                    e.stopPropagation(); select(row.id);
                    h.iconPick(row.id, e.currentTarget.getBoundingClientRect());
                }}
                onDoubleClick={secHead ? undefined : (e) => e.stopPropagation()}
            >
            {emojiOf(row.node)
                ? <NodeIcon value={emojiOf(row.node)} size={15} fallback={<Icon name={iconOf(row.node)} size={15} className="shrink-0" />} />
                : <Icon name={iconOf(row.node)} size={secHead ? 13 : 15} className={`shrink-0 ${known && !secHead ? '' : 'text-muted'}`} />}
            </span>
    
            {isRenaming ? (
                // 🔑 공통 InlineRename(Enter·Esc·blur·한글 조합 Enter 무시) — 줄의 드래그·두 번 누르기는 감싼 칸에서 막는다
                <span className="flex-1 min-w-0 flex" onDoubleClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                    <InlineRename
                        key={`${row.id}:${renameInitial ?? ''}`}
                        value={renameInitial ?? row.node.name}
                        placeholder={renamePlaceholder ?? undefined}
                        raw={renameKind !== 'name'}
                        className="flex-1 !h-auto text-body leading-none py-0.5"
                        onCommit={commitRename}
                        onCancel={cancelRename}
                    />
                </span>
            ) : (
                secHead ? (
                    <span className="flex-1 min-w-0 truncate text-small leading-none text-muted">
                        {row.node.name} ({row.node.children.length})
                    </span>
                ) : (
                    <span className={`flex-1 min-w-0 truncate text-body leading-none ${known ? 'text-text' : 'text-muted'}`}>
                        {row.node.name}
                    </span>
                )
            )}
    
            {/* ⋯ 단추 — 올렸을 때(모바일은 늘) 오른쪽 끝에. 누르면 우클릭과 같은 메뉴를 그 자리에(메뉴 코드는 하나) */}
            {!isRenaming && (hovered || narrow) && (
                <IconButton
                    icon="dots"
                    label="메뉴"
                    size={14}
                    onClick={(e) => {
                        e.stopPropagation();
                        h.menuAt(row.id, (e.currentTarget as HTMLElement).getBoundingClientRect());
                    }}
                />
            )}
        </div>
    );
}

export const RowItem = memo(RowItemImpl);
