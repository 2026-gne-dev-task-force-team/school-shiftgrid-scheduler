/**
 * `/` 메뉴(명세 요구 5) — 빈 줄에서 `/` 를 치면 블록을 고른다. 한글 이름 · 거르기 · 방향키·Enter.
 *   그리기만 한다(고르는 키 처리는 PageView 가 쥔다 — 편집창 키와 한 곳에서).
 */
import { useEffect, useRef } from 'react';
import { Icon, type IconName } from '../../../pane-ui-system';
import type { BlockType } from '../core/types';

export interface SlashItem {
    type: BlockType;
    label: string;
    /** 거르기용 글자(한글·영문). */
    hint: string;
    icon: IconName;
}

/** 고를 수 있는 블록 — `/표` 로 표까지(명세 요구 5). */
export const SLASH_ITEMS: SlashItem[] = [
    { type: 'paragraph', label: '글', hint: 'text 글 문단', icon: 'text' },
    { type: 'heading1', label: '제목 1', hint: 'h1 제목', icon: 'heading1' },
    { type: 'heading2', label: '제목 2', hint: 'h2 제목', icon: 'heading2' },
    { type: 'heading3', label: '제목 3', hint: 'h3 제목', icon: 'heading3' },
    { type: 'bulleted', label: '글머리표 목록', hint: 'bullet 목록 글머리', icon: 'list' },
    { type: 'numbered', label: '번호 목록', hint: 'number 번호 목록', icon: 'listNumbered' },
    { type: 'todo', label: '체크 목록', hint: 'todo check 체크 할일', icon: 'check' },
    { type: 'quote', label: '인용', hint: 'quote 인용', icon: 'quote' },
    { type: 'code', label: '코드', hint: 'code 코드', icon: 'code' },
    { type: 'divider', label: '구분선', hint: 'divider line 구분선', icon: 'divider' },
    { type: 'table', label: '표', hint: 'table 표', icon: 'table' },
    { type: 'node', label: '항목 끼워 넣기', hint: 'node embed link 노드 끼우기 링크 페이지 시트', icon: 'fileText' },
];

/** query(/ 뒤 글자)로 거른 항목. */
export function filterSlash(query: string): SlashItem[] {
    const q = query.trim().toLowerCase();
    if (q === '') return SLASH_ITEMS;
    return SLASH_ITEMS.filter((it) => it.label.toLowerCase().includes(q) || it.hint.toLowerCase().includes(q));
}

export function SlashMenu({ items, active, onPick }: {
    items: SlashItem[];
    active: number;
    onPick: (type: BlockType) => void;
}) {
    const listRef = useRef<HTMLDivElement>(null);
    // 방향키로 고른 항목이 늘 보이게 — 가장자리에 닿을 때만 최소로 굴린다
    useEffect(() => {
        const el = listRef.current?.querySelector<HTMLElement>(`[data-slash-index="${active}"]`);
        el?.scrollIntoView?.({ block: 'nearest' });
    }, [active, items.length]);
    if (items.length === 0) {
        return (
            <div className="absolute z-20 mt-1 w-56 rounded-md border border-line bg-panel shadow-lg p-2 text-[12px] text-muted">
                맞는 블록이 없어요.
            </div>
        );
    }
    return (
        <div
            ref={listRef}
            role="listbox"
            aria-label="블록 고르기"
            // 휠은 메뉴 안에서만 굴린다(페이지 스크롤로 새지 않게) — 높이 상한 안에서
            onWheel={(e) => e.stopPropagation()}
            className="absolute z-20 mt-1 w-56 rounded-md border border-line bg-panel shadow-lg py-1 max-h-72 overflow-y-auto overscroll-contain"
        >
            {items.map((it, i) => (
                <button
                    type="button"
                    key={it.type}
                    data-slash-index={i}
                    // 🔴 마우스다운으로 — 편집창 blur 보다 먼저 잡아 포커스가 안 날아간다.
                    onMouseDown={(e) => { e.preventDefault(); onPick(it.type); }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] ${i === active ? 'bg-text/[0.06] text-text' : 'text-muted hover:text-text'}`}
                >
                    <Icon name={it.icon} size={14} />
                    {it.label}
                </button>
            ))}
        </div>
    );
}
